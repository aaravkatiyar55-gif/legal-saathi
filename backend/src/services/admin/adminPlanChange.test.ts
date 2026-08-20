import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const originalCwd = process.cwd();
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "legal-saathi-admin-plan-sync-"));
  const ledgerPath = path.join(testRoot, "ledger.json");
  Object.assign(process.env, {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "development",
    PRODUCT_LEDGER_BACKEND: "local",
    PRODUCT_LEDGER_PATH: ledgerPath,
    OPENROUTER_API_KEY: "synthetic-provider-key",
    OPENROUTER_FREE_ONLY: "false",
    MODEL_AUTO_ID: "fixture/auto",
    MODEL_FAST_ID: "fixture/fast",
    MODEL_FLASH_ID: "fixture/flash",
    MODEL_PRO_ID: "fixture/pro",
    MODEL_ULTRA_ID: "fixture/ultra",
  });
  process.chdir(testRoot);

  try {
    const { ensurePreviewProfile, listPreviewAdminEvents, updatePreviewProfile } = await import("../local/previewAccess.service");
    const { grantTopUp } = await import("../billing/creditLedger.service");
    const { getPlanState } = await import("../billing/planState.service");
    const { setOpenRouterCatalogForTests } = await import("../ai/openRouterCatalog.service");
    const { AdminPlanChangeError, changeUserPlanAsAdmin, presentAdminUserWithAuthoritativePlan } = await import("./adminPlanChange.service");
    setOpenRouterCatalogForTests([
      { id: "fixture/fast", zeroCost: true },
      { id: "fixture/flash", zeroCost: true },
      { id: "fixture/pro", zeroCost: true, supportsReasoning: true },
      { id: "fixture/ultra", zeroCost: true, supportsReasoning: true },
    ]);

    const email = "plan-sync-user@example.test";
    await ensurePreviewProfile({ email, displayName: "Synthetic Plan User", provider: "development" });

    const transitions = [
      ["plus", 1_000, false],
      ["pro", 3_000, true],
      ["max", 10_000, true],
    ] as const;
    for (const [planId, included, ultraAllowed] of transitions) {
      const changed = await changeUserPlanAsAdmin({
        targetEmail: email,
        requestedPlan: planId,
        adminEmail: "admin@example.test",
        requestId: `admin_${planId}_transition_001`,
      });
      assert.equal(changed.planState.plan.id, planId);
      assert.equal(changed.planState.balances.included.total, included);
      assert.equal(changed.planState.balances.included.remaining, included);
      assert.equal(changed.modelEntitlements.allowedModels.includes("ultra"), ultraAllowed);
      assert.ok(new Date(changed.planState.plan.cycleEndsAt).getTime() > new Date(changed.planState.plan.cycleStartedAt).getTime());
    }

    await grantTopUp({ email, units: 500, paymentId: "synthetic_topup_plan_sync_001", bootstrapTier: "max" });
    const downgraded = await changeUserPlanAsAdmin({
      targetEmail: email,
      requestedPlan: "plus",
      adminEmail: "admin@example.test",
      requestId: "admin_max_to_plus_001",
    });
    assert.equal(downgraded.planState.plan.id, "plus");
    assert.equal(downgraded.planState.balances.included.remaining, 1_000);
    assert.equal(downgraded.planState.balances.purchased.remaining, 500);
    assert.equal(downgraded.modelEntitlements.allowedModels.includes("ultra"), false);

    const free = await changeUserPlanAsAdmin({
      targetEmail: email,
      requestedPlan: "free",
      adminEmail: "admin@example.test",
      requestId: "admin_plus_to_free_001",
    });
    assert.equal(free.planState.balances.included.remaining, 100);
    assert.equal(free.planState.balances.purchased.remaining, 500);
    assert.equal(free.modelEntitlements.allowedModels.includes("pro"), false);
    assert.equal(free.modelEntitlements.allowedModels.includes("ultra"), false);

    await updatePreviewProfile(email, { tier: "advocate" });
    const authoritative = await presentAdminUserWithAuthoritativePlan({ email, tier: "advocate" });
    assert.equal(authoritative.activePlan, "free");
    assert.equal(authoritative.tier, "free");

    const refreshed = await getPlanState(email, "advocate");
    assert.equal(refreshed.plan.id, "free");
    assert.equal(refreshed.balances.purchased.remaining, 500);

    setOpenRouterCatalogForTests([
      { id: "fixture/fast", zeroCost: true },
      { id: "fixture/flash", zeroCost: true },
    ]);
    const entitledButUnconfigured = await getPlanState("unconfigured-pro@example.test", "pro");
    assert.deepEqual(entitledButUnconfigured.entitlements.allowedModels, ["auto", "fast", "flash", "pro", "ultra"]);
    assert.equal(entitledButUnconfigured.entitlements.configuredModels.includes("pro"), false);
    assert.equal(entitledButUnconfigured.entitlements.configuredModels.includes("ultra"), false);

    await assert.rejects(
      () => changeUserPlanAsAdmin({ targetEmail: email, requestedPlan: "free", adminEmail: "admin@example.test", requestId: "same_plan_test_001" }),
      (error: unknown) => error instanceof AdminPlanChangeError && error.code === "SAME_PLAN",
    );
    await assert.rejects(
      () => changeUserPlanAsAdmin({ targetEmail: "missing@example.test", requestedPlan: "plus", adminEmail: "admin@example.test", requestId: "missing_user_test_001" }),
      (error: unknown) => error instanceof AdminPlanChangeError && error.code === "USER_NOT_FOUND",
    );

    const events = await listPreviewAdminEvents();
    assert.equal(events.some((event) => event.id === "admin_max_to_plus_001" && event.action === "plan_change"), true);
    console.log("Authoritative admin plan transitions, stale-mirror rejection, top-up preservation, and audit: PASS");
  } finally {
    process.chdir(originalCwd);
await fs.rm(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Admin plan synchronization test failed");
  process.exitCode = 1;
});
