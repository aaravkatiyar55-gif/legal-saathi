import { env } from "../../config/env";
import {
  getPublicProductCatalog,
  PRODUCT_CATALOG_VERSION,
  PRODUCT_PLANS,
  ProductPlanId,
} from "../../config/productPolicy";
import { getPlanAccount, listUnitTransactions, PlanAccount } from "./creditLedger.service";
import { configuredPublicModelClasses } from "../ai/modelRouting.service";
import { publicProviderAvailability } from "../ai/providerHealth.service";
import { ensureOpenRouterModelCatalog, getOpenRouterModelAvailabilitySnapshot } from "../ai/openRouterCatalog.service";
import { getCommercialPricing } from "./commercialPricing.service";

export function getConfiguredModelClasses() {
  return configuredPublicModelClasses();
}

export function isControlledTopUpEnabled() {
  const controlledEnvironment = env.deploymentEnv === "development" || env.deploymentEnv === "staging";
  return env.topUpTestMode && controlledEnvironment && env.razorpayMode === "test";
}

function hasConfiguredPaymentCredential(value: string) {
  const normalized = value.trim();
  return Boolean(normalized) && !normalized.includes("PASTE_") && normalized !== "replace_later";
}

export function isCommercialTopUpEnabled() {
  return env.topUpCommercialApproved
    && (env.razorpayMode === "test" || env.razorpayMode === "live")
    && hasConfiguredPaymentCredential(env.razorpayKeyId)
    && hasConfiguredPaymentCredential(env.razorpayKeySecret);
}

export function isTopUpEnabled() {
  return isControlledTopUpEnabled() || isCommercialTopUpEnabled();
}

export function currentTopUpMode() {
  if (isCommercialTopUpEnabled()) return "commercial" as const;
  if (isControlledTopUpEnabled()) return "controlled_test" as const;
  return "disabled" as const;
}

export async function getProductCatalog() {
  if (env.aiProvider === "openrouter" && env.openRouterApiKeys.length > 0) {
    await ensureOpenRouterModelCatalog();
  }
  return getPublicProductCatalog({
    topUpsEnabled: isTopUpEnabled(),
    topUpsCommercialApproved: isCommercialTopUpEnabled(),
    configuredModels: getConfiguredModelClasses(),
    pricing: await getCommercialPricing(),
  });
}

function presentPlanState(account: PlanAccount) {
  const policy = PRODUCT_PLANS[account.planId];
  const allowedModels = [...policy.allowedModels];
  const includedUsed = Math.max(0, account.includedUnitsTotal - account.includedUnitsRemaining);
  const totalRemaining = account.includedUnitsRemaining + account.purchasedUnitsRemaining;
  const percentageUsed = account.includedUnitsTotal > 0
    ? Number(((includedUsed / account.includedUnitsTotal) * 100).toFixed(2))
    : 0;
  const modelAvailability = getOpenRouterModelAvailabilitySnapshot();
  return {
    catalogVersion: PRODUCT_CATALOG_VERSION,
    plan: {
      id: account.planId,
      name: policy.name,
      paid: policy.paid,
      highest: account.planId === "max",
      adminOnly: policy.adminOnly,
      expiresAt: account.planExpiresAt,
      cycleStartedAt: account.cycleStartedAt,
      cycleEndsAt: account.cycleEndsAt,
    },
    balances: {
      included: {
        total: account.includedUnitsTotal,
        remaining: account.includedUnitsRemaining,
        used: includedUsed,
        percentageUsed,
      },
      purchased: {
        remaining: account.purchasedUnitsRemaining,
        expiresAt: null,
      },
      totalRemaining,
    },
    entitlements: {
      allowedModels,
      configuredModels: getConfiguredModelClasses(),
      modelAvailability: Object.fromEntries(Object.entries(modelAvailability).map(([model, availability]) => [model, availability.state])),
      modelCapabilities: Object.fromEntries(Object.entries(modelAvailability).map(([model, availability]) => [model, {
        supportsReasoning: availability.supportsReasoning,
        supportsSpeed: availability.supportsSpeed,
      }])),
      providerAvailability: publicProviderAvailability(),
      web: policy.allowsWeb,
      topUps: policy.allowsTopUps && isTopUpEnabled(),
      actions: policy.uiActions.filter((action) => action !== "topup" || isTopUpEnabled()),
      modelWindows: {
        pro: policy.usageWindows.proChats,
        ultra: policy.usageWindows.ultraChats,
        web: policy.usageWindows.webSearches,
      },
    },
    topUpMode: currentTopUpMode(),
  };
}

export async function getPlanState(email: string, profileTier: unknown) {
  if (env.aiProvider === "openrouter" && env.openRouterApiKeys.length > 0) {
    await ensureOpenRouterModelCatalog();
  }
  return presentPlanState(await getPlanAccount(email, profileTier));
}

export async function getPlanStateWithTransactions(email: string, profileTier: unknown, limit = 50) {
  const [planState, transactions] = await Promise.all([
    getPlanState(email, profileTier),
    listUnitTransactions(email, limit),
  ]);
  return { planState, transactions };
}

export function currentPlanIdFromState(value: unknown): ProductPlanId {
  const plan = (value as { plan?: { id?: unknown } } | null)?.plan?.id;
  return plan === "plus" || plan === "pro" || plan === "max" ? plan : "free";
}
