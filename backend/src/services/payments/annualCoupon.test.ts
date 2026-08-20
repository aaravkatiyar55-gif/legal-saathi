import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const originalCwd = process.cwd();
  const testDataRoot = path.resolve(originalCwd, "security-audit/test-data");
  await fs.mkdir(testDataRoot, { recursive: true });
  const testRoot = await fs.mkdtemp(path.join(testDataRoot, "annual-coupon-"));
  process.chdir(testRoot);
  try {
    const { savePreviewCoupon, validatePreviewCoupon } = await import("../local/previewAccess.service");
    await savePreviewCoupon({
      code: "ANNUAL15",
      discountType: "percent",
      discountValue: 15,
      plans: ["plus"],
      billingCycles: ["yearly"],
      active: true,
    });
    const annual = await validatePreviewCoupon({
      code: "ANNUAL15",
      plan: "plus",
      billingCycle: "yearly",
      amount: 508_980,
      email: "annual-coupon@example.test",
    });
    assert.equal(annual.discountAmount, Math.floor(508_980 * 0.15));
    await assert.rejects(
      () => validatePreviewCoupon({
        code: "ANNUAL15",
        plan: "plus",
        billingCycle: "monthly",
        amount: 49_900,
        email: "annual-coupon@example.test",
      }),
      /does not apply to monthly billing/,
    );
    await savePreviewCoupon({
      code: "MAXANNUAL15",
      discountType: "percent",
      discountValue: 15,
      plans: ["max"],
      billingCycles: ["yearly"],
      active: true,
    });
    const maxAnnual = await validatePreviewCoupon({
      code: "MAXANNUAL15",
      plan: "max",
      billingCycle: "yearly",
      amount: 10_200_000,
      email: "max-annual-coupon@example.test",
    });
    assert.equal(maxAnnual.discountAmount, Math.floor(10_200_000 * 0.15));
  } finally {
    process.chdir(originalCwd);
    await fs.rm(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  console.log("Annual coupon billing scope: PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Annual coupon test failed");
  process.exitCode = 1;
});
