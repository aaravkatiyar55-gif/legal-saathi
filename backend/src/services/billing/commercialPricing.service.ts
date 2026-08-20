import { promises as fs } from "node:fs";
import path from "node:path";
import { ADVOCATE_PREP_ADDON, PRODUCT_PLANS } from "../../config/productPolicy";

export type CommercialPlanId = "plus" | "pro" | "max";
export type CommercialBillingCycle = "monthly" | "yearly";

export type CommercialPricing = {
  version: 1;
  updatedAt: string | null;
  plans: Record<CommercialPlanId, Record<CommercialBillingCycle, number>>;
  advocatePrep: { oneTime: number };
};

const annualDiscountMultiplier = 0.85;
const defaultPricing = (): CommercialPricing => ({
  version: 1,
  updatedAt: null,
  plans: {
    plus: {
      monthly: PRODUCT_PLANS.plus.pricePaise ?? 49_900,
      yearly: Math.round((PRODUCT_PLANS.plus.pricePaise ?? 49_900) * 12 * annualDiscountMultiplier),
    },
    pro: {
      monthly: PRODUCT_PLANS.pro.pricePaise ?? 99_900,
      yearly: Math.round((PRODUCT_PLANS.pro.pricePaise ?? 99_900) * 12 * annualDiscountMultiplier),
    },
    max: {
      monthly: PRODUCT_PLANS.max.pricePaise ?? 1_000_000,
      yearly: Math.round((PRODUCT_PLANS.max.pricePaise ?? 1_000_000) * 12 * annualDiscountMultiplier),
    },
  },
  advocatePrep: { oneTime: ADVOCATE_PREP_ADDON.pricePaise },
});

let mutationQueue: Promise<void> = Promise.resolve();

function pricingPath() {
  const configured = process.env.PRODUCT_PRICING_PATH?.trim();
  return configured ? path.resolve(configured) : path.resolve(process.cwd(), ".local", "commercial-pricing.json");
}

function requirePrice(value: unknown, label: string) {
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount < 100 || amount > 100_000_000) {
    throw new Error(`${label} must be between INR 1 and INR 10,00,000.`);
  }
  return amount;
}

function normalizePricing(value: unknown): CommercialPricing {
  const fallback = defaultPricing();
  const row = value && typeof value === "object" ? value as Partial<CommercialPricing> : {};
  return {
    version: 1,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
    plans: {
      plus: {
        monthly: requirePrice(row.plans?.plus?.monthly ?? fallback.plans.plus.monthly, "Plus monthly price"),
        yearly: requirePrice(row.plans?.plus?.yearly ?? fallback.plans.plus.yearly, "Plus annual price"),
      },
      pro: {
        monthly: requirePrice(row.plans?.pro?.monthly ?? fallback.plans.pro.monthly, "Pro monthly price"),
        yearly: requirePrice(row.plans?.pro?.yearly ?? fallback.plans.pro.yearly, "Pro annual price"),
      },
      max: {
        monthly: requirePrice(row.plans?.max?.monthly ?? fallback.plans.max.monthly, "Max monthly price"),
        yearly: requirePrice(row.plans?.max?.yearly ?? fallback.plans.max.yearly, "Max annual price"),
      },
    },
    advocatePrep: {
      oneTime: requirePrice(row.advocatePrep?.oneTime ?? fallback.advocatePrep.oneTime, "Advocate Prep price"),
    },
  };
}

async function readPricing() {
  try {
    return normalizePricing(JSON.parse(await fs.readFile(pricingPath(), "utf8")));
  } catch {
    return defaultPricing();
  }
}

async function writePricing(pricing: CommercialPricing) {
  const destination = pricingPath();
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(pricing, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporary, destination);
}

export function annualSavingsPercent(monthly: number, yearly: number) {
  const undiscounted = monthly * 12;
  if (undiscounted <= 0 || yearly >= undiscounted) return 0;
  return Math.max(0, Math.min(90, Math.round((1 - yearly / undiscounted) * 100)));
}

export async function getCommercialPricing() {
  return readPricing();
}

export async function updateCommercialPricing(input: unknown) {
  const update = input && typeof input === "object" ? input as Partial<CommercialPricing> : {};
  const run = mutationQueue.then(async () => {
    const current = await readPricing();
    const next = normalizePricing({
      ...current,
      plans: {
        plus: { ...current.plans.plus, ...update.plans?.plus },
        pro: { ...current.plans.pro, ...update.plans?.pro },
        max: { ...current.plans.max, ...update.plans?.max },
      },
      advocatePrep: { ...current.advocatePrep, ...update.advocatePrep },
      updatedAt: new Date().toISOString(),
    });
    await writePricing(next);
    return next;
  });
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

export async function getCommercialPlanPrice(plan: CommercialPlanId | "advocate", billingCycle: CommercialBillingCycle | "one_time") {
  const pricing = await readPricing();
  if (plan === "advocate") {
    return billingCycle === "one_time" ? pricing.advocatePrep.oneTime : null;
  }
  return billingCycle === "monthly" || billingCycle === "yearly"
    ? pricing.plans[plan][billingCycle]
    : null;
}

export function resetCommercialPricingForTests() {
  mutationQueue = Promise.resolve();
}
