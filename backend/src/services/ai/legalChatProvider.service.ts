import { env, shouldUseMockProvider } from "../../config/env";
import { AiSafetyBlockError } from "./aiSafety.service";
import { MeshApiError, runMeshLegalPreparationChat } from "./meshProvider";
import type { ResolvedModelRequest } from "./modelRouting.service";
import {
  OpenRouterApiError,
  runLegalPreparationChat,
  type LegalChatMessage,
  type LegalChatResponse,
} from "./openRouterProvider";
import { runMockLegalPreparationChat } from "./mockProvider";
import type { RagContext } from "../rag/rag.service";
import {
  type ApprovedAiProvider,
  isApprovedProvider,
  isConfiguredProvider,
  recordProviderFailure,
  recordProviderSuccess,
} from "./providerHealth.service";

type ProviderRunner = (input: {
  messages: LegalChatMessage[];
  context: Record<string, unknown>;
  resolvedModel: ResolvedModelRequest;
  ragContext: RagContext;
  signal?: AbortSignal;
}) => Promise<LegalChatResponse>;

export class ProviderExecutionError extends Error {
  constructor(
    public readonly code: "AI_PROVIDER_AUTHENTICATION_FAILED" | "AI_PROVIDER_PAYMENT_REQUIRED" | "AI_PROVIDER_TIMEOUT" | "AI_PROVIDER_RATE_LIMITED" | "AI_PROVIDER_UNAVAILABLE" | "AI_PROVIDER_ERROR",
    public readonly status: number,
    public readonly attemptedProviders: ApprovedAiProvider[],
  ) {
    super(code);
  }
}

function statusFromError(error: unknown) {
  if (error instanceof OpenRouterApiError) {
    if (error.status !== undefined) return error.status;
    return error.poolFailure?.category === "invalid_credential"
      ? 401
      : error.poolFailure?.category === "account_wide_limit"
        ? 402
        : error.poolFailure?.category === "access_denied"
          ? 403
          : error.poolFailure?.category === "bad_request"
            ? 400
            : error.poolFailure?.category === "rate_limited"
          ? 429
              : error.poolFailure?.category === "timeout"
                ? 504
                : ["provider_capacity", "transient_upstream"].includes(error.poolFailure?.category ?? "")
                  ? 503
                  : undefined;
  }
  if (error instanceof MeshApiError) return error.status;
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) return 504;
  return undefined;
}

function classifyProviderFailures(statuses: Array<number | undefined>, attemptedProviders: ApprovedAiProvider[]) {
  if (statuses.length > 0 && statuses.every((status) => status === 402)) {
    return new ProviderExecutionError("AI_PROVIDER_PAYMENT_REQUIRED", 503, attemptedProviders);
  }
  if (statuses.length > 0 && statuses.every((status) => status === 401)) {
    return new ProviderExecutionError("AI_PROVIDER_AUTHENTICATION_FAILED", 503, attemptedProviders);
  }
  if (statuses.some((status) => status === 408 || status === 504)) {
    return new ProviderExecutionError("AI_PROVIDER_TIMEOUT", 502, attemptedProviders);
  }
  if (statuses.some((status) => status === 429)) {
    return new ProviderExecutionError("AI_PROVIDER_RATE_LIMITED", 429, attemptedProviders);
  }
  if (statuses.some((status) => status === 404 || (status !== undefined && status >= 500))) {
    return new ProviderExecutionError("AI_PROVIDER_UNAVAILABLE", 502, attemptedProviders);
  }
  return new ProviderExecutionError("AI_PROVIDER_ERROR", 502, attemptedProviders);
}

function canUsePaidOpenRouterFallback(input: Parameters<typeof runApprovedLegalChat>[0], provider: ApprovedAiProvider, error: unknown) {
  // A request-wide deadline is authoritative. Starting another model attempt
  // after it expires cannot produce a response within the caller's budget and
  // could consume a paid fallback without any usable result.
  if (input.signal?.aborted) return false;
  if (provider !== "openrouter" || input.resolvedModel.selectedClass !== "auto" || !input.resolvedModel.paidFallbackModelId) return false;
  const status = statusFromError(error);
  return status === undefined || status === 408 || status === 429 || status === 504 || (status >= 500 && status <= 599);
}

function canUseFreeOpenRouterFallback(input: Parameters<typeof runApprovedLegalChat>[0], provider: ApprovedAiProvider, error: unknown) {
  if (input.signal?.aborted || provider !== "openrouter" || input.resolvedModel.selectedClass !== "auto") return false;
  const status = statusFromError(error);
  return status === 408 || status === 429 || status === 504 || (status !== undefined && status >= 500 && status <= 599);
}

function providerOrder(resolvedModel: ResolvedModelRequest) {
  const primary: ApprovedAiProvider = env.aiProvider === "mesh" ? "mesh" : "openrouter";
  // Legal queries must not silently cross to a separate AI processor. Auto
  // routing may choose a compatible OpenRouter model, including the explicit
  // paid fallback, but it remains inside the configured provider boundary.
  return isApprovedProvider(primary) && isConfiguredProvider(primary) ? [primary] : [];
}

const productionRunners: Record<ApprovedAiProvider, ProviderRunner> = {
  openrouter: ({ messages, context, resolvedModel, ragContext, signal }) => runLegalPreparationChat({
    messages,
    context,
    executionProfile: resolvedModel,
    ragContext,
    signal,
  }),
  mesh: ({ messages, context, signal }) => runMeshLegalPreparationChat({ messages, context, signal }),
};

export async function runApprovedLegalChat(input: {
  messages: LegalChatMessage[];
  context: Record<string, unknown>;
  resolvedModel: ResolvedModelRequest;
  ragContext: RagContext;
  signal?: AbortSignal;
}, runners: Record<ApprovedAiProvider, ProviderRunner> = productionRunners, candidateOverride?: ApprovedAiProvider[], options: { useMockProvider?: boolean } = {}) {
  if (options.useMockProvider ?? shouldUseMockProvider()) {
    const chat = await runMockLegalPreparationChat({ messages: input.messages });
    return { chat, provider: "mock" as const, resolvedModelClass: input.resolvedModel.resolvedClass, attemptedProviders: [] as ApprovedAiProvider[] };
  }

  const requestedCandidates = (candidateOverride ?? providerOrder(input.resolvedModel))
    .filter((provider, index, providers) => providers.indexOf(provider) === index)
    .slice(0, 2);
  const candidates = input.resolvedModel.selectedClass === "auto"
    ? requestedCandidates
    : requestedCandidates.filter((provider) => provider === input.resolvedModel.provider).slice(0, 1);
  if (candidates.length === 0) {
    throw new ProviderExecutionError("AI_PROVIDER_UNAVAILABLE", 503, []);
  }

  const statuses: Array<number | undefined> = [];
  const attemptedProviders: ApprovedAiProvider[] = [];
  for (const provider of candidates) {
    attemptedProviders.push(provider);
    try {
      const chat = await runners[provider](input);
      recordProviderSuccess(provider);
      return {
        chat,
        provider,
        resolvedModelClass: provider === "mesh" ? "auto" as const : input.resolvedModel.resolvedClass,
        attemptedProviders,
      };
    } catch (error) {
      if (error instanceof AiSafetyBlockError) throw error;
      const status = statusFromError(error);
      statuses.push(status);
      recordProviderFailure(provider, status);
      const freeFallbackModelIds = input.resolvedModel.freeFallbackModelIds ?? [];
      if (canUseFreeOpenRouterFallback(input, provider, error)) {
        for (const freeFallbackModelId of freeFallbackModelIds.slice(0, 1)) {
          try {
            const chat = await runners.openrouter({
              ...input,
              resolvedModel: {
                ...input.resolvedModel,
                providerModelId: freeFallbackModelId,
                freeFallbackModelIds: undefined,
                compatibilityFallback: true,
              },
            });
            recordProviderSuccess("openrouter");
            return {
              chat,
              provider: "openrouter" as const,
              resolvedModelClass: input.resolvedModel.resolvedClass,
              attemptedProviders,
              usedFreeFallback: true,
            };
          } catch (fallbackError) {
            if (fallbackError instanceof AiSafetyBlockError) throw fallbackError;
            const fallbackStatus = statusFromError(fallbackError);
            statuses.push(fallbackStatus);
            recordProviderFailure("openrouter", fallbackStatus);
          }
        }
      }
      const paidFallbackModelId = input.resolvedModel.paidFallbackModelId;
      if (paidFallbackModelId && canUsePaidOpenRouterFallback(input, provider, error)) {
        const paidFallbackInput = {
          ...input,
          resolvedModel: {
            ...input.resolvedModel,
            providerModelId: paidFallbackModelId,
            paidFallbackModelId: undefined,
            compatibilityFallback: true,
          },
        };
        try {
          const chat = await runners.openrouter(paidFallbackInput);
          recordProviderSuccess("openrouter");
          return {
            chat,
            provider: "openrouter" as const,
            resolvedModelClass: input.resolvedModel.resolvedClass,
            attemptedProviders,
            usedPaidFallback: true,
          };
        } catch (fallbackError) {
          if (fallbackError instanceof AiSafetyBlockError) throw fallbackError;
          statuses.push(statusFromError(fallbackError));
          recordProviderFailure("openrouter", statusFromError(fallbackError));
        }
      }
      if (input.resolvedModel.selectedClass !== "auto") break;
    }
  }
  throw classifyProviderFailures(statuses, attemptedProviders);
}
