import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const testDataRoot = path.resolve(process.cwd(), "security-audit/test-data");
  await fs.mkdir(testDataRoot, { recursive: true });
  const testRoot = await fs.mkdtemp(path.join(testDataRoot, "product-ledger-"));
  const ledgerPath = path.join(testRoot, "ledger.json");
  Object.assign(process.env, {
    NODE_ENV: "test",
    PRODUCT_LEDGER_BACKEND: "local",
    PRODUCT_LEDGER_PATH: ledgerPath,
  });
  const { estimateRequestUnits, getPublicProductCatalog, PRODUCT_PLANS } = await import("../../config/productPolicy");
  const { finalizeRequestUnits, getPlanAccount, grantPlan, grantTopUp, refundRequestUnits, reserveRequestUnits } = await import("./creditLedger.service");

  assert.equal(PRODUCT_PLANS.free.includedUnits, 100);
  assert.equal(PRODUCT_PLANS.plus.includedUnits, 1_000);
  assert.equal(PRODUCT_PLANS.pro.includedUnits, 3_000);
  assert.equal(PRODUCT_PLANS.max.includedUnits, 10_000);
  assert.deepEqual(PRODUCT_PLANS.free.allowedModels, ["auto", "fast", "flash"]);
  assert.deepEqual(PRODUCT_PLANS.plus.allowedModels, ["auto", "fast", "flash", "pro"]);
  assert.deepEqual(PRODUCT_PLANS.pro.allowedModels, ["auto", "fast", "flash", "pro", "ultra"]);
  assert.equal(PRODUCT_PLANS.max.adminOnly, false);
  assert.equal(PRODUCT_PLANS.max.purchasable, true);
  assert.equal(PRODUCT_PLANS.max.pricePaise, 1_000_000);
  assert.equal(PRODUCT_PLANS.pro.usageWindows.ultraChats.limit, 10);
  assert.equal(PRODUCT_PLANS.free.allowsWeb, true);
  assert.equal(PRODUCT_PLANS.free.usageWindows.webSearches.limit, 10);
  assert.equal(PRODUCT_PLANS.free.usageWindows.webSearches.windowMs, 30 * 24 * 60 * 60 * 1000);
  assert.equal(PRODUCT_PLANS.plus.usageWindows.webSearches.limit, 20);
  assert.equal(PRODUCT_PLANS.plus.usageWindows.webSearches.windowMs, 7 * 24 * 60 * 60 * 1000);
  assert.equal(PRODUCT_PLANS.pro.usageWindows.webSearches.limit, 50);
  assert.equal(estimateRequestUnits({ model: "fast" }).totalUnits, 1);
  assert.equal(estimateRequestUnits({ model: "flash", speed: "2x" }).totalUnits, 3);
  assert.equal(estimateRequestUnits({ model: "pro", thinkingMode: "default" }).thinkingMode, "default");
  assert.equal(estimateRequestUnits({ model: "pro", thinkingMode: "standard" }).thinkingMode, "standard");
  assert.equal(estimateRequestUnits({ model: "pro", thinkingMode: "extended", speed: "1.5x", webEnabled: true, contextCharacters: 10_001 }).totalUnits, 21);
  assert.equal(estimateRequestUnits({ model: "ultra", contextCharacters: 100_000 }).contextUnits, 6);
  const catalog = getPublicProductCatalog({
    topUpsEnabled: false,
    pricing: {
      plans: {
        plus: { monthly: 49_900, yearly: 508_980 },
        pro: { monthly: 99_900, yearly: 1_018_980 },
        max: { monthly: 1_000_000, yearly: 10_200_000 },
      },
      advocatePrep: { oneTime: 399_900 },
    },
  });
  assert.equal(catalog.plans.find((plan) => plan.id === "plus")?.annualSavingsPercent, 15);
  assert.equal(catalog.plans.find((plan) => plan.id === "pro")?.billingPrices.yearly, 1_018_980);
  assert.equal(catalog.plans.find((plan) => plan.id === "max")?.billingPrices.yearly, 10_200_000);

  const email = "synthetic-plan-user@example.test";
  const free = await getPlanAccount(email, "free");
  assert.equal(free.includedUnitsRemaining, 100);

  await grantPlan({ email, planId: "plus", source: "admin", referenceId: "admin_grant_test_001" });
  const topUp = await grantTopUp({ email, units: 500, paymentId: "pay_test_topup_001", bootstrapTier: "plus" });
  assert.equal(topUp.purchasedUnitsRemaining, 500);

  const annualEmail = "synthetic-annual-user@example.test";
  const annual = await grantPlan({ email: annualEmail, planId: "pro", source: "payment", referenceId: "annual_plan_test_001", durationDays: 365 });
  const annualDurationDays = Math.round((new Date(annual.planExpiresAt).getTime() - new Date(annual.planStartedAt).getTime()) / (24 * 60 * 60 * 1000));
  const annualCycleDays = Math.round((new Date(annual.cycleEndsAt).getTime() - new Date(annual.cycleStartedAt).getTime()) / (24 * 60 * 60 * 1000));
  assert.equal(annualDurationDays, 365);
  assert.equal(annualCycleDays, 30);

  const metadata = {
    requestId: "request_units_test_001",
    requestFingerprint: "synthetic-request-fingerprint-001",
    selectedModel: "pro" as const,
    resolvedModel: "pro" as const,
    thinkingMode: "standard" as const,
    speed: "1x" as const,
    webEnabled: false,
    contextUsed: false,
    contextCharacters: 0,
  };
  const reserved = await reserveRequestUnits({ email, bootstrapTier: "plus", estimatedUnits: 10, metadata });
  assert.equal(reserved.account.includedUnitsRemaining, 990);
  const finalized = await finalizeRequestUnits({ email, requestId: metadata.requestId, actualUnits: 6 });
  assert.equal(finalized.account.includedUnitsRemaining, 994);
  const finalizedAgain = await finalizeRequestUnits({ email, requestId: metadata.requestId, actualUnits: 6 });
  assert.equal(finalizedAgain.idempotent, true);

  const refundId = "request_units_test_002";
  await reserveRequestUnits({ email, bootstrapTier: "plus", estimatedUnits: 9, metadata: { ...metadata, requestId: refundId } });
  const refunded = await refundRequestUnits({ email, requestId: refundId, outcome: "provider_failure" });
  assert.equal(refunded?.account.includedUnitsRemaining, 994);
  const refundedAgain = await refundRequestUnits({ email, requestId: refundId, outcome: "provider_failure" });
  assert.equal(refundedAgain?.idempotent, true);

  const replayEmail = "synthetic-replay-user@example.test";
  await getPlanAccount(replayEmail, "free");
  const replayMetadata = {
    ...metadata,
    requestId: "request_units_replay_001",
    requestFingerprint: "synthetic-request-fingerprint-replay-001",
  };
  await reserveRequestUnits({ email: replayEmail, bootstrapTier: "free", estimatedUnits: 5, metadata: replayMetadata });
  await refundRequestUnits({ email: replayEmail, requestId: replayMetadata.requestId, outcome: "provider_failure" });
  const parallelRetry = await Promise.all([
    reserveRequestUnits({ email: replayEmail, bootstrapTier: "free", estimatedUnits: 5, metadata: replayMetadata }),
    reserveRequestUnits({ email: replayEmail, bootstrapTier: "free", estimatedUnits: 5, metadata: replayMetadata }),
  ]);
  assert.equal(parallelRetry.filter((result) => result.idempotent === false).length, 1);
  assert.equal(parallelRetry.filter((result) => result.idempotent === true).length, 1);
  assert.equal((await getPlanAccount(replayEmail, "free")).includedUnitsRemaining, 95);
  await finalizeRequestUnits({ email: replayEmail, requestId: replayMetadata.requestId, actualUnits: 3 });
  const settledReplay = await reserveRequestUnits({ email: replayEmail, bootstrapTier: "free", estimatedUnits: 5, metadata: replayMetadata });
  assert.equal(settledReplay.idempotent, true);
  assert.equal(settledReplay.reservation?.status, "finalized");
  assert.equal(settledReplay.account.includedUnitsRemaining, 97);

  await fs.rm(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  console.log("Product policy and atomic unit ledger: PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Product policy test failed");
  process.exitCode = 1;
});
