import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const testDataRoot = path.resolve(process.cwd(), "security-audit/test-data");
  await fs.mkdir(testDataRoot, { recursive: true });
  const testRoot = await fs.mkdtemp(path.join(testDataRoot, "commercial-pricing-"));
  process.env.PRODUCT_PRICING_PATH = path.join(testRoot, "pricing.json");

  const {
    annualSavingsPercent,
    getCommercialPlanPrice,
    getCommercialPricing,
    updateCommercialPricing,
  } = await import("./commercialPricing.service");

  const defaults = await getCommercialPricing();
  assert.equal(defaults.plans.plus.monthly, 49_900);
  assert.equal(defaults.plans.plus.yearly, 508_980);
  assert.equal(defaults.plans.pro.monthly, 99_900);
  assert.equal(defaults.plans.pro.yearly, 1_018_980);
  assert.equal(defaults.plans.max.monthly, 1_000_000);
  assert.equal(defaults.plans.max.yearly, 10_200_000);
  assert.equal(annualSavingsPercent(defaults.plans.plus.monthly, defaults.plans.plus.yearly), 15);

  const updated = await updateCommercialPricing({
    plans: {
      plus: { monthly: 59_900, yearly: 610_000 },
      pro: { monthly: 119_900, yearly: 1_220_000 },
      max: { monthly: 1_100_000, yearly: 11_000_000 },
    },
    advocatePrep: { oneTime: 449_900 },
  });
  assert.equal(updated.plans.plus.yearly, 610_000);
  assert.equal(await getCommercialPlanPrice("plus", "monthly"), 59_900);
  assert.equal(await getCommercialPlanPrice("plus", "yearly"), 610_000);
  assert.equal(await getCommercialPlanPrice("max", "monthly"), 1_100_000);
  assert.equal(await getCommercialPlanPrice("max", "yearly"), 11_000_000);
  assert.equal(await getCommercialPlanPrice("advocate", "one_time"), 449_900);
  const { getPaymentPlanQuote } = await import("../payments/razorpay.service");
  assert.equal((await getPaymentPlanQuote("plus", "yearly")).baseAmount, 610_000);
  assert.equal((await getPaymentPlanQuote("pro", "monthly")).baseAmount, 119_900);
  assert.equal((await getPaymentPlanQuote("max", "monthly")).baseAmount, 1_100_000);

  const persisted = JSON.parse(await fs.readFile(process.env.PRODUCT_PRICING_PATH, "utf8")) as { plans: { pro: { yearly: number }; max: { yearly: number } } };
  assert.equal(persisted.plans.pro.yearly, 1_220_000);
  assert.equal(persisted.plans.max.yearly, 11_000_000);
  await assert.rejects(
    () => updateCommercialPricing({ plans: { plus: { monthly: 0 } } }),
    /Plus monthly price/,
  );

  await fs.rm(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  console.log("Commercial monthly/annual pricing contract: PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Commercial pricing test failed");
  process.exitCode = 1;
});
