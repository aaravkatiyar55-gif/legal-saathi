import { env } from "../../config/env";
import { isMeshConfigured } from "./meshProvider";
import { isOpenRouterConfigured } from "./openRouterProvider";

export type ApprovedAiProvider = "openrouter" | "mesh";
export type ProviderAvailability = "unknown" | "available" | "payment_required" | "rate_limited" | "unavailable";

type MutableProviderHealth = {
  availability: ProviderAvailability;
  reachable: boolean | null;
  lastSafeCheckAt: string | null;
};

const health: Record<ApprovedAiProvider, MutableProviderHealth> = {
  openrouter: { availability: "unknown", reachable: null, lastSafeCheckAt: null },
  mesh: { availability: "unknown", reachable: null, lastSafeCheckAt: null },
};

function allowlistedProviders() {
  return new Set(
    env.aiProviderAllowlist
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isApprovedProvider(provider: ApprovedAiProvider) {
  return allowlistedProviders().has(provider);
}

export function isConfiguredProvider(provider: ApprovedAiProvider) {
  return provider === "openrouter" ? isOpenRouterConfigured() : isMeshConfigured();
}

export function recordProviderSuccess(provider: ApprovedAiProvider) {
  health[provider] = {
    availability: "available",
    reachable: true,
    lastSafeCheckAt: new Date().toISOString(),
  };
}

export function recordProviderFailure(provider: ApprovedAiProvider, status?: number) {
  health[provider] = {
    availability: status === 402 ? "payment_required" : status === 429 ? "rate_limited" : "unavailable",
    reachable: typeof status === "number" ? true : false,
    lastSafeCheckAt: new Date().toISOString(),
  };
}

export function providerStatusSnapshot() {
  const primary = env.aiProvider === "mesh" ? "mesh" : "openrouter";
  return (["openrouter", "mesh"] as const).map((provider) => ({
    provider,
    primary: provider === primary,
    configured: isConfiguredProvider(provider),
    approved: isApprovedProvider(provider),
    reachable: health[provider].reachable,
    availability: health[provider].availability,
    lastSafeCheckAt: health[provider].lastSafeCheckAt,
  }));
}

function configuredApprovedState(provider: ApprovedAiProvider): ProviderAvailability | "not_configured" {
  if (!isApprovedProvider(provider) || !isConfiguredProvider(provider)) return "not_configured";
  return health[provider].availability;
}

export function publicProviderAvailability() {
  const primary: ApprovedAiProvider = env.aiProvider === "mesh" ? "mesh" : "openrouter";
  const explicit = configuredApprovedState(primary);
  // Auto model selection can choose another model inside the configured
  // primary processor, but legal chat deliberately never sends a request to a
  // separate processor as an implicit fallback. The availability response must
  // therefore mirror that same routing boundary rather than advertise a
  // healthy secondary provider that the chat request will not use.
  return { auto: explicit === "not_configured" ? "unavailable" : explicit, explicit };
}

export function resetProviderHealthForTests() {
  health.openrouter = { availability: "unknown", reachable: null, lastSafeCheckAt: null };
  health.mesh = { availability: "unknown", reachable: null, lastSafeCheckAt: null };
}
