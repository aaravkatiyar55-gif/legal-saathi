"use client";

import { AlertTriangle, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { submitIncidentReport } from "@/lib/backendApi";
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
    if (incident) closeButtonRef.current?.focus();
  }, [incident, reportView]);

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
      message: "Choose a quick technical report or describe the problem without including private legal information.",
      ...diagnostics,
    });
    setReportView("choice");
    setSubmitting(false);
    setDescription("");
    setConsent(false);
    setReportStatus("");
  }, []);

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
    setReportStatus("Sending sanitized technical diagnostics...");
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
      setReportStatus("The sanitized report could not be submitted. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitQuickReport = () => sendReport({
    action: "Complete the current action",
    reproducibility: "unknown",
    description: "",
    successPrefix: "Quick report received.",
  });

  const submitDescribedReport = (event: React.FormEvent) => {
    event.preventDefault();
    if (!consent) return;
    void sendReport({
      action: attemptedAction,
      reproducibility,
      description,
      successPrefix: "Report received.",
    });
  };

  return (
    <ErrorContext.Provider value={contextValue}>
      {children}
      {incident && (
        <div className="modal-overlay safe-error-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}>
          <section className="modal-content safe-error-modal" role="dialog" aria-modal="true" aria-labelledby="safe-error-title" onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}>
            <button ref={closeButtonRef} type="button" className="safe-error-close" onClick={close} aria-label="Close error message"><X size={18} /></button>
            <span className="safe-error-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
            <h2 id="safe-error-title">
              {reportView !== "idle"
                ? reportView === "success" ? "Problem reported" : "Report a problem"
                : incident.presentation === "product" && incident.message ? "Notice" : "Oops, something went wrong"}
            </h2>
            <p>
              {reportView !== "idle"
                ? "Send only sanitized technical diagnostics. Your chat, case details, documents, audio, and account secrets are not included."
                : incident.presentation === "product" && incident.message
                ? incident.message
                : "We couldn't complete that action. Your work has been preserved."}
            </p>
            <code>Reference: {incident.referenceId.slice(0, 18)}</code>

            {reportView === "success" ? (
              <div className="safe-report-success">
                <p role="status">{reportStatus}</p>
                <div className="safe-error-actions">
                  <button type="button" className="btn" onClick={close}>Close</button>
                </div>
              </div>
            ) : reportView === "choice" ? (
              <div className="safe-report-form">
                <p>Choose a quick metadata-only report, or add safe reproduction details.</p>
                {reportStatus && <div className="safe-report-status" role="status">{reportStatus}</div>}
                <div className="safe-error-actions">
                  <button type="button" className="btn-primary" disabled={submitting} onClick={() => void submitQuickReport()}>
                    {submitting ? "Submitting..." : "Quick report"}
                  </button>
                  <button type="button" className="btn" disabled={submitting} onClick={() => {
                    setReportView("form");
                    setReportStatus("");
                  }}>Describe the problem</button>
                  <button type="button" className="btn" disabled={submitting} onClick={() => {
                    setReportView("idle");
                    setReportStatus("");
                  }}>Back</button>
                </div>
              </div>
            ) : reportView === "form" ? (
              <form className="safe-report-form" onSubmit={submitDescribedReport}>
                <label>
                  What were you trying to do?
                  <select value={attemptedAction} onChange={(event) => setAttemptedAction(event.target.value)}>
                    <option>Complete the current action</option>
                    <option>Send a legal information question</option>
                    <option>Open or update a case</option>
                    <option>Process a document</option>
                    <option>Sign in or manage my session</option>
                    <option>Use Web or legal grounding</option>
                    <option>Open pricing or payment</option>
                  </select>
                </label>
                <label>
                  How often can you reproduce it?
                  <select value={reproducibility} onChange={(event) => setReproducibility(event.target.value as IncidentReproducibility)}>
                    <option value="unknown">Not sure</option>
                    <option value="once">Once</option>
                    <option value="sometimes">Sometimes</option>
                    <option value="always">Every time</option>
                  </select>
                </label>
                <label>
                  Optional description (not retained in the incident store)
                  <textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} rows={3} placeholder="Do not include names, case facts, legal questions, document text, contact details, or payment information." />
                </label>
                <label className="safe-report-consent">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                  Send sanitized technical diagnostics only. No chat, document, audio, cookie, token, or email content is included automatically.
                </label>
                {reportStatus && <div className="safe-report-status" role="status">{reportStatus}</div>}
                <div className="safe-error-actions">
                  <button type="button" className="btn" disabled={submitting} onClick={() => {
                    setReportView("choice");
                    setReportStatus("");
                  }}>Back</button>
                  <button type="submit" className="btn-primary" disabled={!consent || submitting}>
                    {submitting ? "Submitting..." : "Submit report"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="safe-error-actions">
                <button type="button" className="btn-primary" onClick={() => {
                  const retry = incident.retry;
                  close();
                  retry?.();
                }}>Try again</button>
                <button type="button" className="btn" onClick={() => {
                  setReportView("choice");
                  setReportStatus("");
                }}>Report problem</button>
                <button type="button" className="btn" onClick={close}>Close</button>
              </div>
            )}
          </section>
        </div>
      )}
    </ErrorContext.Provider>
  );
}
