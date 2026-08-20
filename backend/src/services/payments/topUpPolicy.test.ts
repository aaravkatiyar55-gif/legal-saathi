import { strict as assert } from "node:assert";

Object.assign(process.env, {
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "staging",
  TOPUP_TEST_MODE: "true",
  TOPUP_COMMERCIAL_APPROVED: "false",
  RAZORPAY_KEY_ID: "rzp_test_syntheticTopUpPolicy",
  RAZORPAY_KEY_SECRET: "synthetic-topup-policy-secret",
});

async function main() {
  const {
    CUSTOM_TOP_UP_POLICY,
    getPublicProductCatalog,
    PRODUCT_PLANS,
  } = await import("../../config/productPolicy");
  const { resolveCustomTopUpPrice } = await import("./razorpay.service");
  const { currentTopUpMode, isTopUpEnabled } = await import("../billing/planState.service");

  assert.equal(PRODUCT_PLANS.max.pricePaise, 1_000_000);
  assert.equal(PRODUCT_PLANS.max.purchasable, true);
  assert.equal(PRODUCT_PLANS.max.adminOnly, false);

  const quote = resolveCustomTopUpPrice(250);
  assert.deepEqual(
    { packageId: quote.packageId, amount: quote.baseAmount, units: quote.units },
    { packageId: "custom", amount: 25_000, units: 1_250 },
  );
  assert.equal(CUSTOM_TOP_UP_POLICY.amountStepPaise, 100);
  assert.throws(() => resolveCustomTopUpPrice(99), /between INR 100 and INR 10000/);
  assert.throws(() => resolveCustomTopUpPrice(250.5), /whole INR amount/);
  assert.throws(() => resolveCustomTopUpPrice(10_001), /between INR 100 and INR 10000/);

  assert.equal(isTopUpEnabled(), true);
  assert.equal(currentTopUpMode(), "controlled_test");

  const catalog = getPublicProductCatalog({
    topUpsEnabled: true,
    topUpsCommercialApproved: false,
    pricing: {
      plans: {
        plus: { monthly: 49_900, yearly: 508_980 },
        pro: { monthly: 99_900, yearly: 1_018_980 },
        max: { monthly: 1_000_000, yearly: 10_200_000 },
      },
      advocatePrep: { oneTime: 399_900 },
    },
  });
  assert.deepEqual(catalog.plans.map((plan) => plan.id), ["free", "plus", "pro", "max"]);
  assert.deepEqual(catalog.topUps.map((item) => [item.units, item.pricePaise]), [
    [500, 9_900],
    [2_000, 29_900],
    [5_000, 59_900],
  ]);
  assert.equal(catalog.customTopUp?.minAmountInr, 100);
  assert.equal(catalog.customTopUp?.maxAmountInr, 10_000);
  assert.equal(catalog.customTopUp?.unitsPerRupee, 5);

  console.log("Max pricing and custom top-up policy: PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Top-up policy test failed");
  process.exitCode = 1;
});
