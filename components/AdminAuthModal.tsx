"use client";

import {
  createBackendAdminSession,
  getBackendAdminReadiness,
  safeInlineBackendMessage,
  setupBackendAdminCredential,
} from "@/lib/backendApi";
import { Lock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AdminAuthModal({ isOpen, onClose, onSuccess }: AdminAuthModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<"loading" | "setup" | "challenge" | "error">("loading");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setPassword("");
    setConfirmation("");
    setError("");
    setMode("loading");
    void getBackendAdminReadiness()
      .then((result) => setMode(result.credentialConfigured ? "challenge" : "setup"))
      .catch((readinessError) => {
        setError(safeInlineBackendMessage(readinessError, "Admin authorization is unavailable."));
        setMode("error");
      });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || mode === "loading" || mode === "error") return;
    passwordRef.current?.focus();
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        event.preventDefault();
        onClose();
        returnFocusRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])",
      )];
      if (focusable.length === 0) return;
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
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSubmitting) return;
    setPassword("");
    setConfirmation("");
    setError("");
    onClose();
    returnFocusRef.current?.focus();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || (mode === "setup" && !confirmation)) return;
    if (mode === "setup" && (
      password.length < 14
      || password.length > 128
      || !/[a-z]/.test(password)
      || !/[A-Z]/.test(password)
      || !/\d/.test(password)
      || !/[^A-Za-z0-9]/.test(password)
      || password !== confirmation
    )) {
      setError(password !== confirmation
        ? "The password confirmation does not match."
        : "Use 14-128 characters with uppercase, lowercase, a number, and a symbol.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      if (mode === "setup") {
        await setupBackendAdminCredential(password, confirmation);
      }
      await createBackendAdminSession(password);
      setPassword("");
      setConfirmation("");
      onSuccess();
    } catch (sessionError) {
      setError(safeInlineBackendMessage(sessionError, "Admin authorization failed."));
      setPassword("");
      setConfirmation("");
      window.setTimeout(() => passwordRef.current?.focus(), 0);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay admin-auth-overlay" onMouseDown={handleClose}>
      <div
        ref={dialogRef}
        className="modal-content admin-auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close-icon" type="button" aria-label="Close admin authorization" onClick={handleClose} disabled={isSubmitting}>
          <X size={18} aria-hidden="true" />
        </button>
        <div className="admin-auth-icon" aria-hidden="true"><Lock size={26} /></div>
        <h2 id="admin-auth-title">{mode === "setup" ? "Create admin password" : "Admin authorization"}</h2>
        <p className="text-secondary">
          {mode === "setup"
            ? "Create a private password for this authorized administrator account."
            : "Confirm the private password for this authorized administrator account."}
        </p>

        {mode === "loading" ? (
          <div className="admin-auth-loading" role="status">Checking authorization...</div>
        ) : mode === "error" ? (
          <div className="admin-auth-error" role="alert">{error || "Admin authorization is unavailable."}</div>
        ) : (
          <form className="admin-auth-form" onSubmit={handleSubmit}>
            {error && <div className="admin-auth-error" role="alert">{error}</div>}
            <label>
              <span>{mode === "setup" ? "New admin password" : "Admin password"}</span>
              <input
                ref={passwordRef}
                type="password"
                className="apple-glass-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "setup" ? "new-password" : "current-password"}
                minLength={mode === "setup" ? 14 : undefined}
                maxLength={128}
                required
              />
            </label>
            {mode === "setup" && (
              <>
                <label>
                  <span>Confirm admin password</span>
                  <input
                    type="password"
                    className="apple-glass-input"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="new-password"
                    minLength={14}
                    maxLength={128}
                    required
                  />
                </label>
                <p className="admin-password-policy">14-128 characters with uppercase, lowercase, a number, and a symbol.</p>
              </>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!password || (mode === "setup" && !confirmation) || isSubmitting}
            >
              {isSubmitting ? "Authorizing..." : mode === "setup" ? "Create and continue" : "Continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
