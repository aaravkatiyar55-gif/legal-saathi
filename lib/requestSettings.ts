import {
  LegalAiModel,
  RequestConfiguration,
  RequestSpeed,
  SubscriptionPlan,
  ThinkingMode
} from "@/lib/types";

export const DEFAULT_REQUEST_CONFIGURATION: RequestConfiguration = {
  model: "auto",
  thinkingMode: "default",
  speed: "normal"
};

export const MODEL_DETAILS: Record<LegalAiModel, {
  label: string;
  description: string;
  requiredPlan?: SubscriptionPlan;
}> = {
  auto: { label: "Auto", description: "Balances speed and reasoning" },
  fast: { label: "Fast", description: "Low reasoning, optimized for speed" },
  flash: { label: "Flash", description: "Fast with balanced reasoning" },
  pro: { label: "Pro", description: "Good reasoning, slower", requiredPlan: "plus" },
  ultra: { label: "Ultra", description: "Best reasoning, very slow", requiredPlan: "pro" }
};

const planRank: Record<SubscriptionPlan, number> = { free: 0, plus: 1, pro: 2, max: 3 };

export const getPlanLabel = (plan: SubscriptionPlan) => ({
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  max: "Max"
})[plan];

export const hasPlanAccess = (plan: SubscriptionPlan, requiredPlan?: SubscriptionPlan) =>
  !requiredPlan || planRank[plan] >= planRank[requiredPlan];

export const supportsThinkingMode = (model: LegalAiModel) => model === "pro" || model === "ultra";

export const formatResetTime = (timestamp?: number) => {
  if (!timestamp) return "Not scheduled";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(timestamp);
};

export const formatDailyResetTime = (timestamp?: number) => {
  if (!timestamp) return "Not scheduled";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(timestamp);
};
