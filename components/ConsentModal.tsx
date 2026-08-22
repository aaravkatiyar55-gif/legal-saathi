"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileText, X } from "lucide-react";

import {
  acceptBackendTerms,
  getBackendConsentDocument,
  getBackendConsentHistory,
  safeInlineBackendMessage,
  type ConsentDocumentBundle,
  type ConsentHistoryEvent,
  type ConsentRequirements,
} from "@/lib/backendApi";
import type { AppLanguage } from "@/lib/i18n";

interface ConsentModalProps {
  isOpen: boolean;
  requirements: ConsentRequirements;
  language: AppLanguage;
  reviewOnly?: boolean;
  onClose?: () => void;
  onRefuse?: () => void | Promise<void>;
  onConsentAccepted?: (acceptedAt: string) => void | Promise<void>;
}

function isCurrentHistoryEvent(event: ConsentHistoryEvent, requirements: ConsentRequirements) {
  return event.termsVersion === requirements.termsVersion
    && event.privacyVersion === requirements.privacyVersion
    && event.consentVersion === requirements.consentVersion;
}

export default function ConsentModal({
  isOpen,
  requirements,
  language,
  reviewOnly = false,
  onClose,
  onRefuse,
  onConsentAccepted,
}: ConsentModalProps) {
  const [accepted, setAccepted] = useState(false);
  const [expanded, setExpanded] = useState(reviewOnly);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [policy, setPolicy] = useState<ConsentDocumentBundle | null>(null);
  const [policyError, setPolicyError] = useState("");
  const [history, setHistory] = useState<ConsentHistoryEvent[]>([]);
  const [historyError, setHistoryError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setAccepted(false);
    setExpanded(reviewOnly);
    setError("");
    setPolicy(null);
    setPolicyError("");
    void getBackendConsentDocument()
      .then((result) => {
        if (active) setPolicy(result.policy);
      })
      .catch(() => {
        if (active) setPolicyError("The current Terms could not be loaded. Check your connection and try again.");
      });
    return () => { active = false; };
  }, [isOpen, reviewOnly, requirements.termsVersion, requirements.privacyVersion, requirements.consentVersion]);

  useEffect(() => {
    if (!isOpen || !reviewOnly) return;
    let active = true;
    setHistoryError("");
    void getBackendConsentHistory()
      .then((result) => {
        if (active) setHistory(result.events);
      })
      .catch(() => {
        if (active) setHistoryError("Consent history could not be loaded right now.");
      });
    return () => { active = false; };
  }, [isOpen, reviewOnly]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "a[href]",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const focusFirst = window.setTimeout(() => {
      const first = dialog?.querySelector<HTMLElement>(focusableSelector);
      (first ?? dialog)?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialog) return;
      if (event.key === "Escape" && reviewOnly && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusFirst);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, reviewOnly]);

  const versionsMatch = useMemo(() => Boolean(
    policy
    && policy.terms.version === requirements.termsVersion
    && policy.privacy.version === requirements.privacyVersion,
  ), [policy, requirements.termsVersion, requirements.privacyVersion]);

  if (!isOpen) return null;

  const handleAccept = async () => {
    if (!accepted) {
      setError("Select the acceptance checkbox before continuing.");
      return;
    }
    if (!policy || !versionsMatch) {
      setError("The current Terms are not ready yet. Reload them before continuing.");
      return;
    }
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await acceptBackendTerms({
        requirements,
        accepted: true,
        locale: language,
      });
      await onConsentAccepted?.(result.consentedAt);
    } catch (acceptError) {
      setError(
        safeInlineBackendMessage(acceptError, "Consent could not be recorded. Please try again.")
        || "Consent could not be recorded. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRefuse = async () => {
    if (!onRefuse || loading) return;
    setLoading(true);
    setError("");
    try {
      await onRefuse();
    } catch {
      setError("We couldn't sign you out. You remain signed in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay consent-overlay">
      <section
        ref={dialogRef}
        className="auth-card consent-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        aria-describedby="consent-description"
        tabIndex={-1}
      >
        {reviewOnly && onClose && (
          <button className="consent-close" type="button" onClick={onClose} aria-label="Close consent review">
            <X size={18} />
          </button>
        )}

        <div className="consent-icon" aria-hidden="true"><FileText size={21} /></div>
        <h2 id="consent-title">{reviewOnly ? "Your consent" : "Terms and Privacy"}</h2>
        <p id="consent-description" className="text-secondary consent-summary">
          {policy?.summary ?? "Review the Terms, Privacy Policy, AI-assisted legal-information limitations, account and data-processing rules, and payment/refund terms."}
        </p>

        <button
          className="consent-view-more"
          type="button"
          aria-expanded={expanded}
          aria-controls="consent-full-policy"
          onClick={() => setExpanded((current) => !current)}
          disabled={!policy}
        >
          <span>{expanded ? "Hide details" : "View more"}</span>
          <ChevronDown size={17} aria-hidden="true" className={expanded ? "is-expanded" : ""} />
        </button>

        {policyError && <div className="consent-inline-error" role="alert">{policyError}</div>}
        {!policy && !policyError && <div className="consent-loading" role="status">Loading the current policy...</div>}

        {expanded && policy && (
          <div id="consent-full-policy" className="consent-full-policy" tabIndex={0}>
            {[policy.terms, policy.privacy].map((document) => (
              <article key={document.id} className="consent-document">
                <header>
                  <h3>{document.title}</h3>
                  <p>Version {document.version} | Effective {document.effectiveDate}</p>
                </header>
                {document.sections.map((section) => (
                  <section key={`${document.id}-${section.heading}`}>
                    <h4>{section.heading}</h4>
                    {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </section>
                ))}
              </article>
            ))}
          </div>
        )}

        <p className="consent-version">
          Terms {requirements.termsVersion} | Privacy {requirements.privacyVersion} | Consent {requirements.consentVersion}
        </p>

        {!reviewOnly && (
          <>
            <label className={`consent-single-choice${accepted ? " is-accepted" : ""}`}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => {
                  setAccepted(event.target.checked);
                  setError("");
                }}
              />
              <span>
                I accept the Terms and Conditions, Privacy Policy, AI-assisted legal-information limitations,
                account and data-processing rules, and applicable payment/refund terms.
              </span>
            </label>
            {!accepted && <p className="consent-instruction">Select the checkbox to enable Accept and continue.</p>}
          </>
        )}

        {reviewOnly && (
          <section aria-labelledby="consent-history-title" className="consent-history">
            <h3 id="consent-history-title">Acceptance history</h3>
            {historyError && <div className="consent-inline-error" role="alert">{historyError}</div>}
            {!historyError && history.length === 0 && <p className="text-secondary">No server-side acceptance record is available.</p>}
            {history.map((event) => (
              <div key={event.id} className="consent-history-event">
                <strong>{isCurrentHistoryEvent(event, requirements) ? "Current policy acceptance" : "Previous policy acceptance"}</strong>
                <span>{new Date(event.acceptedAt).toLocaleString("en-IN")}</span>
                <span>Terms {event.termsVersion} | Privacy {event.privacyVersion} | Consent {event.consentVersion}</span>
              </div>
            ))}
          </section>
        )}

        {error && <div className="consent-inline-error" role="alert">{error}</div>}

        <div className="consent-actions">
          {reviewOnly ? (
            <button className="btn-primary consent-accept" type="button" onClick={onClose}>Close</button>
          ) : (
            <>
              <button
                className="btn-primary consent-accept"
                type="button"
                onClick={() => void handleAccept()}
                disabled={loading || !accepted || !policy || !versionsMatch}
              >
                {loading ? "Saving acceptance..." : "Accept and continue"}
              </button>
              <button className="consent-refuse" type="button" onClick={() => void handleRefuse()} disabled={loading}>
                Refuse and log out
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
