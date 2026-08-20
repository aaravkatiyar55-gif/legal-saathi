import { env } from "../../config/env";
import type { ProductModelClass } from "../../config/productPolicy";

const catalogEndpoint = "https://openrouter.ai/api/v1/models";
const zdrEndpoint = "https://openrouter.ai/api/v1/endpoints/zdr";
const catalogTtlMs = 15 * 60 * 1000;
const unavailableRetryMs = 15 * 1000;

type SanitizedCatalogModel = {
  id: string;
  contextLength: number;
  zeroCost: boolean;
  supportsReasoning: boolean;
  supportsTools: boolean;
  supportsBoundedOutput: boolean;
  supportsZdr: boolean;
};

export type PublicModelConfigurationState =
  | "available"
  | "model_configuration_required"
  | "free_model_unavailable"
  | "provider_temporarily_unavailable";

export type PublicModelAvailability = {
  state: PublicModelConfigurationState;
  supportsReasoning: boolean;
  supportsSpeed: boolean;
};

type CatalogCache = {
  status: "uninitialized" | "ready" | "unavailable";
  fetchedAt: number | null;
  models: Map<string, SanitizedCatalogModel>;
  zeroCostModelCount: number;
  lastResolvedModel: string | null;
  lastResolvedAt: string | null;
};

const cache: CatalogCache = {
  status: "uninitialized",
  fetchedAt: null,
  models: new Map(),
  zeroCostModelCount: 0,
  lastResolvedModel: null,
  lastResolvedAt: null,
};

const slotByClass: Record<ProductModelClass, () => string> = {
  auto: () => env.modelAutoId,
  fast: () => env.modelFastId,
  flash: () => env.modelFlashId,
  pro: () => env.modelProId,
  ultra: () => env.modelUltraId,
};

function hasValue(value: string) {
  const normalized = value.trim();
  return Boolean(normalized) && normalized !== "replace_later" && !normalized.includes("PASTE_");
}

function safePrice(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.POSITIVE_INFINITY;
}

function safeContextLength(value: unknown) {
  const parsed = Math.floor(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 4_000_000) : 0;
}

function sanitizeZdrModelIds(payload: unknown) {
  const rows = Array.isArray((payload as { data?: unknown })?.data) ? (payload as { data: unknown[] }).data : [];
  return new Set(rows.flatMap((value) => {
    const modelId = (value as Record<string, unknown>).model_id;
    return typeof modelId === "string" && /^[a-z0-9_.:-]+\/[a-z0-9_.:-]+$/i.test(modelId) ? [modelId] : [];
  }));
}

function sanitizeCatalog(payload: unknown, zdrModelIds: Set<string>) {
  const rows = Array.isArray((payload as { data?: unknown })?.data) ? (payload as { data: unknown[] }).data : [];
  const models = new Map<string, SanitizedCatalogModel>();
  for (const value of rows) {
    const row = value as Record<string, unknown>;
    const id = typeof row.id === "string" && /^[a-z0-9_.:-]+\/[a-z0-9_.:-]+$/i.test(row.id) ? row.id.slice(0, 200) : "";
    if (!id) continue;
    const pricing = (row.pricing ?? {}) as Record<string, unknown>;
    const supported = new Set(Array.isArray(row.supported_parameters) ? row.supported_parameters.map(String) : []);
    models.set(id, {
      id,
      contextLength: safeContextLength(row.context_length),
      zeroCost: safePrice(pricing.prompt) === 0 && safePrice(pricing.completion) === 0 && safePrice(pricing.request) === 0,
      supportsReasoning: supported.has("reasoning"),
      supportsTools: supported.has("tools"),
      supportsBoundedOutput: supported.has("max_tokens") || supported.has("max_completion_tokens"),
      supportsZdr: zdrModelIds.has(id),
    });
  }
  return models;
}

export async function refreshOpenRouterModelCatalog(fetchImpl: typeof fetch = fetch) {
  try {
    const requestOptions = { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12_000) };
    const [response, zdrResponse] = await Promise.all([
      fetchImpl(catalogEndpoint, requestOptions),
      fetchImpl(zdrEndpoint, requestOptions),
    ]);
    if (!response.ok || !zdrResponse.ok) throw new Error("CATALOG_UNAVAILABLE");
    const [text, zdrText] = await Promise.all([response.text(), zdrResponse.text()]);
    if (text.length > 6_000_000 || zdrText.length > 6_000_000) throw new Error("CATALOG_TOO_LARGE");
    const models = sanitizeCatalog(JSON.parse(text), sanitizeZdrModelIds(JSON.parse(zdrText)));
    if (models.size === 0) throw new Error("CATALOG_EMPTY");
    cache.status = "ready";
    cache.fetchedAt = Date.now();
    cache.models = models;
    cache.zeroCostModelCount = [...models.values()].filter((model) => model.zeroCost).length;
  } catch {
    // A transient catalog outage must not erase a recently verified catalog.
    // Provider execution remains authoritative if an individual free model
    // disappears between catalog refreshes.
    if (cache.models.size === 0) {
      cache.status = "unavailable";
      cache.zeroCostModelCount = 0;
    } else {
      cache.status = "ready";
    }
    cache.fetchedAt = Date.now();
  }
  return getOpenRouterCatalogStatus();
}

export async function ensureOpenRouterModelCatalog(fetchImpl: typeof fetch = fetch) {
  const ttl = cache.status === "unavailable" ? unavailableRetryMs : catalogTtlMs;
  if (cache.fetchedAt !== null && Date.now() - cache.fetchedAt < ttl) return getOpenRouterCatalogStatus();
  return refreshOpenRouterModelCatalog(fetchImpl);
}

function eligibleCatalogModels(modelClass: ProductModelClass) {
  const requireReasoning = modelClass === "pro" || modelClass === "ultra";
  return [...cache.models.values()].filter((model) =>
    (!env.openRouterFreeOnly || model.zeroCost)
    && model.supportsBoundedOutput
    && (!env.aiSafeMode || model.supportsZdr)
    && (!requireReasoning || model.supportsReasoning));
}

function compareModelId(left: SanitizedCatalogModel, right: SanitizedCatalogModel) {
  return left.id.localeCompare(right.id);
}

function chooseCatalogModel(modelClass: ProductModelClass) {
  const candidates = eligibleCatalogModels(modelClass);
  if (candidates.length === 0) return null;
  if (modelClass === "fast") {
    return [...candidates].sort((left, right) =>
      Number(left.supportsReasoning) - Number(right.supportsReasoning)
      || left.contextLength - right.contextLength
      || compareModelId(left, right))[0] ?? null;
  }
  if (modelClass === "flash" || modelClass === "auto") {
    return [...candidates].sort((left, right) =>
      Number(right.supportsTools) - Number(left.supportsTools)
      || right.contextLength - left.contextLength
      || compareModelId(left, right))[0] ?? null;
  }
  if (modelClass === "pro") {
    return [...candidates].sort((left, right) =>
      left.contextLength - right.contextLength
      || compareModelId(left, right))[0] ?? null;
  }
  return [...candidates].sort((left, right) =>
    right.contextLength - left.contextLength
    || compareModelId(left, right))[0] ?? null;
}

export function resolveOpenRouterProductModelId(modelClass: ProductModelClass) {
  if (cache.status !== "ready") return null;
  const configuredModelId = slotByClass[modelClass]().trim();
  if (hasValue(configuredModelId) && configuredModelId !== "openrouter/free") {
    const configuredModel = cache.models.get(configuredModelId);
    const requireReasoning = modelClass === "pro" || modelClass === "ultra";
    if (
      configuredModel
      && (!env.openRouterFreeOnly || configuredModel.zeroCost)
      && configuredModel.supportsBoundedOutput
      && (!env.aiSafeMode || configuredModel.supportsZdr)
      && (!requireReasoning || configuredModel.supportsReasoning)
    ) {
      return configuredModel.id;
    }
    // An explicitly configured tier must stay pinned to that route. Falling
    // through here would silently substitute a different model for Fast,
    // Flash, Pro, or Ultra when the selected route is unavailable.
    return null;
  }
  // Auto is the only product choice that may select an approved fallback.
  // Every named tier needs an eligible configured model.
  if (modelClass !== "auto") return null;
  return chooseCatalogModel(modelClass)?.id ?? null;
}

function availabilityFor(modelClass: ProductModelClass): PublicModelAvailability {
  if (env.openRouterApiKeys.length === 0) {
    return { state: "model_configuration_required", supportsReasoning: false, supportsSpeed: modelClass !== "fast" };
  }
  if (cache.status !== "ready") {
    return { state: "provider_temporarily_unavailable", supportsReasoning: false, supportsSpeed: modelClass !== "fast" };
  }
  const configuredModelId = slotByClass[modelClass]().trim();
  if (modelClass !== "auto" && !hasValue(configuredModelId)) {
    return { state: "model_configuration_required", supportsReasoning: false, supportsSpeed: modelClass !== "fast" };
  }
  const modelId = resolveOpenRouterProductModelId(modelClass);
  const model = modelId ? cache.models.get(modelId) : null;
  if (!model) {
    return { state: "free_model_unavailable", supportsReasoning: false, supportsSpeed: modelClass !== "fast" };
  }
  return { state: "available", supportsReasoning: model.supportsReasoning, supportsSpeed: modelClass !== "fast" };
}

export function getOpenRouterModelAvailabilitySnapshot() {
  return {
    auto: availabilityFor("auto"),
    fast: availabilityFor("fast"),
    flash: availabilityFor("flash"),
    pro: availabilityFor("pro"),
    ultra: availabilityFor("ultra"),
  } satisfies Record<ProductModelClass, PublicModelAvailability>;
}

export function resolveZeroCostModelId(): string | null {
  return resolveOpenRouterProductModelId("auto");
}

export function resolveOpenRouterPaidFallbackModelId(): string | null {
  if (
    !env.openRouterPaidFallbackEnabled
    || env.openRouterPaidFallbackMonthlyCapInr <= 0
    || !hasValue(env.openRouterPaidFallbackModel)
    || cache.status !== "ready"
  ) return null;
  const model = cache.models.get(env.openRouterPaidFallbackModel.trim());
  if (!model || model.zeroCost || !model.supportsBoundedOutput || (env.aiSafeMode && !model.supportsZdr)) return null;
  return model.id;
}

export function recordResolvedOpenRouterModel(modelId: string) {
  const normalized = modelId.trim();
  if (!/^[a-z0-9_.:-]+\/[a-z0-9_.:-]+$/i.test(normalized)) return;
  cache.lastResolvedModel = normalized.slice(0, 200);
  cache.lastResolvedAt = new Date().toISOString();
}

export function getOpenRouterCatalogStatus() {
  return {
    ready: cache.status === "ready",
    temporarilyUnavailable: cache.status === "unavailable",
    zeroCostModelCount: cache.zeroCostModelCount,
    lastRefreshAt: cache.fetchedAt === null ? null : new Date(cache.fetchedAt).toISOString(),
    lastResolvedModel: cache.lastResolvedModel,
    lastResolvedAt: cache.lastResolvedAt,
  };
}

export function setOpenRouterCatalogForTests(models: Array<{ id: string; contextLength?: number; zeroCost: boolean; supportsReasoning?: boolean; supportsTools?: boolean; supportsBoundedOutput?: boolean; supportsZdr?: boolean }>) {
  cache.status = "ready";
  cache.fetchedAt = Date.now();
  cache.models = new Map(models.map((model) => [model.id, {
    id: model.id,
    contextLength: model.contextLength ?? 128_000,
    zeroCost: model.zeroCost,
    supportsReasoning: model.supportsReasoning ?? false,
    supportsTools: model.supportsTools ?? false,
    supportsBoundedOutput: model.supportsBoundedOutput ?? true,
    supportsZdr: model.supportsZdr ?? true,
  }]));
  cache.zeroCostModelCount = models.filter((model) => model.zeroCost).length;
}
