import type {
  ChatMessage,
  DocumentAnnotation,
  DocumentCategory,
  DocumentCategorySource,
  DocumentExtractionStatus,
  DocumentQuestionScope,
  RequestConfiguration
} from "@/lib/types";
import type { AppLanguage } from "@/lib/i18n";
import { updateSafeDiagnosticContext } from "@/lib/safeIncident";
import { buildCaseAgentRequest, type CaseAgentActionId } from "@/lib/caseAgentWorkflows";
import { createSingleFlight } from "@/lib/asyncSingleFlight";

export type ServerDocumentProcessingResult = {
  contentAvailable: true;
  extractedText?: string;
  extractionStatus: DocumentExtractionStatus;
  extractionMessage?: string;
  category: DocumentCategory;
  categorySource: DocumentCategorySource;
};

export type BackendCaseDocument = {
  id: string;
  caseId?: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  extractedText?: string;
  extractionStatus: DocumentExtractionStatus;
  extractionMessage?: string;
  category: DocumentCategory;
  categorySource: DocumentCategorySource;
  annotations?: DocumentAnnotation[];
  contentAvailable: true;
};

type ProcessDocumentArgs = {
  documentId: string;
  caseId?: string;
  file: File;
  category?: DocumentCategory;
};

type SubmitCaseQuestionArgs = {
  questionId: string;
  caseId: string;
  scope: DocumentQuestionScope;
  documentId?: string;
  text: string;
};

export type CaseQuestionPreparationResult = {
  retrievedDocumentIds: string[];
  retrievalMessage?: string;
};

type BackendErrorPayload = {
  error?: string;
  message?: string;
  requestId?: string;
};

export type BackendErrorKind =
  | "case_limit"
  | "upgrade_required"
  | "authentication_required"
  | "consent_required"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_payment_required"
  | "web_unavailable"
  | "rate_limited"
  | "duplicate_request"
  | "request_reuse_mismatch"
  | "validation"
  | "network"
  | "service_unavailable"
  | "cancelled"
  | "unexpected";

function classifyBackendError(code: string, status: number): BackendErrorKind {
  if (code === "CASE_FOLDER_LIMIT_REACHED" || code === "USAGE_LIMIT_REACHED") return "case_limit";
  if (/PLAN_LOCKED|UPGRADE|INSUFFICIENT_UNITS/.test(code)) return "upgrade_required";
  if (/AUTH_REQUIRED|AUTHENTICATION|SESSION_REQUIRED|SESSION_EXPIRED/.test(code)) return "authentication_required";
  if (/CONSENT_REQUIRED|TERMS_CONSENT_REQUIRED/.test(code)) return "consent_required";
  if (code === "AI_PROVIDER_PAYMENT_REQUIRED") return "provider_payment_required";
  if (code === "AI_PROVIDER_TIMEOUT" || code === "BACKEND_PROXY_TIMEOUT") return "provider_timeout";
  if (code === "AI_PROVIDER_RATE_LIMITED") return "rate_limited";
  if (/AI_PROVIDER|AI_MODEL|MODEL_(?:FREE|TEMPORARILY|NOT_CONFIGURED|CAPABILITY)/.test(code)) return "provider_unavailable";
  if (/WEB_(?:SEARCH_)?UNAVAILABLE/.test(code)) return "web_unavailable";
  if (status === 429 || /RATE_LIMIT|QUOTA_REACHED/.test(code)) return "rate_limited";
  if (["DUPLICATE_REQUEST", "REQUEST_ALREADY_PROCESSED", "REQUEST_IN_PROGRESS"].includes(code)) return "duplicate_request";
  if (code === "REQUEST_ID_REUSE_MISMATCH") return "request_reuse_mismatch";
  if (code === "REQUEST_CANCELLED") return "cancelled";
  if (["BACKEND_PROXY_NOT_CONFIGURED", "BACKEND_PROXY_UNAVAILABLE", "UNIT_LEDGER_UNAVAILABLE", "REQUEST_RECOVERY_UNAVAILABLE"].includes(code)) {
    return "service_unavailable";
  }
  if (status === 400 || /^INVALID_|_REQUIRED$/.test(code)) return "validation";
  if (status === 0 || code === "BACKEND_OFFLINE" || code === "REQUEST_TIMEOUT") return "network";
  return "unexpected";
}

function safeBackendMessage(kind: BackendErrorKind) {
  if (kind === "case_limit") return "Your current plan case-folder limit has been reached.";
  if (kind === "upgrade_required") return "This action is not available on your current plan.";
  if (kind === "authentication_required") return "Sign in securely to continue.";
  if (kind === "consent_required") return "Review and accept the Terms & Safety notice to continue.";
  if (kind === "provider_payment_required") return "The selected AI service needs an available provider budget before it can continue.";
  if (kind === "provider_unavailable") return "The selected AI service could not complete this request right now.";
  if (kind === "provider_timeout") return "The AI response took too long and ended safely. Please try again.";
  if (kind === "web_unavailable") return "Live web search is unavailable right now.";
  if (kind === "rate_limited") return "This service is busy. Please wait before trying again.";
  if (kind === "duplicate_request") return "Legal Saathi is recovering your previous response. Please wait briefly, then retry the same message.";
  if (kind === "request_reuse_mismatch") return "This request reference belongs to different content. Send a fresh legal question instead.";
  if (kind === "validation") return "Check the information entered and try again.";
  if (kind === "network") return "Legal Saathi could not reach the secure backend.";
  if (kind === "service_unavailable") return "Legal Saathi's secure service is temporarily unavailable. Your draft is still here; please try again shortly.";
  if (kind === "cancelled") return "Generation stopped. No completed response was charged.";
  return "Legal Saathi could not complete this action.";
}

export class BackendApiError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly status: number;
  readonly kind: BackendErrorKind;
  readonly presentation: "product" | "global";

  constructor(input: { code: string; requestId: string; status: number }) {
    const kind = classifyBackendError(input.code, input.status);
    super(safeBackendMessage(kind));
    this.name = "BackendApiError";
    this.code = input.code;
    this.requestId = input.requestId;
    this.status = input.status;
    this.kind = kind;
    this.presentation = [
      "case_limit",
      "upgrade_required",
      "authentication_required",
      "consent_required",
      "duplicate_request",
      "request_reuse_mismatch",
      "validation",
      "provider_payment_required",
      "provider_unavailable",
      "provider_timeout",
      "web_unavailable",
      "rate_limited",
      "network",
      "service_unavailable",
      "cancelled",
    ].includes(kind) ? "product" : "global";
  }
}

// A browser deadline is ambiguous: the request may have completed at the
// backend just after the connection closed. Probe the owner-scoped receipt
// before suggesting that the user starts another legal request.
export function shouldAttemptLegalChatRecovery(error: unknown) {
  return error instanceof BackendApiError && (
    error.kind === "duplicate_request"
    || error.code === "BACKEND_PROXY_TIMEOUT"
    || error.code === "REQUEST_TIMEOUT"
  );
}

// A chat is a focused user workflow. Even if a malformed intermediary
// response escapes typed error parsing, keep the user's draft and recovery
// actions beside that workflow instead of replacing it with a generic app
// incident modal.
export function chatFailureMessage(error: unknown) {
  if (error instanceof BackendApiError) return error.message;
  return "We couldn't complete this legal question safely. Your draft is still here; check your connection and try again.";
}

export const safeConsentRequiredEvent = "legal-sathi-consent-required";
export function dispatchConsentRequired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(safeConsentRequiredEvent));
  }
}

export function safeInlineBackendMessage(error: unknown, fallback: string) {
  if (error instanceof BackendApiError) {
    if (error.kind === "consent_required") {
      dispatchConsentRequired();
      return "";
    }
    // This helper is used by optional refreshes (plan, profile, pricing and
    // workspace hydration). Those requests must not turn a completed primary
    // action into a global failure dialog. Callers render this safe message
    // inline and retain the last known good state instead.
    return error.message || fallback;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const isAuthError = error.name === "AuthApiError" || error.name === "AuthError" || 
      msg.includes("invalid login") || msg.includes("invalid credentials") || 
      msg.includes("otp") || msg.includes("password") || msg.includes("session") ||
      (error instanceof TypeError && msg.includes("fetch"));
    if (isAuthError) {
      return "Could not reach the authentication service. Please check your connection.";
    }
  }

  return fallback;
}

const readBackendError = async (response: Response) => {
  const payload = await response.json().catch(() => null) as BackendErrorPayload | null;
  const requestId = payload?.requestId ?? response.headers.get("x-request-id") ?? crypto.randomUUID();
  return new BackendApiError({
    code: payload?.error ?? "BACKEND_REQUEST_FAILED",
    requestId,
    status: response.status,
  });
};

const backendBaseUrl = "/api/legal-sathi";

export type BackendSession = { email: string; provider: "development" | "google" | "supabase" };
let currentSession: BackendSession | null = null;
let currentAdminToken = "";
let currentCsrfToken = "";
const restoreBackendSessionSingleFlight = createSingleFlight<{
  ok: true;
  authenticated: boolean;
  profile?: BackendProfile;
  session?: SessionPayload;
} | null>();

// Preview sessions deliberately stay in memory. Refreshing the page signs out a
// local preview session rather than persisting user or admin data in localStorage.
export function setBackendSession(session: BackendSession | null) { currentSession = session; }
export function getBackendSession() { return currentSession; }
export function clearBackendSession() { currentSession = null; currentAdminToken = ""; currentCsrfToken = ""; }
export function setBackendAdminSession(token: string) { currentAdminToken = token; }
export function clearBackendAdminSession() { currentAdminToken = ""; }

const sendBackendRequest = async (path: string, init?: RequestInit) => {
  let response: Response;
  const requestedId = new Headers(init?.headers).get("X-Request-Id") ?? "";
  const requestId = /^[A-Za-z0-9_-]{8,120}$/.test(requestedId) ? requestedId : crypto.randomUUID();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  try {
    response = await fetch(`${backendBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      signal: init?.signal ?? controller.signal,
      headers: {
        ...(init?.body && !isFormData ? { "Content-Type": "application/json" } : {}),
        ...(currentCsrfToken ? { "X-CSRF-Token": currentCsrfToken } : {}),
        "X-Request-Id": requestId,
        ...init?.headers
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new BackendApiError({ code: init?.signal?.aborted ? "REQUEST_CANCELLED" : "REQUEST_TIMEOUT", requestId, status: 0 });
    }
    throw new BackendApiError({ code: "BACKEND_OFFLINE", requestId, status: 0 });
  } finally {
    window.clearTimeout(timeout);
  }

  return response;
};

const requestBackend = async <T>(path: string, init?: RequestInit) => {
  try {
    const response = await sendBackendRequest(path, init);
    if (!response.ok) throw await readBackendError(response);
    const payload = await response.json() as T & BackendErrorPayload & { ok?: boolean };
    if (payload.ok === false) {
      const requestId = payload.requestId ?? response.headers.get("x-request-id") ?? crypto.randomUUID();
      throw new BackendApiError({ code: payload.error ?? "BACKEND_REJECTED_REQUEST", requestId, status: response.status });
    }
    return payload;
  } catch (error) {
    // Transport has no knowledge of whether a request is a primary user
    // action or optional background hydration. Surface the typed error to the
    // owning workflow; it alone decides whether an inline message or a global
    // retry dialog is warranted.
    throw error;
  }
};

export type LegalChatResult = {
  ok: true;
  requestId: string;
  requestedModelClass: string;
  resolvedModelClass: string;
  webUsed: boolean;
  ragUsed: boolean;
  agentState?: string;
  agent?: {
    state: string;
    publicStatus: string;
    canProceed: boolean;
    requiresConfirmation: boolean;
    highRisk: boolean;
    clarificationQuestions: string[];
    toolSummaries: string[];
  };
  provider: "mock" | "openrouter" | "mesh" | string;
  reply: string;
  suggestedNextActions: string[];
  canCreateCase: boolean;
  sources: string[];
  disclaimer: string;
  model?: { selected: string; resolved: string; thinking: string; speed: string };
  units?: { charged: number; estimated: number; remaining: number };
  web?: {
    requested: boolean;
    automatic?: boolean;
    configured: boolean;
    attempted: boolean;
    performed: boolean;
    succeeded: boolean;
    message?: string;
    sources: Array<{ title: string; url: string; excerpt: string; authority: string; retrievedAt: string }>;
  };
  grounding?: {
    status: "grounded" | "insufficient" | "disabled" | "unavailable";
    scope: "global" | "private" | "combined";
    confidence: number;
    warning?: string;
    citations: Array<{ sourceId: string; title: string; url?: string; authority: string; jurisdiction: string; label: string; date?: string; documentId?: string; page?: number }>;
  };
};

type SubmitLegalChatArgs = {
  messages: ChatMessage[];
  requestConfiguration?: RequestConfiguration;
  context?: Record<string, unknown>;
  requestId?: string;
  signal?: AbortSignal;
};

type LegalChatRecoveryResult =
  | { ok: true; requestId: string; status: "completed"; result: LegalChatResult }
  | { ok: true; requestId: string; status: "pending" | "missing" };

const getLegalChatRecoveryResult = (requestId: string) => requestBackend<LegalChatRecoveryResult>(
  `/ai/legal-chat/${encodeURIComponent(requestId)}/result`,
  { method: "GET" },
);

export const submitLegalChat = ({ messages, requestConfiguration, context, requestId, signal }: SubmitLegalChatArgs) => {
  updateSafeDiagnosticContext({
    modelClass: requestConfiguration?.model ?? "auto",
    webEnabled: context?.webEnabled === true,
    ragEnabled: Boolean(context?.documentId || context?.caseId),
  });
  const stableRequestId = requestId ?? crypto.randomUUID();
  return requestBackend<LegalChatResult>("/ai/legal-chat", {
    method: "POST",
    headers: { "X-Request-Id": stableRequestId },
    signal,
    body: JSON.stringify({
      messages: messages.slice(-12).map(message => ({ role: message.role, content: message.text.slice(0, 8_000) })),
      context: {
        language: context?.language === "hinglish" || context?.language === "hi" ? context.language : "en",
        requestConfiguration,
        ...context
      }
    })
  }).catch(async (error) => {
    if (shouldAttemptLegalChatRecovery(error)) {
      try {
        const recovery = await getLegalChatRecoveryResult(stableRequestId);
        if (recovery.status === "completed") return recovery.result;
      } catch {
        // A completed result may still be finalizing. Preserve the recovery
        // message instead of sending the same legal request a second time.
      }
    }
    throw error;
  });
};

export const cancelLegalChat = (requestId: string) => requestBackend<{ ok: true; requestId: string; status: "cancelled" }>(
  `/ai/legal-chat/${encodeURIComponent(requestId)}/cancel`,
  { method: "POST" },
);

export type BackendProfile = {
  email: string;
  displayName: string;
  avatarUrl?: string;
  tier?: string;
};

export type ConsentRequirements = {
  termsVersion: string;
  privacyVersion: string;
  consentVersion: string;
};

export type SessionPayload = {
  provider: "development" | "google" | "supabase";
  csrfToken: string;
  expiresAt: string;
  termsVersion: string | null;
  privacyVersion: string | null;
  consentVersion: string | null;
  consentedAt: string | null;
  requiredTermsVersion: string;
  requiredPrivacyVersion: string;
  requiredConsentVersion: string;
  requiredAiDisclaimerVersion?: string;
  requiredDataProcessingVersion?: string;
  requiredCookiePreferencesVersion?: string;
  acceptedCurrent: boolean;
  adminEligible?: boolean;
  language?: AppLanguage;
};

export const createBackendProfileSession = async (email: string, displayName?: string) => {
  const result = await requestBackend<{ ok: true; profile: BackendProfile; session: SessionPayload }>("/profile/dev-session", {
    method: "POST",
    body: JSON.stringify({ email, displayName })
  });
  currentCsrfToken = result.session.csrfToken;
  setBackendSession({ email: result.profile.email || email, provider: result.session.provider });
  return result;
};

export const restoreBackendSession = () => restoreBackendSessionSingleFlight(async () => {
  const result = await requestBackend<{ ok: true; authenticated: boolean; profile?: BackendProfile; session?: SessionPayload }>("/profile/session");
  if (!result.authenticated || !result.profile || !result.session) return null;
  currentCsrfToken = result.session.csrfToken;
  setBackendSession({ email: result.profile.email, provider: result.session.provider });
  return result;
});

export const destroyBackendSession = async () => {
  await requestBackend<{ ok: true }>("/profile/session", { method: "DELETE" });
  clearBackendSession();
};

export const acceptBackendTerms = (input: {
  requirements: ConsentRequirements;
  accepted: true;
  locale: AppLanguage;
}) => requestBackend<{ ok: true; termsVersion: string; privacyVersion: string; consentVersion: string; consentedAt: string }>("/profile/consent", {
  method: "POST",
  body: JSON.stringify({
    termsVersion: input.requirements.termsVersion,
    privacyVersion: input.requirements.privacyVersion,
    consentVersion: input.requirements.consentVersion,
    accepted: input.accepted,
    locale: input.locale,
  }),
});

export type ConsentDocumentSection = {
  heading: string;
  paragraphs: string[];
};

export type ConsentPolicyDocument = {
  id: string;
  title: string;
  version: string;
  effectiveDate: string;
  sha256: string;
  sections: ConsentDocumentSection[];
};

export type ConsentDocumentBundle = {
  summary: string;
  effectiveDate: string;
  terms: ConsentPolicyDocument;
  privacy: ConsentPolicyDocument;
  acceptedItems: string[];
};

export const getBackendConsentDocument = () => requestBackend<{
  ok: true;
  policy: ConsentDocumentBundle;
}>("/profile/consent/document");

export type ConsentHistoryEvent = {
  id: string;
  termsVersion: string;
  privacyVersion: string;
  consentVersion: string;
  aiDisclaimerVersion: string;
  dataProcessingVersion: string;
  cookiePreferencesVersion: string;
  acceptedAt: string;
  locale: AppLanguage;
  authenticationMethod: "google" | "supabase";
  supersededAt: string | null;
};

export const getBackendConsentHistory = () => requestBackend<{
  ok: true;
  current: {
    termsVersion: string;
    privacyVersion: string;
    consentVersion: string;
    aiDisclaimerVersion: string;
    dataProcessingVersion: string;
    cookiePreferencesVersion: string;
  };
  events: ConsentHistoryEvent[];
  cookies: {
    essentialRequired: true;
    analyticsActive: false;
    marketingActive: false;
    optionalPersonalizationActive: false;
  };
}>("/profile/consent/history");

export const saveBackendLanguage = (language: AppLanguage) => requestBackend<{ ok: true; language: AppLanguage }>("/profile/language", {
  method: "POST",
  body: JSON.stringify({ language }),
});

export const getBackendProfileStatus = () => requestBackend<{ ok: true; profile: BackendProfile }>("/profile/status");

export type SafeIncidentReport = {
  requestId: string;
  timestamp: string;
  deploymentVersion: string;
  frontendVersion: string;
  routeCategory: string;
  feature: string;
  errorCode: string;
  httpStatus: number;
  modelClass: "auto" | "fast" | "flash" | "pro" | "ultra" | "unknown";
  webEnabled: boolean;
  ragEnabled: boolean;
  planClass: "free" | "plus" | "pro" | "max" | "unknown";
  browserFamily: string;
  browserVersion: string;
  osCategory: "Windows" | "macOS" | "Linux" | "Android" | "iOS" | "Other";
  retryCount: number;
  requestDurationMs: number;
  online: boolean;
  attemptedAction: string;
  reproducibility: "once" | "sometimes" | "always" | "unknown";
  description: string;
  diagnosticsConsent: true;
};

export const submitIncidentReport = async (report: SafeIncidentReport) => {
  const session = getBackendSession();
  const endpoint = session ? "/incidents/report" : "/incidents/public-report";
  let response = await sendBackendRequest(endpoint, { method: "POST", body: JSON.stringify(report) });
  if (session && (response.status === 401 || response.status === 403)) {
    response = await sendBackendRequest("/incidents/public-report", { method: "POST", body: JSON.stringify(report) });
  }
  if (!response.ok) throw await readBackendError(response);
  return response.json() as Promise<{ ok: true; incident: { id: string; status: string; reportCount: number } }>;
};

export const getBackendAdminReadiness = () => requestBackend<{
  ok: true;
  eligible: true;
  credentialConfigured: boolean;
}>("/admin/session/readiness");

export const setupBackendAdminCredential = (password: string, confirmation: string) => requestBackend<{
  ok: true;
  credentialConfigured: true;
}>("/admin/credential/setup", {
  method: "POST",
  body: JSON.stringify({ password, confirmation }),
});

export const createBackendAdminSession = async (password: string) => {
  const session = await requestBackend<{ ok: true; token: string; expiresAt: string }>("/admin/session", {
    method: "POST",
    body: JSON.stringify({ password })
  });
  setBackendAdminSession(session.token);
  return session;
};

const adminRequest = <T>(path: string, init?: RequestInit) => requestBackend<T>(path, {
  ...init,
  headers: { Authorization: `Bearer ${currentAdminToken}`, ...init?.headers },
});

export const getAdminUsers = () => adminRequest<{ ok: true; users: BackendProfile[] }>("/admin/users");
export type AdminConsentEvent = {
  id: string;
  email: string;
  accepted: boolean;
  acceptedAt: string;
  termsVersion: string;
  privacyVersion: string;
  consentVersion: string;
  aiDisclaimerVersion: string;
  dataProcessingVersion: string;
  cookiePreferencesVersion: string;
  authenticationMethod: "google" | "supabase";
  locale: AppLanguage;
  termsDocumentId: string;
  privacyDocumentId: string;
  termsContentHashSha256: string;
  privacyContentHashSha256: string;
  acceptedItems: string[];
  requestId: string;
};
export const getAdminConsentEvents = (email: string) => adminRequest<{
  ok: true;
  email: string;
  events: AdminConsentEvent[];
}>(`/admin/consents?email=${encodeURIComponent(email)}`);
export const downloadAdminConsentExport = async (email: string) => {
  const response = await sendBackendRequest(`/admin/consents/export?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${currentAdminToken}` },
  });
  if (!response.ok) throw await readBackendError(response);
  return response.blob();
};
export type SafeProviderStatus = {
  provider: "openrouter" | "mesh";
  primary: boolean;
  configured: boolean;
  approved: boolean;
  reachable: boolean | null;
  availability: "unknown" | "available" | "payment_required" | "unavailable";
  lastSafeCheckAt: string | null;
};
export const getAdminProviderStatus = () => adminRequest<{ ok: true; providers: SafeProviderStatus[] }>("/ai/admin/provider-status");
export type AdminPlanChangeResponse = {
  ok: true;
  profile: BackendProfile & { activePlan?: ProductPlanId };
  planState: BackendPlanState;
  usage: {
    previewPlan: ProductPlanId;
    credits: {
      total: number;
      remaining: number;
      includedRemaining: number;
      purchasedRemaining: number;
      source: string;
    };
  };
  modelEntitlements: BackendPlanState["entitlements"];
  auditId: string;
};
export const updateAdminUserTier = (email: string, tier: string) => adminRequest<AdminPlanChangeResponse>(`/admin/users/${encodeURIComponent(email)}/tier`, { method: "POST", body: JSON.stringify({ tier }) });
export const setAdminUserBan = (email: string, banned: boolean, reason?: string) => adminRequest<{ ok: true; profile: BackendProfile }>(`/admin/users/${encodeURIComponent(email)}/${banned ? "ban" : "unban"}`, { method: "POST", body: JSON.stringify({ reason }) });
export const resetAdminUserUsage = (email: string, feature?: string) => adminRequest<{ ok: true }>(`/admin/users/${encodeURIComponent(email)}/usage/reset`, { method: "POST", body: JSON.stringify({ feature }) });
export const hideAdminUser = (email: string) => adminRequest<{ ok: true }>(`/admin/users/${encodeURIComponent(email)}/hide`, { method: "POST" });
export const restoreAdminUser = (email: string) => adminRequest<{ ok: true }>(`/admin/users/${encodeURIComponent(email)}/restore`, { method: "POST" });
export const getAdminCoupons = () => adminRequest<{ ok: true; coupons: unknown[] }>("/admin/coupons");
export type AdminCommercialPricing = {
  version: 1;
  updatedAt: string | null;
  plans: {
    plus: { monthly: number; yearly: number };
    pro: { monthly: number; yearly: number };
    max: { monthly: number; yearly: number };
  };
  advocatePrep: { oneTime: number };
};
export const getAdminCommercialPricing = () => adminRequest<{ ok: true; pricing: AdminCommercialPricing }>("/admin/pricing");
export const updateAdminCommercialPricing = (pricing: Pick<AdminCommercialPricing, "plans" | "advocatePrep">) =>
  adminRequest<{ ok: true; pricing: AdminCommercialPricing }>("/admin/pricing", { method: "PATCH", body: JSON.stringify(pricing) });
export type BackendIncidentStatus = "new" | "investigating" | "resolved" | "ignored" | "needs_codex_review";
export type BackendIncident = {
  id: string;
  requestId: string;
  deploymentVersion: string;
  frontendVersion: string;
  routeCategory: string;
  feature: string;
  errorCode: string;
  httpStatus: number;
  modelClass: string;
  webEnabled: boolean;
  ragEnabled: boolean;
  planClass: string;
  retryCount: number;
  retryResult: string;
  attemptedAction: string;
  reproducibility: "once" | "sometimes" | "always" | "unknown";
  reportCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: BackendIncidentStatus;
};
export const getAdminIncidents = () => adminRequest<{ ok: true; incidents: BackendIncident[]; projectReference: string }>("/admin/incidents");
export const updateAdminIncidentStatus = (incidentId: string, status: BackendIncidentStatus) => adminRequest<{ ok: true; incident: BackendIncident }>(`/admin/incidents/${encodeURIComponent(incidentId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const saveAdminCoupon = (coupon: Record<string, unknown>) => adminRequest<{ ok: true; coupon: unknown }>("/admin/coupons", { method: "POST", body: JSON.stringify(coupon) });
export const disableAdminCoupon = (code: string) => adminRequest<{ ok: true }>(`/admin/coupons/${encodeURIComponent(code)}/disable`, { method: "POST" });
export const deleteAdminCoupon = (code: string) => adminRequest<{ ok: true }>(`/admin/coupons/${encodeURIComponent(code)}`, { method: "DELETE" });

export type BackendCase = {
  id: string; title: string; case_type: string; user_role: string; short_summary: string; important_facts: string[]; important_dates: string[];
  parties: string[]; relief_wanted: string[]; missing_information: string[]; risk_flags: string[]; questions_for_user: string[]; created_at: string; updated_at: string;
  analysis_status?: "not_requested" | "pending" | "completed" | "failed";
  analysis_error_code?: string | null;
};
export const getBackendCases = () => requestBackend<{ ok: true; cases: BackendCase[] }>("/cases");
export const createBackendCase = (title: string, caseText = "", language = "en") => requestBackend<{ ok: true; caseId: string; case: BackendCase; memory: unknown; disclaimer: string; aiAnalysisPending?: boolean }>("/cases/from-intake", { method: "POST", body: JSON.stringify({ title, caseText, language }) });
export const prepareBackendCaseAnalysis = async (caseId: string, language: AppLanguage) => {
  const response = await sendBackendRequest(`/cases/${encodeURIComponent(caseId)}/prepare`, {
    method: "POST",
    body: JSON.stringify({ language }),
  });
  if (!response.ok) throw await readBackendError(response);
  return response.json() as Promise<{
  ok: true;
  case: BackendCase;
  memory: unknown;
  analysisStatus: "completed";
  alreadyPrepared: boolean;
  disclaimer: string;
  }>;
};

export type CaseAgentResult = {
  ok: true;
  caseId: string;
  requestId?: string;
  disclaimer?: string;
  [key: string]: unknown;
};

/**
 * Uses only the existing case routes. The server remains authoritative for case
 * ownership, consent, plan checks, quota and duplicate-request protection.
 */
export const runCaseAgentAction = (input: {
  action: Exclude<CaseAgentActionId, "research" | "review_document">;
  caseId: string;
  language: AppLanguage;
}) => {
  const request = buildCaseAgentRequest(input);
  if (!request) throw new Error("Case Agent action is not executable");
  return requestBackend<CaseAgentResult>(request.path, {
    method: request.method,
    body: JSON.stringify(request.body),
  });
};
export const deleteBackendCase = (caseId: string) => requestBackend<{ ok: true; deletedCaseId: string; deletedAt: string; softDeleted: boolean }>(`/cases/${encodeURIComponent(caseId)}`, { method: "DELETE" });
export const restoreBackendCase = (caseId: string) => requestBackend<{ ok: true; restored: boolean }>(`/cases/${encodeURIComponent(caseId)}/restore`, { method: "POST" });

export type BackendChat = {
  id: string;
  title: string;
  messages: ChatMessage[];
  caseId?: string;
  requestConfiguration: RequestConfiguration;
  webEnabled: boolean;
  attachments: Array<{ documentId?: string; name: string; mimeType: string; size: number }>;
  contextSummary: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type BackendChatInput = Pick<BackendChat, "id" | "title" | "messages" | "caseId" | "requestConfiguration" | "webEnabled" | "attachments" | "contextSummary" | "pinned" | "archived">;
export const getBackendChats = (options: { query?: string; archived?: boolean; deleted?: boolean; cursor?: string; limit?: number } = {}) => {
  const query = new URLSearchParams();
  if (options.query) query.set("q", options.query);
  if (options.archived) query.set("archived", "true");
  if (options.deleted) query.set("deleted", "true");
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.limit) query.set("limit", String(options.limit));
  const suffix = query.size ? `?${query.toString()}` : "";
  return requestBackend<{ ok: true; chats: BackendChat[]; nextCursor: string | null }>(`/chats${suffix}`);
};
export const upsertBackendChat = (chat: BackendChatInput) => requestBackend<{ ok: true; chat: BackendChat }>("/chats", { method: "POST", body: JSON.stringify(chat) });
export const updateBackendChat = (chatId: string, changes: { title?: string; pinned?: boolean; archived?: boolean }) => requestBackend<{ ok: true; chat: BackendChat }>(`/chats/${encodeURIComponent(chatId)}`, { method: "PATCH", body: JSON.stringify(changes) });
export const deleteBackendChat = (chatId: string) => requestBackend<{ ok: true; chat: BackendChat }>(`/chats/${encodeURIComponent(chatId)}`, { method: "DELETE" });
export const deleteAllBackendChats = () => requestBackend<{ ok: true; deletedCount: number }>("/chats", { method: "DELETE" });
export const restoreBackendChat = (chatId: string) => requestBackend<{ ok: true; chat: BackendChat }>(`/chats/${encodeURIComponent(chatId)}/restore`, { method: "POST" });

export type BackendUsage = { previewPlan: "free" | "plus" | "pro" | "max"; usage: Array<{ feature: string; count: number; limit: number; remaining: number; resetAt: string }>; modelPolicy: Record<string, unknown> };
export type ProductPlanId = "free" | "plus" | "pro" | "max";
export type ProductModelClass = "auto" | "fast" | "flash" | "pro" | "ultra";
export type ProductCatalog = {
  version: string;
  currency: "INR";
  cycleDays: number;
  plans: Array<{
    id: ProductPlanId;
    name: string;
    pricePaise: number | null;
    billingPrices: { monthly: number | null; yearly: number | null };
    annualSavingsPercent: number;
    cycleDays: number;
    includedUnits: number;
    paid: boolean;
    purchasable: boolean;
    adminOnly: boolean;
    allowsTopUps: boolean;
    allowsWeb: boolean;
    allowedModels: ProductModelClass[];
    usageWindows: Record<string, { limit: number; windowMs: number }>;
    uiActions: string[];
  }>;
  models: Array<{ id: ProductModelClass; name: string; baseUnits: number; supportsThinking: boolean; supportsSpeed: boolean; maxOutputTokens: number; description: string; configured: boolean }>;
  advocatePrep: { id: "advocate_prep"; name: string; pricePaise: number; billingCycle: "one_time"; unit: "case"; purchasable: boolean };
  topUps: Array<{ id: string; units: number; pricePaise: number; testModeOnly: boolean; commercialApproved: boolean }>;
  customTopUp: {
    id: "custom";
    minAmountInr: number;
    maxAmountInr: number;
    amountStepInr: number;
    unitsPerRupee: number;
    testModeOnly: boolean;
    commercialApproved: boolean;
  } | null;
};
export type BackendPlanState = {
  catalogVersion: string;
  plan: { id: ProductPlanId; name: string; paid: boolean; highest: boolean; adminOnly: boolean; expiresAt: string; cycleStartedAt: string; cycleEndsAt: string };
  balances: {
    included: { total: number; remaining: number; used: number; percentageUsed: number };
    purchased: { remaining: number; expiresAt: null };
    totalRemaining: number;
  };
  entitlements: {
    allowedModels: ProductModelClass[];
    configuredModels: ProductModelClass[];
    modelAvailability?: Record<ProductModelClass, "available" | "model_configuration_required" | "free_model_unavailable" | "provider_temporarily_unavailable">;
    modelCapabilities?: Record<ProductModelClass, { supportsReasoning: boolean; supportsSpeed: boolean }>;
    providerAvailability?: {
      auto: "unknown" | "available" | "payment_required" | "unavailable" | "rate_limited";
      explicit: "unknown" | "available" | "payment_required" | "unavailable" | "not_configured" | "rate_limited";
    };
    web: boolean;
    topUps: boolean;
    actions: string[];
    modelWindows: {
      pro: { limit: number; windowMs: number };
      ultra: { limit: number; windowMs: number };
      web: { limit: number; windowMs: number };
    };
  };
  topUpMode: "controlled_test" | "commercial" | "disabled";
};
export type ExpandedBackendUsage = BackendUsage & {
  planState: BackendPlanState;
  credits: { total: number; remaining: number; includedRemaining: number; purchasedRemaining: number; source: string };
  transactions: Array<Record<string, unknown>>;
};
export const getPlansCatalog = () => requestBackend<{ ok: true; catalog: ProductCatalog }>("/plans/catalog");
export const getBackendPlanState = () => requestBackend<{ ok: true; planState: BackendPlanState }>("/profile/plan-state");
export const downloadBackendDataExport = async () => {
  const response = await sendBackendRequest("/profile/export");
  if (!response.ok) throw await readBackendError(response);
  return response.blob();
};
export const requestBackendAccountDeletion = () => requestBackend<{ ok: true; request: { id: string; status: "pending"; requestedAt: string }; message: string }>("/profile/deletion-request", { method: "POST", body: JSON.stringify({ confirmed: true }) });
export const getBackendUsage = () => requestBackend<{ ok: true } & ExpandedBackendUsage>("/usage");
export const getWebSearchStatus = () => requestBackend<{ ok: true; configured: boolean; provider: string }>("/ai/web-status");

export const previewCoupon = (planId: string, billingCycle: string, couponCode: string) => requestBackend<{ ok: true; baseAmount: number; discountAmount: number; finalAmount: number; coupon: { code: string } }>("/payments/razorpay/coupon-preview", { method: "POST", body: JSON.stringify({ planId, billingCycle, couponCode }) });
export const quoteCustomTopUp = (amountInr: number) => requestBackend<{
  ok: true;
  packageId: "custom";
  amountInr: number;
  amount: number;
  currency: "INR";
  units: number;
}>("/payments/razorpay/topup-quote", { method: "POST", body: JSON.stringify({ amountInr }) });
export const createRazorpayOrder = (planId: string, billingCycle: string, couponCode?: string) => requestBackend<{ ok: true; orderId?: string; amount: number; currency: string; keyId: string; planId: string; billingCycle: string; localTestMode: boolean; message?: string }>("/payments/razorpay/order", { method: "POST", body: JSON.stringify({ planId, billingCycle, couponCode }) });
export const createRazorpayPurchaseOrder = (purchase:
  | { purchaseType: "plan"; planId: "plus" | "pro" | "max" | "advocate"; billingCycle: "monthly" | "yearly" | "one_time"; couponCode?: string }
  | { purchaseType: "topup"; packageId: string; customAmountInr?: number }
) => requestBackend<{
  ok: true;
  orderId?: string;
  amount: number;
  currency: string;
  keyId: string;
  purchaseType: "plan" | "topup";
  planId: string | null;
  packageId: string | null;
  units: number;
  billingCycle: string;
  localTestMode: boolean;
  message?: string;
}>("/payments/razorpay/order", { method: "POST", body: JSON.stringify(purchase) });
export const verifyRazorpayOrder = (payload: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) => requestBackend<{ ok: true; currentTier?: string }>("/payments/razorpay/verify", { method: "POST", body: JSON.stringify(payload) });
export const getPaymentTransactions = () => requestBackend<{ ok: true; transactions: Array<Record<string, unknown>> }>("/payments/razorpay/transactions");

export const getBackendHealth = () => requestBackend<{
  status: "ok";
  app: string;
  requestId?: string;
}>("/health");

export const processDocumentOnServer = async ({ documentId, caseId, file, category }: ProcessDocumentArgs) => {
  const formData = new FormData();
  formData.set("documentId", documentId);
  if (caseId) formData.set("caseId", caseId);
  if (category) formData.set("category", category);
  formData.set("file", file);

  const response = await sendBackendRequest("/documents/process", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw await readBackendError(response);
  }

  return response.json() as Promise<ServerDocumentProcessingResult>;
};

export const getBackendCaseDocuments = (caseId: string) => requestBackend<{ ok: true; documents: BackendCaseDocument[] }>(`/documents?caseId=${encodeURIComponent(caseId)}`);

export const updateDocumentCategoryOnServer = (
  documentId: string,
  category: DocumentCategory,
) => requestBackend<{
  ok: true;
  document: { id: string; category: DocumentCategory; categorySource: DocumentCategorySource };
}>(
  `/documents/${encodeURIComponent(documentId)}/category`,
  { method: "PATCH", body: JSON.stringify({ category }) },
);

export const saveDocumentAnnotationOnServer = (
  documentId: string,
  annotation: DocumentAnnotation,
) => requestBackend<{
  ok: true;
  annotation: DocumentAnnotation;
  annotationCount: number;
}>(
  `/documents/${encodeURIComponent(documentId)}/annotations`,
  { method: "PATCH", body: JSON.stringify(annotation) },
);

export const linkDocumentToCaseOnServer = (
  documentId: string,
  caseId: string,
) => requestBackend<{
  ok: true;
  document: {
    id: string;
    caseId: string;
    category: DocumentCategory;
    categorySource: DocumentCategorySource;
  };
}>(
  `/documents/${encodeURIComponent(documentId)}/case`,
  { method: "PATCH", body: JSON.stringify({ caseId }) },
);

export const prepareCaseQuestionOnServer = async (args: SubmitCaseQuestionArgs) => {
  return requestBackend<CaseQuestionPreparationResult>("/case-questions", {
    method: "POST",
    body: JSON.stringify(args)
  });
};

export const loadDocumentFromServer = async (documentId: string) => {
  const response = await sendBackendRequest(`/documents/${encodeURIComponent(documentId)}/content`);
  if (!response.ok) throw await readBackendError(response);
  const blob = await response.blob();
  return { blob, size: blob.size, mimeType: blob.type || "application/octet-stream" };
};

export const deleteDocumentOnServer = (documentId: string) => requestBackend<{ ok: true; deletedDocumentId: string }>(`/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
