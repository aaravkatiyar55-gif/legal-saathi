import {
  hasProductPlanAccess,
  normalizeProductPlan,
  PRODUCT_MODELS,
  PRODUCT_PLANS,
  ProductModelClass,
  ProductPlanId,
  ProductUsageFeature,
  toLegacyProductTier,
} from "./productPolicy";

export type PreviewPlan = ProductPlanId;
export type PreviewModel = ProductModelClass;
export type PreviewUsageFeature = ProductUsageFeature;

export const PLAN_RANK: Record<PreviewPlan, number> = Object.fromEntries(
  Object.values(PRODUCT_PLANS).map((plan) => [plan.id, plan.rank]),
) as Record<PreviewPlan, number>;

export const MODEL_POLICY: Record<PreviewModel, {
  label: string;
  minimumPlan: PreviewPlan;
  supportsThinking: boolean;
  supportsSpeed: boolean;
  creditNote: string;
}> = Object.fromEntries(Object.values(PRODUCT_MODELS).map((model) => {
  const minimumPlan = Object.values(PRODUCT_PLANS)
    .sort((left, right) => left.rank - right.rank)
    .find((plan) => plan.allowedModels.includes(model.id))?.id ?? "max";
  return [model.id, {
    label: model.name,
    minimumPlan,
    supportsThinking: model.supportsThinking,
    supportsSpeed: model.supportsSpeed,
    creditNote: model.description,
  }];
})) as Record<PreviewModel, {
  label: string;
  minimumPlan: PreviewPlan;
  supportsThinking: boolean;
  supportsSpeed: boolean;
  creditNote: string;
}>;

export const PLAN_USAGE_LIMITS: Record<PreviewPlan, Record<PreviewUsageFeature, { limit: number; windowMs: number }>> = Object.fromEntries(
  Object.values(PRODUCT_PLANS).map((plan) => [plan.id, plan.usageWindows]),
) as Record<PreviewPlan, Record<PreviewUsageFeature, { limit: number; windowMs: number }>>;

export function toPreviewPlan(tier: string | null | undefined): PreviewPlan {
  return normalizeProductPlan(tier);
}

export function toBackendTier(plan: PreviewPlan): "free" | "plus" | "pro" | "advocate" {
  return toLegacyProductTier(plan);
}

export function hasPlanAccess(plan: PreviewPlan, required: PreviewPlan) {
  return hasProductPlanAccess(plan, required);
}
