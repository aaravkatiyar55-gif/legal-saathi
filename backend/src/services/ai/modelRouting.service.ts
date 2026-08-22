import { env, shouldUseMockProvider } from "../../config/env";
import {
  normalizeProductSpeed,
  normalizeProductThinking,
  planAllowsModel,
  PRODUCT_MODELS,
  ProductModelClass,
  ProductPlanId,
  ProductSpeed,
  ProductThinkingMode,
} from "../../config/productPolicy";
import {
  getOpenRouterModelAvailabilitySnapshot,
  resolveOpenRouterProductModelId,
  resolveOpenRouterPaidFallbackModelId,
  resolveZeroCostModelIds,
  type PublicModelConfigurationState,
} from "./openRouterCatalog.service";

export type ResolvedModelRequest = {
  selectedClass: ProductModelClass;
  resolvedClass: ProductModelClass;
  provider: "openrouter" | "mesh";
  providerModelId: string;
  thinkingMode: ProductThinkingMode;
  speed: ProductSpeed;
  maxOutputTokens: number;
  compatibilityFallback: boolean;
  freeFallbackModelIds?: string[];
  paidFallbackModelId?: string;
  supportsReasoning?: boolean;
};

export class ModelRoutingError extends Error {
  constructor(public readonly code: "MODEL_PLAN_LOCKED" | "MODEL_NOT_CONFIGURED" | "MODEL_FREE_UNAVAILABLE" | "MODEL_TEMPORARILY_UNAVAILABLE" | "MODEL_CAPABILITY_UNAVAILABLE", message: string) {
    super(message);
  }
}

function hasValue(value: string) {
  const normalized = value.trim();
  return Boolean(normalized) && !normalized.includes("PASTE_") && normalized !== "replace_later";
}

const openRouterSlot: Record<Exclude<ProductModelClass, "auto">, () => string> = {
  fast: () => env.modelFastId,
  flash: () => env.modelFlashId,
  pro: () => env.modelProId,
  ultra: () => env.modelUltraId,
};

function preferredAutoClass(input: { planId: ProductPlanId; promptCharacters: number; contextCharacters: number; webEnabled: boolean }): Exclude<ProductModelClass, "auto"> {
  if ((input.webEnabled || input.contextCharacters > 0 || input.promptCharacters > 4_000) && planAllowsModel(input.planId, "pro")) return "pro";
  if (!input.webEnabled && input.contextCharacters === 0 && input.promptCharacters <= 800) return "fast";
  return "flash";
}

function chooseAutoOpenRouterClass(preferred: Exclude<ProductModelClass, "auto">, planId: ProductPlanId) {
  const availability = getOpenRouterModelAvailabilitySnapshot();
  const candidates: Array<Exclude<ProductModelClass, "auto">> = preferred === "pro"
    ? ["pro", "flash", "fast"]
    : preferred === "flash"
      ? ["flash", "fast"]
      : ["fast", "flash"];
  return candidates.find((model) => planAllowsModel(planId, model) && hasValue(openRouterSlot[model]()) && availability[model].state === "available") ?? null;
}

function assertModelAvailable(state: PublicModelConfigurationState, name: string) {
  if (state === "available") return;
  if (state === "provider_temporarily_unavailable") {
    throw new ModelRoutingError("MODEL_TEMPORARILY_UNAVAILABLE", `${name} cannot be verified while the provider catalog is unavailable.`);
  }
  if (state === "free_model_unavailable") {
    throw new ModelRoutingError("MODEL_FREE_UNAVAILABLE", `${name} is not a verified zero-cost model on this environment.`);
  }
  throw new ModelRoutingError("MODEL_NOT_CONFIGURED", `${name} is not configured.`);
}

function normalizeRequestedClass(value: unknown): ProductModelClass {
  return value === "fast" || value === "flash" || value === "pro" || value === "ultra" ? value : "auto";
}

export function resolveModelRequest(input: {
  selectedModel: unknown;
  thinkingMode?: unknown;
  speed?: unknown;
  planId: ProductPlanId;
  promptCharacters: number;
  contextCharacters: number;
  webEnabled: boolean;
}): ResolvedModelRequest {
  const selectedClass = normalizeRequestedClass(input.selectedModel);
  if (!planAllowsModel(input.planId, selectedClass)) {
    throw new ModelRoutingError("MODEL_PLAN_LOCKED", `${PRODUCT_MODELS[selectedClass].name} is not available on the ${input.planId} plan.`);
  }

  const requestedThinking = normalizeProductThinking(input.thinkingMode);
  const requestedSpeed = normalizeProductSpeed(input.speed);

  // A disposable local mock must exercise the same plan and request-shape
  // rules without needing a live provider key or remotely fetched catalog.
  // Production startup rejects MOCK_MODE, so this never widens a deployed
  // provider path or silently substitutes mock answers for live users.
  if (shouldUseMockProvider()) {
    const capability = PRODUCT_MODELS[selectedClass];
    return {
      selectedClass,
      resolvedClass: selectedClass,
      provider: "openrouter",
      providerModelId: "mock/legal-information",
      thinkingMode: capability.supportsThinking ? requestedThinking : "default",
      speed: capability.supportsSpeed && selectedClass !== "fast" ? requestedSpeed : "1x",
      maxOutputTokens: capability.maxOutputTokens,
      compatibilityFallback: false,
      supportsReasoning: capability.supportsThinking,
    };
  }

  if (env.aiProvider === "mesh") {
    if (!hasValue(env.meshModelId) || !hasValue(env.meshApiKey) || !hasValue(env.meshApiBaseUrl)) {
      throw new ModelRoutingError("MODEL_NOT_CONFIGURED", "Mesh is not configured for AI requests.");
    }
    if (selectedClass !== "auto" || requestedThinking !== "default" || requestedSpeed !== "1x") {
      throw new ModelRoutingError("MODEL_CAPABILITY_UNAVAILABLE", "The configured Mesh contract currently supports Auto with Default thinking at 1x only.");
    }
    return {
      selectedClass,
      resolvedClass: "auto",
      provider: "mesh",
      providerModelId: env.meshModelId,
      thinkingMode: "default",
      speed: "1x",
      maxOutputTokens: PRODUCT_MODELS.auto.maxOutputTokens,
      compatibilityFallback: false,
      supportsReasoning: false,
    };
  }

  const modelAvailability = getOpenRouterModelAvailabilitySnapshot();
  let resolvedClass: ProductModelClass = selectedClass;
  let providerModelId = "";
  let compatibilityFallback = false;
  let freeFallbackModelIds: string[] | undefined;
  if (selectedClass === "auto") {
    if (env.openRouterFreeOnly) {
      assertModelAvailable(modelAvailability.auto.state, PRODUCT_MODELS.auto.name);
      resolvedClass = "auto";
      // The generic free router can randomly select a route that is not
      // compatible with the mandatory ZDR policy. Pin this logical request to
      // the catalog's currently verified zero-cost ZDR model while preserving
      // the user-facing Auto product selection.
      const freeModelIds = resolveZeroCostModelIds(2);
      providerModelId = freeModelIds[0] ?? "";
      if (!hasValue(providerModelId)) {
        throw new ModelRoutingError("MODEL_FREE_UNAVAILABLE", "Auto has no verified zero-cost privacy-eligible model.");
      }
      compatibilityFallback = providerModelId !== env.modelAutoId;
      freeFallbackModelIds = freeModelIds.slice(1);
    } else {
      const preferred = preferredAutoClass(input);
      const configuredClass = chooseAutoOpenRouterClass(preferred, input.planId);
      if (configuredClass) {
        resolvedClass = configuredClass;
        providerModelId = openRouterSlot[configuredClass]();
      } else if (hasValue(env.modelAutoId)) {
        assertModelAvailable(modelAvailability.auto.state, PRODUCT_MODELS.auto.name);
        resolvedClass = "auto";
        providerModelId = env.modelAutoId;
      } else {
        throw new ModelRoutingError("MODEL_NOT_CONFIGURED", "No entitled model slot is configured for Auto.");
      }
    }
  } else {
    assertModelAvailable(modelAvailability[selectedClass].state, PRODUCT_MODELS[selectedClass].name);
    providerModelId = resolveOpenRouterProductModelId(selectedClass) ?? "";
    if (!hasValue(providerModelId)) {
      throw new ModelRoutingError("MODEL_NOT_CONFIGURED", `${PRODUCT_MODELS[selectedClass].name} is not configured.`);
    }
    compatibilityFallback = providerModelId !== openRouterSlot[selectedClass]();
  }

  const capability = PRODUCT_MODELS[resolvedClass];
  const selectedCapability = PRODUCT_MODELS[selectedClass];
  const supportsReasoning = resolvedClass !== "auto" && modelAvailability[resolvedClass].supportsReasoning;
  const thinkingMode = selectedCapability.supportsThinking ? requestedThinking : "default";
  const speed = selectedCapability.supportsSpeed && selectedClass !== "fast" ? requestedSpeed : "1x";
  if (thinkingMode !== "default" && (!env.reasoningModelClasses.includes(resolvedClass) || !supportsReasoning)) {
    throw new ModelRoutingError("MODEL_CAPABILITY_UNAVAILABLE", `${thinkingMode === "extended" ? "Extended" : "Standard"} thinking is not configured for ${capability.name}.`);
  }
  const outputMultiplier = speed === "2x" ? 0.65 : speed === "1.5x" ? 0.8 : 1;

  return {
    selectedClass,
    resolvedClass,
    provider: "openrouter",
    providerModelId,
    thinkingMode,
    speed,
    maxOutputTokens: Math.max(400, Math.floor(capability.maxOutputTokens * outputMultiplier)),
    compatibilityFallback,
    freeFallbackModelIds,
    paidFallbackModelId: selectedClass === "auto" ? resolveOpenRouterPaidFallbackModelId() ?? undefined : undefined,
    supportsReasoning,
  };
}

export function configuredPublicModelClasses() {
  if (env.aiProvider === "mesh") return hasValue(env.meshModelId) && hasValue(env.meshApiKey) ? ["auto" as const] : [];
  const availability = getOpenRouterModelAvailabilitySnapshot();
  const configured = (Object.keys(openRouterSlot) as Array<Exclude<ProductModelClass, "auto">>)
    .filter((model) => availability[model].state === "available");
  const auto = availability.auto.state === "available" || (!env.openRouterFreeOnly && configured.length > 0);
  return auto ? ["auto" as const, ...configured] : configured;
}
