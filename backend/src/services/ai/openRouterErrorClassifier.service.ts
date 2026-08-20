export type OpenRouterFailureCategory =
  | "invalid_credential"
  | "access_denied"
  | "rate_limited"
  | "provider_capacity"
  | "transient_upstream"
  | "timeout"
  | "bad_request"
  | "content_or_policy_rejection"
  | "account_wide_limit"
  | "privacy_ineligible"
  | "unknown_provider_failure";

export type OpenRouterFailureScope = "key" | "model" | "account" | "provider" | "request";
export type OpenRouterKeyAction = "disable" | "cooldown" | "block_pool" | "none";

export type ClassifiedOpenRouterFailure = {
  category: OpenRouterFailureCategory;
  scope: OpenRouterFailureScope;
  keyAction: OpenRouterKeyAction;
  allowAlternate: boolean;
  retryAfterMs?: number;
};

export type OpenRouterSafeErrorMetadata = {
  errorCode: string | null;
  errorType: string | null;
  signals: Array<"account" | "content_policy" | "model_access" | "privacy" | "provider_capacity">;
};

const maximumCooldownMs = 15 * 60 * 1000;
const safeMetadataToken = /^[a-z0-9_.:-]{1,80}$/i;

function safeToken(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return safeMetadataToken.test(normalized) ? normalized : null;
}

function firstRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseRetryAfterMs(value: string | null | undefined, now = Date.now()) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(maximumCooldownMs, Math.ceil(seconds * 1000));
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(maximumCooldownMs, Math.max(0, date - now));
}

export function extractOpenRouterSafeErrorMetadata(responseText: string): OpenRouterSafeErrorMetadata {
  let root: Record<string, unknown> = {};
  try {
    root = firstRecord(JSON.parse(responseText || "{}"));
  } catch {
    return { errorCode: null, errorType: null, signals: [] };
  }

  const error = firstRecord(root.error);
  const metadata = firstRecord(error.metadata);
  const message = [
    typeof error.message === "string" ? error.message : "",
    typeof root.message === "string" ? root.message : "",
  ].join(" ").toLowerCase().slice(0, 600);
  const errorCode = safeToken(error.code ?? root.code);
  const errorType = safeToken(metadata.error_type ?? error.type ?? root.error_type);
  const searchable = `${errorCode ?? ""} ${errorType ?? ""} ${message}`;
  const signals = new Set<OpenRouterSafeErrorMetadata["signals"][number]>();

  if (/(content[_ -]?policy|moderation|guardrail|safety[_ -]?(?:block|reject|violation))/.test(searchable)) {
    signals.add("content_policy");
  }
  if (/(zero[_ -]?data[_ -]?retention|\bzdr\b|data[_ -]?collection|privacy[_ -]?(?:policy|ineligible))/.test(searchable)) {
    signals.add("privacy");
  }
  if (/(provider[_ -]?(?:overloaded|unavailable)|no (?:available )?(?:upstream )?provider|provider capacity|model capacity)/.test(searchable)) {
    signals.add("provider_capacity");
  }
  if (/(model (?:access|permission)|model is not allowed|not allowed (?:to use|for) (?:this )?model)/.test(searchable)) {
    signals.add("model_access");
  }
  if (/(account|organization|organisation|project-wide|daily limit|monthly limit|insufficient credits|account disabled|free[_ -]?tier limit|free[_ -]?models[_ -]?per[_ -]?day)/.test(searchable)) {
    signals.add("account");
  }

  return { errorCode, errorType, signals: [...signals] };
}

export function classifyOpenRouterHttpFailure(input: {
  status: number;
  retryAfterHeader?: string | null;
  metadata?: OpenRouterSafeErrorMetadata;
}): ClassifiedOpenRouterFailure {
  const metadata = input.metadata ?? { errorCode: null, errorType: null, signals: [] };
  const signals = new Set(metadata.signals);
  const retryAfterMs = parseRetryAfterMs(input.retryAfterHeader);

  if (input.status === 401 || metadata.errorType === "authentication" || metadata.errorCode === "invalid_api_key") {
    return {
      category: "invalid_credential",
      scope: "key",
      keyAction: "disable",
      allowAlternate: true,
    };
  }
  if (signals.has("privacy")) {
    return {
      category: "privacy_ineligible",
      scope: "model",
      keyAction: "none",
      allowAlternate: false,
    };
  }
  if (signals.has("content_policy")) {
    return {
      category: "content_or_policy_rejection",
      scope: "request",
      keyAction: "none",
      allowAlternate: false,
    };
  }
  if (input.status === 402 || ((input.status === 403 || input.status === 429) && signals.has("account"))) {
    return {
      category: "account_wide_limit",
      scope: "account",
      keyAction: "block_pool",
      allowAlternate: false,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  if (input.status === 403) {
    return {
      category: "access_denied",
      scope: signals.has("model_access") ? "model" : "account",
      keyAction: signals.has("model_access") ? "none" : "block_pool",
      allowAlternate: false,
    };
  }
  if (input.status === 429) {
    return {
      category: "rate_limited",
      scope: "key",
      keyAction: "cooldown",
      allowAlternate: true,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  if (input.status === 408) {
    return {
      category: "timeout",
      scope: "key",
      keyAction: "cooldown",
      allowAlternate: true,
    };
  }
  if (signals.has("provider_capacity")) {
    return {
      category: "provider_capacity",
      scope: "provider",
      keyAction: "block_pool",
      allowAlternate: false,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  if ([400, 404, 409, 412, 413, 422].includes(input.status)) {
    return {
      category: "bad_request",
      scope: "request",
      keyAction: "none",
      allowAlternate: false,
    };
  }
  if (input.status >= 500 && input.status <= 599) {
    return {
      category: "transient_upstream",
      scope: "key",
      keyAction: "cooldown",
      allowAlternate: true,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  return {
    category: "unknown_provider_failure",
    scope: "request",
    keyAction: "none",
    allowAlternate: false,
  };
}

export function classifyOpenRouterThrownFailure(
  error: unknown,
  options: { callerAborted?: boolean } = {},
): ClassifiedOpenRouterFailure | null {
  if (options.callerAborted) return null;
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return {
      category: "timeout",
      scope: "key",
      keyAction: "cooldown",
      allowAlternate: true,
    };
  }
  if (error instanceof TypeError) {
    return {
      category: "transient_upstream",
      scope: "key",
      keyAction: "cooldown",
      allowAlternate: true,
    };
  }
  return null;
}

export function safeOpenRouterFailureDetail(failure: ClassifiedOpenRouterFailure) {
  return `AI provider failure category: ${failure.category}.`;
}
