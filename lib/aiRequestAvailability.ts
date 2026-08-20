import type { LegalAiModel } from "@/lib/types";

export type AiProviderAvailability = {
  auto: "unknown" | "available" | "payment_required" | "unavailable" | "rate_limited";
  explicit: "unknown" | "available" | "payment_required" | "unavailable" | "not_configured" | "rate_limited";
};

export type AiRequestAvailability = {
  available: boolean;
  state: "available" | "checking" | "unavailable";
  message?: string;
};

export function getAiSubmitAction(isAuthenticated: boolean) {
  return isAuthenticated ? "send" : "sign_in";
}

export function canRefreshAiRequestStatus(input: {
  availability: AiRequestAvailability;
  planStateError: string;
  planStateLoading: boolean;
}) {
  if (input.planStateLoading) return false;
  return Boolean(input.planStateError) || input.availability.state === "checking";
}

export function getAiRequestAvailability(
  providerAvailability: AiProviderAvailability | undefined,
  model: LegalAiModel,
): AiRequestAvailability {
  const state = model === "auto" ? providerAvailability?.auto : providerAvailability?.explicit;

  if (state === "rate_limited") {
    return { available: false, state: "unavailable", message: "This service is busy. Please wait before trying again." };
  }
  if (state === "payment_required") {
    return { available: false, state: "unavailable", message: "The selected AI service needs an available provider budget before it can continue." };
  }
  if (state === "unavailable" || state === "not_configured") {
    return { available: false, state: "unavailable", message: "The selected AI service could not complete this request right now." };
  }

  // Do not send a legal request until the current provider state is known.
  // A first-render request used to race the plan-state bootstrap and could
  // reach the backend as an avoidable generic failure. The caller keeps the
  // draft intact and shows a translated inline status instead.
  if (state === undefined || state === "unknown") {
    return {
      available: false,
      state: "checking",
      message: "Checking whether the selected AI service is ready. Please wait a moment.",
    };
  }

  return { available: true, state: "available" };
}
