"use client";

import { AlertTriangle, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { submitIncidentReport } from "@/lib/backendApi";
import { translateUiText, type AppLanguage } from "@/lib/i18n";
import { appCopy, appLanguageChangeEvent, currentDocumentAppLanguage, type AppCopyKey } from "@/lib/i18n/appCopy";
import { getModalFocusCycleTargetInContainer } from "@/lib/modalFocusTrap";
import {
  IncidentReproducibility,
  SafeAppErrorDetail,
  getSafeDiagnosticContext,
  safeAppErrorEvent,
  safeClientPlatform,
  safeIncidentFeature,
  safeIncidentRouteCategory,
} from "@/lib/safeIncident";

type ErrorContextValue = {
  showSafeError: (detail: SafeAppErrorDetail) => void;
  clearSafeError: (referenceId?: string) => void;
  openReportProblem: () => void;
};
const ErrorContext = createContext<ErrorContextValue>({
  showSafeError: () => undefined,
  clearSafeError: () => undefined,
  openReportProblem: () => undefined,
});
type ReportView = "idle" | "choice" | "form" | "success";

export function useSafeAppError() {
  return useContext(ErrorContext);
}

export default function AppErrorProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(() => currentDocumentAppLanguage());
  const [incident, setIncident] = useState<SafeAppErrorDetail | null>(null);
  const [reportView, setReportView] = useState<ReportView>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [attemptedAction, setAttemptedAction] = useState("Complete the current action");
  const [reproducibility, setReproducibility] = useState<IncidentReproducibility>("unknown");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [reportStatus, setReportStatus] = useState("");
  const reportViewRef = useRef<ReportView>("idle");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const incidentReferenceId = incident?.referenceId;
  const copy = useCallback((key: AppCopyKey) => appCopy(language, key), [language]);

  useEffect(() => {
    const onLanguageChange = (event: Event) => {
      const nextLanguage = (event as CustomEvent<AppLanguage>).detail;
      setLanguage(nextLanguage ?? currentDocumentAppLanguage());
    };
    setLanguage(currentDocumentAppLanguage());
    document.addEventListener(appLanguageChangeEvent, onLanguageChange);
    return () => document.removeEventListener(appLanguageChangeEvent, onLanguageChange);
  }, []);

  const showSafeError = useCallback((detail: SafeAppErrorDetail) => {
    // Reporting is intentionally isolated from the global error channel. A
    // report transport failure must stay inline instead of replacing its own
    // form with a second Oops modal.
    if (reportViewRef.current !== "idle") return;
    setIncident(detail);
    setReportView("idle");
    setSubmitting(false);
    setDescription("");
    setConsent(false);
    setReportStatus("");
  }, []);

  useEffect(() => {
    reportViewRef.current = reportView;
  }, [reportView]);

  useEffect(() => {
    const listener = (event: Event) => showSafeError((event as CustomEvent<SafeAppErrorDetail>).detail);
    window.addEventListener(safeAppErrorEvent, listener);
    return () => window.removeEventListener(safeAppErrorEvent, listener);
  }, [showSafeError]);

  useEffect(() => {
    if (!incidentReferenceId) return;
    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (previouslyFocusedElementRef.current?.isConnected) previouslyFocusedElementRef.current.focus();
    };
  }, [incidentReferenceId]);

  const openReportProblem = useCallback(() => {
    const diagnostics = getSafeDiagnosticContext();
    setIncident({
      referenceId: `incident_${crypto.randomUUID()}`,
      errorCode: "USER_REPORTED_PROBLEM",
      httpStatus: 0,
      routeCategory: "client",
      feature: "application",
      retryCount: 0,
      requestDurationMs: 0,
      presentation: "product",
      message: copy("error.userReportPrompt"),
      ...diagnostics,
    });
    setReportView("choice");
    setSubmitting(false);
    setDescription("");
    setConsent(false);
    setReportStatus("");
  }, [copy]);

  const close = () => {
    setIncident(null);
    setReportView("idle");
    setSubmitting(false);
    setReportStatus("");
    setDescription("");
    setConsent(false);
    setReproducibility("unknown");
  };
  const clearSafeError = useCallback((referenceId?: string) => {
    if (reportViewRef.current !== "idle") return;
    setIncident((current) => {
      if (!current || (referenceId && current.referenceId !== referenceId)) return current;
      return null;
    });
  }, []);
  const contextValue = useMemo(
    () => ({ showSafeError, clearSafeError, openReportProblem }),
    [clearSafeError, openReportProblem, showSafeError],
  );

  const sendReport = async (options: {
    action: string;
    reproducibility: IncidentReproducibility;
    description: string;
    successPrefix: string;
  }) => {
    if (!incident || submitting) return;
    setSubmitting(true);
    setReportStatus(copy("error.sending"));
    try {
      const platform = safeClientPlatform();
      const result = await submitIncidentReport({
        requestId: incident.referenceId,
        timestamp: new Date().toISOString(),
        deploymentVersion: process.env.NEXT_PUBLIC_DEPLOYMENT_VERSION || "local-development",
        frontendVersion: process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0",
        routeCategory: safeIncidentRouteCategory(incident.routeCategory),
        feature: safeIncidentFeature(incident.feature),
        errorCode: incident.errorCode,
        httpStatus: incident.httpStatus,
        modelClass: incident.modelClass ?? "unknown",
        webEnabled: incident.webEnabled ?? false,
        ragEnabled: incident.ragEnabled ?? false,
        planClass: incident.planClass ?? "unknown",
        browserFamily: platform.browserFamily,
        browserVersion: platform.browserVersion,
        osCategory: platform.osCategory,
        retryCount: incident.retryCount ?? 0,
        requestDurationMs: Math.max(0, Math.round(incident.requestDurationMs ?? 0)),
        online: navigator.onLine,
        attemptedAction: options.action,
        reproducibility: options.reproducibility,
        description: options.description,
        diagnosticsConsent: true,
      });
      setReportStatus(`${options.successPrefix} Incident: ${result.incident.id}`);
      setReportView("success");
    } catch {
      setReportStatus(copy("error.submitFailure"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitQuickReport = () => sendReport({
    action: "Complete the current action",
    reproducibility: "unknown",
    description: "",
    successPrefix: copy("error.quickReceived"),
  });

  const submitDescribedReport = (event: React.FormEvent) => {
    event.preventDefault();
    if (!consent) return;
    void sendReport({
      action: attemptedAction,
      reproducibility,
      description,
      successPrefix: copy("error.reportReceived"),
    });
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const nextFocus = getModalFocusCycleTargetInContainer(event.currentTarget, document.activeElement, event.shiftKey);
    if (!nextFocus) return;
    event.preventDefault();
    nextFocus.focus();
  };

  return (
    <ErrorContext.Provider value={contextValue}>
      {children}
      {incident && (
        <div className="modal-overlay safe-error-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}>
          <section className="modal-content safe-error-modal" role="dialog" aria-modal="true" aria-labelledby="safe-error-title" onKeyDown={handleDialogKeyDown}>
            <button ref={closeButtonRef} type="button" className="safe-error-close" onClick={close} aria-label={copy("error.closeAria")}><X size={18} /></button>
            <span className="safe-error-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
            <h2 id="safe-error-title">
              {reportView !== "idle"
                ? reportView === "success" ? copy("error.reportedTitle") : copy("error.reportTitle")
                : incident.presentation === "product" && incident.message ? copy("error.noticeTitle") : copy("error.unexpectedTitle")}
            </h2>
            <p>
              {reportView !== "idle"
                ? copy("error.sanitizedSummary")
                : incident.presentation === "product" && incident.message
                ? translateUiText(incident.message, language)
                : copy("error.genericActionFailure")}
            </p>
            <code>{copy("error.reference")}: {incident.referenceId.slice(0, 18)}</code>

            {reportView === "success" ? (
              <div className="safe-report-success">
                <p role="status">{reportStatus}</p>
                <div className="safe-error-actions">
                  <button type="button" className="btn" onClick={close}>{copy("error.close")}</button>
                </div>
              </div>
            ) : reportView === "choice" ? (
              <div className="safe-report-form">
                <p>{copy("error.choice")}</p>
                {reportStatus && <div className="safe-report-status" role="status">{reportStatus}</div>}
                <div className="safe-error-actions">
                  <button type="button" className="btn-primary" disabled={submitting} onClick={() => void submitQuickReport()}>
                    {submitting ? copy("error.submitting") : copy("error.quickReport")}
                  </button>
                  <button type="button" className="btn" disabled={submitting} onClick={() => {
                    setReportView("form");
                    setReportStatus("");
                  }}>{copy("error.describe")}</button>
                  <button type="button" className="btn" disabled={submitting} onClick={() => {
                    setReportView("idle");
                    setReportStatus("");
                  }}>{copy("error.back")}</button>
                </div>
              </div>
            ) : reportView === "form" ? (
              <form className="safe-report-form" onSubmit={submitDescribedReport}>
                <label>
                  {copy("error.actionQuestion")}
                  <select value={attemptedAction} onChange={(event) => setAttemptedAction(event.target.value)}>
                    <option value="Complete the current action">{copy("error.action.general")}</option>
                    <option value="Send a legal information question">{copy("error.action.question")}</option>
                    <option value="Open or update a case">{copy("error.action.case")}</option>
                    <option value="Process a document">{copy("error.action.document")}</option>
                    <option value="Sign in or manage my session">{copy("error.action.session")}</option>
                    <option value="Use Web or legal grounding">{copy("error.action.web")}</option>
                    <option value="Open pricing or payment">{copy("error.action.payment")}</option>
                  </select>
                </label>
                <label>
                  {copy("error.frequencyQuestion")}
                  <select value={reproducibility} onChange={(event) => setReproducibility(event.target.value as IncidentReproducibility)}>
                    <option value="unknown">{copy("error.frequency.unknown")}</option>
                    <option value="once">{copy("error.frequency.once")}</option>
                    <option value="sometimes">{copy("error.frequency.sometimes")}</option>
                    <option value="always">{copy("error.frequency.always")}</option>
                  </select>
                </label>
                <label>
                  {copy("error.descriptionLabel")}
                  <textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} rows={3} placeholder={copy("error.descriptionPlaceholder")} />
                </label>
                <label className="safe-report-consent">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                  {copy("error.consent")}
                </label>
                {reportStatus && <div className="safe-report-status" role="status">{reportStatus}</div>}
                <div className="safe-error-actions">
                  <button type="button" className="btn" disabled={submitting} onClick={() => {
                    setReportView("choice");
                    setReportStatus("");
                  }}>{copy("error.back")}</button>
                  <button type="submit" className="btn-primary" disabled={!consent || submitting}>
                    {submitting ? copy("error.submitting") : copy("error.submit")}
                  </button>
                </div>
              </form>
            ) : (
              <div className="safe-error-actions">
                {incident.retry && (
                  <button type="button" className="btn-primary" onClick={() => {
                    const retry = incident.retry;
                    close();
                    retry?.();
                  }}>{copy("error.tryAgain")}</button>
                )}
                <button type="button" className="btn" onClick={() => {
                  setReportView("choice");
                  setReportStatus("");
                }}>{copy("error.report")}</button>
                <button type="button" className="btn" onClick={close}>{copy("error.close")}</button>
              </div>
            )}
          </section>
        </div>
      )}
    </ErrorContext.Provider>
  );
}
