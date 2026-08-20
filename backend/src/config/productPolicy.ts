export const PRODUCT_CATALOG_VERSION = "2026-07-28-v4";
export const PLAN_CYCLE_DAYS = 30;

export type ProductPlanId = "free" | "plus" | "pro" | "max";
export type LegacyProductTier = ProductPlanId | "advocate";
export type ProductModelClass = "auto" | "fast" | "flash" | "pro" | "ultra";
export type ProductThinkingMode = "default" | "standard" | "extended";
export type ProductSpeed = "1x" | "1.5x" | "2x";
export type ProductUsageFeature = "chat" | "caseFolders" | "proChats" | "ultraChats" | "webSearches";

type UsageWindow = { limit: number; windowMs: number };

export type ProductPlanPolicy = {
  id: ProductPlanId;
  name: string;
  rank: number;
  pricePaise: number | null;
  billingCycle: "monthly" | "admin_grant";
  cycleDays: number;
  includedUnits: number;
  paid: boolean;
  purchasable: boolean;
  adminOnly: boolean;
  allowsTopUps: boolean;
  allowsWeb: boolean;
  allowedModels: ProductModelClass[];
  usageWindows: Record<ProductUsageFeature, UsageWindow>;
  uiActions: Array<"upgrade" | "topup" | "manage" | "advocate_prep">;
};

const hour = 60 * 60 * 1000;
const day = 24 * hour;

export const PRODUCT_PLANS: Record<ProductPlanId, ProductPlanPolicy> = {
  free: {
    id: "free",
    name: "Free",
    rank: 0,
    pricePaise: 0,
    billingCycle: "monthly",
    cycleDays: PLAN_CYCLE_DAYS,
    includedUnits: 100,
    paid: false,
    purchasable: false,
    adminOnly: false,
    allowsTopUps: false,
    allowsWeb: true,
    allowedModels: ["auto", "fast", "flash"],
    usageWindows: {
      chat: { limit: 10, windowMs: day },
      caseFolders: { limit: 1, windowMs: PLAN_CYCLE_DAYS * day },
      proChats: { limit: 0, windowMs: 5 * hour },
      ultraChats: { limit: 0, windowMs: 5 * hour },
      webSearches: { limit: 10, windowMs: PLAN_CYCLE_DAYS * day },
    },
    uiActions: ["upgrade"],
  },
  plus: {
    id: "plus",
    name: "Plus",
    rank: 1,
    pricePaise: 49_900,
    billingCycle: "monthly",
    cycleDays: PLAN_CYCLE_DAYS,
    includedUnits: 1_000,
    paid: true,
    purchasable: true,
    adminOnly: false,
    allowsTopUps: true,
    allowsWeb: true,
    allowedModels: ["auto", "fast", "flash", "pro"],
    usageWindows: {
      chat: { limit: 30, windowMs: day },
      caseFolders: { limit: 2, windowMs: 7 * day },
      proChats: { limit: 30, windowMs: 5 * hour },
      ultraChats: { limit: 0, windowMs: 5 * hour },
      webSearches: { limit: 20, windowMs: 7 * day },
    },
    uiActions: ["topup", "manage", "upgrade", "advocate_prep"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    rank: 2,
    pricePaise: 99_900,
    billingCycle: "monthly",
    cycleDays: PLAN_CYCLE_DAYS,
    includedUnits: 3_000,
    paid: true,
    purchasable: true,
    adminOnly: false,
    allowsTopUps: true,
    allowsWeb: true,
    allowedModels: ["auto", "fast", "flash", "pro", "ultra"],
    usageWindows: {
      chat: { limit: 50, windowMs: 2 * hour },
      caseFolders: { limit: 4, windowMs: 7 * day },
      proChats: { limit: 50, windowMs: 3 * hour },
      ultraChats: { limit: 10, windowMs: 5 * hour },
      webSearches: { limit: 50, windowMs: 7 * day },
    },
    uiActions: ["topup", "manage", "advocate_prep"],
  },
  max: {
    id: "max",
    name: "Max",
    rank: 3,
    pricePaise: 1_000_000,
    billingCycle: "monthly",
    cycleDays: PLAN_CYCLE_DAYS,
    includedUnits: 10_000,
    paid: true,
    purchasable: true,
    adminOnly: false,
    allowsTopUps: true,
    allowsWeb: true,
    allowedModels: ["auto", "fast", "flash", "pro", "ultra"],
    usageWindows: {
      chat: { limit: 100, windowMs: hour },
      caseFolders: { limit: 10, windowMs: 7 * day },
      proChats: { limit: 100, windowMs: 3 * hour },
      ultraChats: { limit: 40, windowMs: 5 * hour },
      webSearches: { limit: 100, windowMs: 7 * day },
    },
    uiActions: ["topup", "manage", "advocate_prep"],
  },
};

export const PRODUCT_MODELS: Record<ProductModelClass, {
  id: ProductModelClass;
  name: string;
  baseUnits: number;
  supportsThinking: boolean;
  supportsSpeed: boolean;
  maxOutputTokens: number;
  description: string;
}> = {
  auto: { id: "auto", name: "Auto", baseUnits: 1, supportsThinking: false, supportsSpeed: true, maxOutputTokens: 1_200, description: "Chooses an entitled configured model for the request." },
  fast: { id: "fast", name: "Fast", baseUnits: 1, supportsThinking: false, supportsSpeed: false, maxOutputTokens: 700, description: "Fastest concise replies with the lowest unit cost." },
  flash: { id: "flash", name: "Flash", baseUnits: 2, supportsThinking: false, supportsSpeed: true, maxOutputTokens: 1_200, description: "Fast replies with balanced reasoning." },
  pro: { id: "pro", name: "Pro", baseUnits: 6, supportsThinking: true, supportsSpeed: true, maxOutputTokens: 1_800, description: "Stronger reasoning with a rolling message window." },
  ultra: { id: "ultra", name: "Ultra", baseUnits: 15, supportsThinking: true, supportsSpeed: true, maxOutputTokens: 2_500, description: "Highest configured reasoning class and unit cost." },
};

export const ADVOCATE_PREP_ADDON = {
  id: "advocate_prep" as const,
  name: "Advocate Prep",
  pricePaise: 399_900,
  billingCycle: "one_time" as const,
  unit: "case" as const,
  purchasable: true,
};

export const TEST_TOP_UP_PACKAGES = {
  units_500: { id: "units_500", units: 500, pricePaise: 9_900 },
  units_2000: { id: "units_2000", units: 2_000, pricePaise: 29_900 },
  units_5000: { id: "units_5000", units: 5_000, pricePaise: 59_900 },
} as const;

export type TestTopUpPackageId = keyof typeof TEST_TOP_UP_PACKAGES;

export const CUSTOM_TOP_UP_POLICY = {
  id: "custom" as const,
  minAmountPaise: 10_000,
  maxAmountPaise: 1_000_000,
  amountStepPaise: 100,
  unitsPerRupee: 5,
};

export function normalizeProductPlan(value: unknown): ProductPlanId {
  const plan = String(value ?? "").trim().toLowerCase();
  if (plan === "plus" || plan === "pro" || plan === "max") return plan;
  return plan === "advocate" ? "max" : "free";
}

export function toLegacyProductTier(plan: ProductPlanId): "free" | "plus" | "pro" | "advocate" {
  return plan === "max" ? "advocate" : plan;
}

export function hasProductPlanAccess(plan: ProductPlanId, required: ProductPlanId) {
  return PRODUCT_PLANS[plan].rank >= PRODUCT_PLANS[required].rank;
}

export function planAllowsModel(plan: ProductPlanId, model: ProductModelClass) {
  return PRODUCT_PLANS[plan].allowedModels.includes(model);
}

export function normalizeProductSpeed(value: unknown): ProductSpeed {
  if (value === "1.5x" || value === "2x") return value;
  return "1x";
}

export function normalizeProductThinking(value: unknown): ProductThinkingMode {
  return value === "extended" ? "extended" : value === "standard" ? "standard" : "default";
}

export function estimateRequestUnits(input: {
  model: ProductModelClass;
  thinkingMode?: unknown;
  speed?: unknown;
  webEnabled?: boolean;
  contextCharacters?: number;
}) {
  const modelPolicy = PRODUCT_MODELS[input.model];
  const thinkingMode = modelPolicy.supportsThinking ? normalizeProductThinking(input.thinkingMode) : "default";
  const speed = modelPolicy.supportsSpeed && input.model !== "fast" ? normalizeProductSpeed(input.speed) : "1x";
  const thinkingMultiplier = thinkingMode === "extended" ? 2 : 1;
  const speedMultiplier = speed === "2x" ? 1.5 : speed === "1.5x" ? 1.25 : 1;
  const modelUnits = Math.ceil(modelPolicy.baseUnits * thinkingMultiplier * speedMultiplier);
  const webUnits = input.webEnabled ? 2 : 0;
  const boundedContextCharacters = Math.max(0, Math.min(40_000, Math.floor(Number(input.contextCharacters) || 0)));
  const contextUnits = boundedContextCharacters > 0
    ? Math.min(6, 3 + Math.ceil(Math.max(0, boundedContextCharacters - 10_000) / 10_000))
    : 0;

  return {
    totalUnits: modelUnits + webUnits + contextUnits,
    modelUnits,
    webUnits,
    contextUnits,
    model: input.model,
    thinkingMode,
    speed,
    boundedContextCharacters,
  };
}

export function getPublicProductCatalog(options: {
  topUpsEnabled: boolean;
  configuredModels?: ProductModelClass[];
  pricing?: {
    plans: Record<"plus" | "pro" | "max", { monthly: number; yearly: number }>;
    advocatePrep: { oneTime: number };
  };
  topUpsCommercialApproved?: boolean;
}) {
  const configuredModels = new Set(options.configuredModels ?? Object.keys(PRODUCT_MODELS) as ProductModelClass[]);
  return {
    version: PRODUCT_CATALOG_VERSION,
    currency: "INR" as const,
    cycleDays: PLAN_CYCLE_DAYS,
    plans: Object.values(PRODUCT_PLANS).map((plan) => {
      const paidPricing = plan.id === "plus" || plan.id === "pro" || plan.id === "max"
        ? options.pricing?.plans[plan.id]
        : null;
      const monthly = paidPricing?.monthly ?? plan.pricePaise;
      const yearly = paidPricing?.yearly ?? (typeof monthly === "number" ? monthly * 12 : null);
      const annualSavingsPercent = typeof monthly === "number" && monthly > 0 && typeof yearly === "number" && yearly < monthly * 12
        ? Math.round((1 - yearly / (monthly * 12)) * 100)
        : 0;
      return {
        id: plan.id,
        name: plan.name,
        pricePaise: monthly,
        billingPrices: { monthly, yearly },
        annualSavingsPercent,
        cycleDays: plan.cycleDays,
        includedUnits: plan.includedUnits,
        paid: plan.paid,
        purchasable: plan.purchasable,
        adminOnly: plan.adminOnly,
        allowsTopUps: plan.allowsTopUps && options.topUpsEnabled,
        allowsWeb: plan.allowsWeb,
        allowedModels: [...plan.allowedModels],
        usageWindows: plan.usageWindows,
        uiActions: plan.uiActions.filter((action) => action !== "topup" || options.topUpsEnabled),
      };
    }),
    models: Object.values(PRODUCT_MODELS).map((model) => ({
      ...model,
      configured: model.id === "auto" || configuredModels.has(model.id),
    })),
    advocatePrep: {
      ...ADVOCATE_PREP_ADDON,
      pricePaise: options.pricing?.advocatePrep.oneTime ?? ADVOCATE_PREP_ADDON.pricePaise,
    },
    topUps: options.topUpsEnabled
      ? Object.values(TEST_TOP_UP_PACKAGES).map((item) => ({
          ...item,
          testModeOnly: !options.topUpsCommercialApproved,
          commercialApproved: Boolean(options.topUpsCommercialApproved),
        }))
      : [],
    customTopUp: options.topUpsEnabled
      ? {
          id: CUSTOM_TOP_UP_POLICY.id,
          minAmountInr: CUSTOM_TOP_UP_POLICY.minAmountPaise / 100,
          maxAmountInr: CUSTOM_TOP_UP_POLICY.maxAmountPaise / 100,
          amountStepInr: CUSTOM_TOP_UP_POLICY.amountStepPaise / 100,
          unitsPerRupee: CUSTOM_TOP_UP_POLICY.unitsPerRupee,
          testModeOnly: !options.topUpsCommercialApproved,
          commercialApproved: Boolean(options.topUpsCommercialApproved),
        }
      : null,
  };
}
