export type PublicModelClass = "auto" | "fast" | "flash" | "pro" | "ultra" | "unknown";
export type PublicPlanClass = "free" | "plus" | "pro" | "max" | "unknown";
export type IncidentReproducibility = "once" | "sometimes" | "always" | "unknown";

const safeIncidentRouteCategories = new Set([
  "admin", "ai", "application", "auth", "case-questions", "cases", "client",
  "documents", "incidents", "payments", "profile", "rag", "transcription", "web", "unknown",
]);
const safeIncidentFeatures = new Set([
  "admin", "application", "auth", "case", "chat", "client", "document", "incidents",
  "payment", "profile", "rag", "transcription", "web", "unknown",
]);

export type SafeAppErrorDetail = {
  referenceId: string;
  errorCode: string;
  httpStatus: number;
  routeCategory: string;
  feature: string;
  modelClass?: PublicModelClass;
  webEnabled?: boolean;
  ragEnabled?: boolean;
  planClass?: PublicPlanClass;
  retryCount?: number;
  requestDurationMs?: number;
  retry?: () => void;
  message?: string;
  presentation?: "product" | "global";
};

export const safeAppErrorEvent = "legal-saathi:safe-error";

let safeDiagnosticContext: Pick<SafeAppErrorDetail, "modelClass" | "webEnabled" | "ragEnabled" | "planClass"> = {
  modelClass: "unknown",
  webEnabled: false,
  ragEnabled: false,
  planClass: "unknown",
};

export function updateSafeDiagnosticContext(context: Partial<typeof safeDiagnosticContext>) {
  safeDiagnosticContext = { ...safeDiagnosticContext, ...context };
}

export function getSafeDiagnosticContext() {
  return { ...safeDiagnosticContext };
}

export function safeIncidentRouteCategory(value: string) {
  return safeIncidentRouteCategories.has(value) ? value : "unknown";
}

export function safeIncidentFeature(value: string) {
  return safeIncidentFeatures.has(value) ? value : "unknown";
}

export function dispatchSafeAppError(detail: SafeAppErrorDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SafeAppErrorDetail>(safeAppErrorEvent, { detail }));
}

export function safeClientPlatform() {
  if (typeof navigator === "undefined") return { browserFamily: "Other", browserVersion: "", osCategory: "Other" as const };
  const agent = navigator.userAgent;
  const browser = agent.match(/Edg\/(\d+(?:\.\d+)?)/) ? ["Edge", RegExp.$1]
    : agent.match(/Chrome\/(\d+(?:\.\d+)?)/) ? ["Chrome", RegExp.$1]
      : agent.match(/Firefox\/(\d+(?:\.\d+)?)/) ? ["Firefox", RegExp.$1]
        : agent.match(/Version\/(\d+(?:\.\d+)?).*Safari/) ? ["Safari", RegExp.$1]
          : ["Other", ""];
  const osCategory = /Windows/i.test(agent) ? "Windows"
    : /Android/i.test(agent) ? "Android"
      : /iPhone|iPad|iPod/i.test(agent) ? "iOS"
        : /Mac OS/i.test(agent) ? "macOS"
          : /Linux/i.test(agent) ? "Linux" : "Other";
  return { browserFamily: browser[0], browserVersion: browser[1], osCategory } as const;
}
