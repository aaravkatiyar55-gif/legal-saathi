"use client";

import {
  AuthClientError,
  createPassword,
  exchangeGoogleCredential,
  getPrimaryAuthConfig,
  loginWithPassword,
  PrimaryAuthResult,
  requestPasswordReset,
  resetPendingAuthState,
  restorePendingAuthState,
  startEmailOtp,
  verifyEmailOtp,
  verifyPasswordRecovery,
  verifyMfaChallenge,
} from "@/lib/authClient";
import {
  createBackendProfileSession,
  restoreBackendSession,
  type SessionPayload,
} from "@/lib/backendApi";
import {
  configureGoogleIdentity,
  createGoogleIdentityNonce,
  detachGoogleIdentityReceiver,
  shouldReplaceGoogleIdentityScript,
  type GoogleIdApi,
  type GoogleIdentityScriptState,
} from "@/lib/googleIdentityScript";
import { authModalCopy, formatAuthModalCopy } from "@/lib/i18n/authModalCopy";
import { translateUiText, type AppLanguage } from "@/lib/i18n";
import { getModalFocusCycleTargetInContainer } from "@/lib/modalFocusTrap";
import { ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const AVATAR_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#22c55e", "#06b6d4", "#3b82f6"];
const explicitDevelopmentAuth = process.env.NEXT_PUBLIC_ENABLE_DEVELOPMENT_AUTH === "true";

let googleScriptPromise: Promise<GoogleIdApi> | null = null;

function loadGoogleIdentity() {
  if (googleScriptPromise) return googleScriptPromise;
  const pending = new Promise<GoogleIdApi>((resolve, reject) => {
    const resolveApi = () => {
      const api = (window as typeof window & { google?: { accounts?: { id?: GoogleIdApi } } }).google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error("GOOGLE_LIBRARY_UNAVAILABLE"));
    };
    let existing = document.querySelector<HTMLScriptElement>('script[data-legal-saathi-google="true"]');
    const apiAvailable = Boolean((window as typeof window & { google?: unknown }).google);
    const existingState = (existing?.dataset.legalSaathiGoogleState ?? "") as GoogleIdentityScriptState;
    if (existing && shouldReplaceGoogleIdentityScript(existingState, apiAvailable)) {
      existing.remove();
      existing = null;
    }
    if (existing) {
      if (apiAvailable) resolveApi();
      else {
        existing.addEventListener("load", resolveApi, { once: true });
        existing.addEventListener("error", () => {
          existing.dataset.legalSaathiGoogleState = "failed";
          reject(new Error("GOOGLE_LIBRARY_UNAVAILABLE"));
        }, { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.legalSaathiGoogle = "true";
    script.dataset.legalSaathiGoogleState = "loading";
    script.addEventListener("load", () => {
      script.dataset.legalSaathiGoogleState = "loaded";
      resolveApi();
    }, { once: true });
    script.addEventListener("error", () => {
      script.dataset.legalSaathiGoogleState = "failed";
      reject(new Error("GOOGLE_LIBRARY_UNAVAILABLE"));
    }, { once: true });
    document.head.appendChild(script);
  });
  googleScriptPromise = pending.catch((error) => {
    googleScriptPromise = null;
    throw error;
  });
  return googleScriptPromise;
}

interface AuthModalProps {
  isOpen: boolean;
  language: AppLanguage;
  onClose: () => void;
  onLoginSuccess: (
    user: { displayName: string; email: string; avatarColor: string },
    session: SessionPayload,
  ) => Promise<void>;
  reason?: string;
}

type AuthMode = "initial" | "email" | "otp" | "password_login" | "password_setup" | "mfa_challenge" | "reset" | "reset_otp" | "dev";

function authErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AuthClientError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return "Google sign-in was cancelled. You can try again when ready.";
  return fallback;
}

export default function AuthModal({ isOpen, language, onClose, onLoginSuccess, reason }: AuthModalProps) {
  const t = useCallback((key: Parameters<typeof authModalCopy>[1]) => authModalCopy(language, key), [language]);
  const [authMode, setAuthMode] = useState<AuthMode>("initial");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [authConfigLoading, setAuthConfigLoading] = useState(true);
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);
  const [emailOtpAvailable, setEmailOtpAvailable] = useState(false);
  const [passwordAvailable, setPasswordAvailable] = useState(false);
  const [googleProviderReady, setGoogleProviderReady] = useState(false);
  const [developmentAuthEnabled, setDevelopmentAuthEnabled] = useState(false);
  const [googleRenderAttempt, setGoogleRenderAttempt] = useState(0);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const credentialExchangeInFlight = useRef(false);
  const onLoginSuccessRef = useRef(onLoginSuccess);

  useEffect(() => { onLoginSuccessRef.current = onLoginSuccess; }, [onLoginSuccess]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (previouslyFocusedElementRef.current?.isConnected) previouslyFocusedElementRef.current.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setNotice("");
    setIsGoogleReady(false);
    setAuthConfigLoading(true);
    void getPrimaryAuthConfig()
      .then((config) => {
        setSupabaseConfigured(config.authAvailable);
        setEmailOtpAvailable(config.emailOtpAvailable);
        setPasswordAvailable(config.passwordAvailable);
        setGoogleClientId(config.googleAvailable ? (config.googleClientId ?? "") : "");
        setGoogleProviderReady(config.googleProviderReady);
        setDevelopmentAuthEnabled(explicitDevelopmentAuth && config.developmentAuthEnabled);
      })
      .catch((configError) => setError(authErrorMessage(configError, t("configurationCheckFailed"))))
      .finally(() => setAuthConfigLoading(false));
  }, [isOpen, t]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void restorePendingAuthState()
      .then((pending) => {
        if (active && pending.pending && pending.next) setAuthMode(pending.next);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [isOpen]);

  const finishLogin = useCallback(async () => {
    const restored = await restoreBackendSession();
    if (!restored?.profile || !restored.session) throw new Error("APP_SESSION_NOT_CREATED");
    await onLoginSuccessRef.current({
      displayName: restored.profile.displayName || restored.profile.email,
      email: restored.profile.email,
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    }, restored.session);
  }, []);

  const applyResult = useCallback(async (result: PrimaryAuthResult) => {
    setPassword("");
    setConfirmation("");
    setOtp("");
    if (result.next === "password_setup") {
      setAuthMode("password_setup");
      return;
    }
    if (result.next === "mfa_challenge") {
      setAuthMode("mfa_challenge");
      return;
    }
    await finishLogin();
  }, [finishLogin]);

  useEffect(() => {
    if (!isOpen || !googleClientId || !googleButtonRef.current || !supabaseConfigured) return;
    let cancelled = false;
    const readinessTimeout = window.setTimeout(() => {
      if (!cancelled) {
        setIsGoogleReady(false);
        setError(t("googleLoadingFailed"));
      }
    }, 8_000);
    const receiveCredential = async (credential: string, rawNonce: string) => {
      if (credentialExchangeInFlight.current) return;
      credentialExchangeInFlight.current = true;
      setError("");
      setNotice("");
      setIsSubmitting(true);
      try {
        const result = await exchangeGoogleCredential(credential, rawNonce);
        if (!cancelled) await applyResult(result);
      } catch (exchangeError) {
        if (!cancelled) {
          setError(authErrorMessage(exchangeError, t("googleExchangeFailed")));
          setGoogleRenderAttempt((attempt) => attempt + 1);
        }
      } finally {
        credentialExchangeInFlight.current = false;
        if (!cancelled) setIsSubmitting(false);
      }
    };
    void Promise.all([loadGoogleIdentity(), createGoogleIdentityNonce()]).then(([api, nonce]) => {
      if (cancelled || !googleButtonRef.current) return;
      configureGoogleIdentity(api, googleClientId, nonce, receiveCredential);
      googleButtonRef.current.replaceChildren();
      const availableWidth = Math.floor(googleButtonRef.current.getBoundingClientRect().width);
      const buttonWidth = Math.max(200, Math.min(360, availableWidth || 360));
      api.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: buttonWidth,
      });
      window.clearTimeout(readinessTimeout);
      setIsGoogleReady(true);
    }).catch(() => {
      window.clearTimeout(readinessTimeout);
      if (!cancelled) {
        setIsGoogleReady(false);
        setError(t("googleInitializationFailed"));
      }
    });
    return () => {
      cancelled = true;
      detachGoogleIdentityReceiver(receiveCredential);
      window.clearTimeout(readinessTimeout);
    };
  }, [applyResult, googleClientId, googleRenderAttempt, isOpen, supabaseConfigured, t]);

  useEffect(() => {
    if (!isOpen) {
      resetPendingAuthState();
      setAuthMode("initial");
      setOtp("");
      setPassword("");
      setConfirmation("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async (task: () => Promise<void>) => {
    setError("");
    setNotice("");
    setIsSubmitting(true);
    try { await task(); }
    catch (submitError) { setError(authErrorMessage(submitError, t("signInFailed"))); }
    finally { setIsSubmitting(false); }
  };

  const cleanEmail = email.trim().toLowerCase();
  const backToInitial = () => {
    resetPendingAuthState();
    setError("");
    setNotice("");
    setAuthMode("initial");
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nextFocus = getModalFocusCycleTargetInContainer(event.currentTarget, document.activeElement, event.shiftKey);
    if (!nextFocus) return;
    event.preventDefault();
    nextFocus.focus();
  };

  return (
    <div className="auth-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, display: "grid", placeItems: "center", background: "rgba(0,0,0,.72)", backdropFilter: "blur(8px)", padding: "1rem" }}>
      <section className="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title" onKeyDown={handleDialogKeyDown} onClick={(event) => event.stopPropagation()} style={{ position: "relative", width: "min(420px, 100%)", padding: "2.25rem", background: "rgba(17,17,17,.96)", border: "1px solid var(--border-default)", borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,.6)" }}>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={t("closeAria")} style={{ position: "absolute", top: "1rem", right: "1rem", width: 34, height: 34, display: "grid", placeItems: "center", border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--bg-elevated)", color: "var(--text-secondary)", cursor: "pointer" }}><X size={17} /></button>
        <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", marginBottom: "1.25rem", borderRadius: 10, background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}><ShieldCheck size={22} /></div>
        <h2 id="auth-title" style={{ fontSize: "1.55rem", marginBottom: ".45rem" }}>
          {authMode === "password_setup" ? t("passwordSetupTitle") : authMode === "mfa_challenge" ? t("mfaTitle") : t("initialTitle")}
        </h2>
        <p className="text-secondary" style={{ lineHeight: 1.55, marginBottom: "1.4rem" }}>
          {authMode === "password_setup" ? t("passwordSetupDescription") : authMode === "mfa_challenge" ? t("mfaDescription") : t("initialDescription")}
        </p>
        {reason && authMode === "initial" && (
          <div role="status" className="auth-signin-reason">{translateUiText(reason, language)}</div>
        )}

        {error && <div role="alert" style={{ padding: ".7rem .8rem", borderRadius: 8, border: "1px solid rgba(239,68,68,.28)", background: "rgba(239,68,68,.1)", color: "#fca5a5", fontSize: ".86rem", marginBottom: "1rem" }}>{translateUiText(error, language)}</div>}
        {notice && <div role="status" style={{ padding: ".7rem .8rem", borderRadius: 8, border: "1px solid rgba(34,197,94,.28)", background: "rgba(34,197,94,.08)", color: "#86efac", fontSize: ".86rem", marginBottom: "1rem" }}>{translateUiText(notice, language)}</div>}
        {authConfigLoading && <div role="status" style={{ padding: ".7rem .8rem", borderRadius: 8, border: "1px solid var(--border-default)", color: "var(--text-secondary)", fontSize: ".86rem", marginBottom: "1rem" }}>{t("checkingAvailability")}</div>}
        {!authConfigLoading && !supabaseConfigured && <div role="status" style={{ padding: ".7rem .8rem", borderRadius: 8, border: "1px solid rgba(245,158,11,.28)", color: "#fbbf24", fontSize: ".86rem", marginBottom: "1rem" }}>{t("supabaseUnavailable")}</div>}

        {authMode === "initial" && <div style={{ display: "grid", gap: "1rem" }}>
          <div style={{ minHeight: 44, opacity: isSubmitting ? .6 : 1, pointerEvents: isSubmitting ? "none" : "auto" }}>
            {googleClientId && supabaseConfigured ? <div ref={googleButtonRef} className="google-signin-slot" aria-label={t("continueWithGoogle")} /> : <button className="btn" type="button" disabled style={{ width: "100%", justifyContent: "center" }}>{authConfigLoading ? t("checkingGoogle") : t("continueWithGoogle")}</button>}
            {googleClientId && supabaseConfigured && !isGoogleReady && <span className="text-secondary" style={{ fontSize: ".82rem" }}>{t("loadingGoogle")}</span>}
            {googleClientId && supabaseConfigured && !authConfigLoading && !isGoogleReady && (
              <button
                type="button"
                className="btn"
                style={{ width: "100%", justifyContent: "center", marginTop: ".55rem" }}
                onClick={() => {
                  setError("");
                  setIsGoogleReady(false);
                  setGoogleRenderAttempt((attempt) => attempt + 1);
                }}
              >
                {t("retryGoogle")}
              </button>
            )}
            {googleClientId && supabaseConfigured && !googleProviderReady && <span className="text-secondary" style={{ display: "block", marginTop: ".45rem", fontSize: ".82rem" }}>{t("googleProviderPending")}</span>}
            {!googleClientId && supabaseConfigured && <span className="text-secondary" style={{ display: "block", marginTop: ".45rem", fontSize: ".82rem" }}>{t("googleClientUnavailable")}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", color: "var(--text-secondary)", fontSize: ".86rem" }}><div style={{ flex: 1, height: 1, background: "var(--border-default)" }} /><span>{t("separatorOr")}</span><div style={{ flex: 1, height: 1, background: "var(--border-default)" }} /></div>
          <button className="btn" type="button" disabled={!emailOtpAvailable} style={{ width: "100%", justifyContent: "center", padding: ".75rem" }} onClick={() => setAuthMode("email")}>{t("continueWithEmail")}</button>
          <button type="button" disabled={!passwordAvailable} onClick={() => setAuthMode("password_login")} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", textDecoration: "underline" }}>{t("continueWithPassword")}</button>
          {developmentAuthEnabled && <button className="btn" type="button" onClick={() => setAuthMode("dev")} style={{ color: "#fbbf24", borderColor: "rgba(251,191,36,.3)", justifyContent: "center" }}>{t("developmentHelper")}</button>}
        </div>}

        {authMode === "email" && <form onSubmit={(event) => { event.preventDefault(); void submit(async () => { await startEmailOtp(cleanEmail); setAuthMode("otp"); setNotice(t("verificationCodeSentNotice")); }); }} style={{ display: "grid", gap: "1rem" }}>
          <AuthInput label={t("emailAddress")} type="email" value={email} onChange={setEmail} autoComplete="email" />
          <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ justifyContent: "center" }}>{isSubmitting ? t("sending") : t("sendVerificationCode")}</button>
          <BackButton label={t("back")} onClick={backToInitial} />
        </form>}

        {authMode === "otp" && <form onSubmit={(event) => { event.preventDefault(); void submit(async () => applyResult(await verifyEmailOtp(cleanEmail, otp))); }} style={{ display: "grid", gap: "1rem" }}>
          <p className="text-secondary" style={{ margin: 0, fontSize: ".88rem" }}>{formatAuthModalCopy(language, "verificationCodeSentTo", { email: cleanEmail })}</p>
          <AuthInput label={t("verificationCode")} value={otp} onChange={setOtp} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ justifyContent: "center" }}>{isSubmitting ? t("verifying") : t("verifyEmail")}</button>
          <BackButton label={t("back")} onClick={() => setAuthMode("email")} />
        </form>}

        {authMode === "password_login" && <form onSubmit={(event) => { event.preventDefault(); void submit(async () => applyResult(await loginWithPassword(cleanEmail, password))); }} style={{ display: "grid", gap: "1rem" }}>
          <AuthInput label={t("emailAddress")} type="email" value={email} onChange={setEmail} autoComplete="email" />
          <AuthInput label={t("password")} type="password" value={password} onChange={setPassword} autoComplete="current-password" />
          <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ justifyContent: "center" }}>{isSubmitting ? t("signingIn") : t("signIn")}</button>
          <button type="button" onClick={() => setAuthMode("reset")} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", textDecoration: "underline" }}>{t("forgotPassword")}</button>
          <BackButton label={t("back")} onClick={backToInitial} />
        </form>}

        {authMode === "reset" && <form onSubmit={(event) => { event.preventDefault(); void submit(async () => { const result = await requestPasswordReset(cleanEmail); setNotice(result.message); setAuthMode("reset_otp"); }); }} style={{ display: "grid", gap: "1rem" }}>
          <AuthInput label={t("emailAddress")} type="email" value={email} onChange={setEmail} autoComplete="email" />
          <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ justifyContent: "center" }}>{isSubmitting ? t("sending") : t("sendRecoveryCode")}</button>
          <BackButton label={t("back")} onClick={() => setAuthMode("password_login")} />
        </form>}

        {authMode === "reset_otp" && <form onSubmit={(event) => { event.preventDefault(); void submit(async () => applyResult(await verifyPasswordRecovery(cleanEmail, otp))); }} style={{ display: "grid", gap: "1rem" }}>
          <p className="text-secondary" style={{ margin: 0, fontSize: ".88rem" }}>{formatAuthModalCopy(language, "recoveryCodeSentTo", { email: cleanEmail })}</p>
          <AuthInput label={t("recoveryCode")} value={otp} onChange={setOtp} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ justifyContent: "center" }}>{isSubmitting ? t("verifying") : t("verifyAndCreatePassword")}</button>
          <BackButton label={t("back")} onClick={() => setAuthMode("reset")} />
        </form>}

        {authMode === "password_setup" && <form onSubmit={(event) => { event.preventDefault(); void submit(async () => applyResult(await createPassword(password, confirmation))); }} style={{ display: "grid", gap: "1rem" }}>
          <AuthInput label={t("newPassword")} type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={12} />
          <AuthInput label={t("repeatNewPassword")} type="password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" minLength={12} />
          <p className="text-secondary" style={{ margin: 0, fontSize: ".8rem" }}>{t("passwordRequirements")}</p>
          <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ justifyContent: "center" }}>{isSubmitting ? t("saving") : t("createPassword")}</button>
        </form>}

        {authMode === "mfa_challenge" && <form onSubmit={(event) => { event.preventDefault(); void submit(async () => applyResult(await verifyMfaChallenge(otp))); }} style={{ display: "grid", gap: "1rem" }}>
          <AuthInput label={t("authenticatorCode")} value={otp} onChange={setOtp} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ justifyContent: "center" }}>{isSubmitting ? t("verifying") : t("verifyAndContinue")}</button>
          <BackButton label={t("back")} onClick={backToInitial} />
        </form>}

        {authMode === "dev" && developmentAuthEnabled && <form onSubmit={(event) => { event.preventDefault(); void submit(async () => { const result = await createBackendProfileSession(cleanEmail, displayName.trim() || cleanEmail.split("@")[0]); await finishLogin(); if (!result.profile) throw new Error("DEV_SESSION_FAILED"); }); }} style={{ display: "grid", gap: "1rem" }}>
          <p style={{ margin: 0, color: "#fbbf24", fontSize: ".8rem" }}>{t("developmentNotice")}</p>
          <AuthInput label={t("displayName")} value={displayName} onChange={setDisplayName} />
          <AuthInput label={t("emailAddress")} type="email" value={email} onChange={setEmail} autoComplete="email" />
          <button className="btn btn-primary" type="submit" disabled={isSubmitting} style={{ justifyContent: "center" }}>{isSubmitting ? t("connecting") : t("startTestSession")}</button>
          <BackButton label={t("back")} onClick={backToInitial} />
        </form>}
      </section>
    </div>
  );
}

function AuthInput({ label, value, onChange, type = "text", ...props }: { label: string; value: string; onChange: (value: string) => void; type?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return <label style={{ display: "grid", gap: ".45rem", fontSize: ".86rem", color: "var(--text-secondary)" }}>{label}<input {...props} className="apple-glass-input" type={type} required value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: ".86rem", cursor: "pointer", marginTop: ".25rem" }}>&larr; {label}</button>;
}
