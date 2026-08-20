"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import Image from "next/image";

import { restoreBackendSession } from "@/lib/backendApi";
import { MfaCodeField } from "./MfaCodeField";

type MfaFactor = {
  id: string;
  friendlyName: string;
  createdAt: string;
  updatedAt: string;
};

type MfaStatus = {
  configured: true;
  enabled: boolean;
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
  requiresChallenge: boolean;
  factors: MfaFactor[];
  recoveryCodesSupported: false;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

type ReauthenticationStep = "idle" | "otp_sent";

type MfaLanguage = "en" | "hinglish" | "hi";

const safeMessages: Record<MfaLanguage, Record<string, string>> = {
  en: {
    MFA_NOT_CONFIGURED: "Authenticator security is not configured on this environment.",
    MFA_SESSION_REQUIRED: "Your secure sign-in session expired. Sign in again to continue.",
    MFA_IDENTITY_MISMATCH: "The verified account does not match the signed-in account.",
    MFA_EMAIL_NOT_VERIFIED: "A verified email account is required.",
    MFA_FACTOR_NOT_FOUND: "This authenticator factor is no longer available. Refresh and try again.",
    MFA_CODE_INVALID: "The authenticator code is invalid or expired.",
    MFA_AAL2_REQUIRED: "Complete the authenticator challenge before continuing.",
    MFA_PROVIDER_UNAVAILABLE: "Authenticator security is temporarily unavailable.",
    MFA_REQUEST_INVALID: "Check the security request and try again.",
    MFA_RECENT_AUTH_REQUIRED: "Verify your signed-in email before changing authenticator security.",
    AUTH_OTP_INVALID: "The email verification code is invalid or expired.",
  },
  hinglish: {
    MFA_NOT_CONFIGURED: "Authenticator security is environment par configured nahi hai.",
    MFA_SESSION_REQUIRED: "Aapka secure sign-in session expire ho gaya. Continue karne ke liye dobara sign in karein.",
    MFA_IDENTITY_MISMATCH: "Verified account signed-in account se match nahi karta.",
    MFA_EMAIL_NOT_VERIFIED: "Verified email account zaroori hai.",
    MFA_FACTOR_NOT_FOUND: "Yeh authenticator ab available nahi hai. Refresh karke phir try karein.",
    MFA_CODE_INVALID: "Authenticator code galat hai ya expire ho gaya hai.",
    MFA_AAL2_REQUIRED: "Continue karne se pehle authenticator challenge complete karein.",
    MFA_PROVIDER_UNAVAILABLE: "Authenticator security abhi temporarily unavailable hai.",
    MFA_REQUEST_INVALID: "Security request check karke phir try karein.",
    MFA_RECENT_AUTH_REQUIRED: "Authenticator security badalne se pehle signed-in email verify karein.",
    AUTH_OTP_INVALID: "Email verification code galat hai ya expire ho gaya hai.",
  },
  hi: {
    MFA_NOT_CONFIGURED: "इस वातावरण में ऑथेंटिकेटर सुरक्षा कॉन्फ़िगर नहीं है।",
    MFA_SESSION_REQUIRED: "आपका सुरक्षित साइन-इन सत्र समाप्त हो गया है। जारी रखने के लिए फिर से साइन इन करें।",
    MFA_IDENTITY_MISMATCH: "सत्यापित खाता साइन-इन किए गए खाते से मेल नहीं खाता।",
    MFA_EMAIL_NOT_VERIFIED: "सत्यापित ईमेल खाता आवश्यक है।",
    MFA_FACTOR_NOT_FOUND: "यह ऑथेंटिकेटर अब उपलब्ध नहीं है। रीफ़्रेश करके फिर प्रयास करें।",
    MFA_CODE_INVALID: "ऑथेंटिकेटर कोड गलत है या समाप्त हो गया है।",
    MFA_AAL2_REQUIRED: "जारी रखने से पहले ऑथेंटिकेटर सत्यापन पूरा करें।",
    MFA_PROVIDER_UNAVAILABLE: "ऑथेंटिकेटर सुरक्षा अभी अस्थायी रूप से उपलब्ध नहीं है।",
    MFA_REQUEST_INVALID: "सुरक्षा अनुरोध जाँचकर फिर प्रयास करें।",
    MFA_RECENT_AUTH_REQUIRED: "ऑथेंटिकेटर सुरक्षा बदलने से पहले साइन-इन ईमेल सत्यापित करें।",
    AUTH_OTP_INVALID: "ईमेल सत्यापन कोड गलत है या समाप्त हो गया है।",
  },
};

const mfaCopy = {
  en: {
    checking: "CHECKING",
    setupRequired: "SETUP REQUIRED",
    enabled: "ENABLED",
    unavailable: "TEMPORARILY UNAVAILABLE",
    checkingStatus: "Checking authenticator availability...",
    reverify: "Re-verify the signed-in email before enrolling or removing an authenticator factor.",
    verifyByEmail: "Verify account by email",
    emailCode: "Email verification code",
    verifyAccount: "Verify account",
    cancel: "Cancel",
    enable: "Enable authenticator",
    addBackup: "Add backup authenticator",
    setupTitle: "Set up Legal Saathi Authenticator",
    setupIntro: "Scan this QR code in an authenticator app. Do not open it in the browser address bar.",
    cannotScan: "Can't scan the QR code?",
    accountName: "Account name",
    setupKey: "Setup key",
    type: "Type",
    timeBased: "Time based",
    copyKey: "Copy setup key",
    copied: "Copied",
    authenticatorCode: "Authenticator code",
    codeHint: "Enter the current six-digit code from your authenticator app.",
    verifyEnable: "Verify and enable",
    verifying: "Verifying...",
    removeTitle: "Remove authenticator?",
    removeWarning: "Removing the final authenticator reduces account protection. Add a backup factor on another trusted device before removing it when possible.",
    verifyRemove: "Verify and remove",
    remove: "Remove authenticator",
  },
  hinglish: {
    checking: "CHECKING",
    setupRequired: "SETUP REQUIRED",
    enabled: "ENABLED",
    unavailable: "TEMPORARILY UNAVAILABLE",
    checkingStatus: "Authenticator availability check ho rahi hai...",
    reverify: "Authenticator add ya remove karne se pehle signed-in email dobara verify karein.",
    verifyByEmail: "Email se account verify karein",
    emailCode: "Email verification code",
    verifyAccount: "Account verify karein",
    cancel: "Cancel",
    enable: "Authenticator enable karein",
    addBackup: "Backup authenticator add karein",
    setupTitle: "Legal Saathi Authenticator set up karein",
    setupIntro: "QR code ko authenticator app mein scan karein. Browser address bar mein mat kholein.",
    cannotScan: "QR code scan nahi ho raha?",
    accountName: "Account name",
    setupKey: "Setup key",
    type: "Type",
    timeBased: "Time based",
    copyKey: "Setup key copy karein",
    copied: "Copied",
    authenticatorCode: "Authenticator code",
    codeHint: "Authenticator app ka current six-digit code enter karein.",
    verifyEnable: "Verify karke enable karein",
    verifying: "Verify ho raha hai...",
    removeTitle: "Authenticator remove karein?",
    removeWarning: "Aakhri authenticator remove karne se account protection kam ho jayegi. Ho sake to pehle kisi doosre trusted device par backup factor add karein.",
    verifyRemove: "Verify karke remove karein",
    remove: "Authenticator remove karein",
  },
  hi: {
    checking: "जाँच जारी",
    setupRequired: "सेटअप आवश्यक",
    enabled: "सक्षम",
    unavailable: "अस्थायी रूप से अनुपलब्ध",
    checkingStatus: "ऑथेंटिकेटर उपलब्धता जाँची जा रही है...",
    reverify: "ऑथेंटिकेटर जोड़ने या हटाने से पहले साइन-इन ईमेल फिर सत्यापित करें।",
    verifyByEmail: "ईमेल से खाता सत्यापित करें",
    emailCode: "ईमेल सत्यापन कोड",
    verifyAccount: "खाता सत्यापित करें",
    cancel: "रद्द करें",
    enable: "ऑथेंटिकेटर सक्षम करें",
    addBackup: "बैकअप ऑथेंटिकेटर जोड़ें",
    setupTitle: "Legal Saathi Authenticator सेट करें",
    setupIntro: "इस QR कोड को ऑथेंटिकेटर ऐप में स्कैन करें। इसे ब्राउज़र के पता बार में न खोलें।",
    cannotScan: "QR कोड स्कैन नहीं हो रहा?",
    accountName: "खाता नाम",
    setupKey: "सेटअप कुंजी",
    type: "प्रकार",
    timeBased: "समय आधारित",
    copyKey: "सेटअप कुंजी कॉपी करें",
    copied: "कॉपी हो गया",
    authenticatorCode: "ऑथेंटिकेटर कोड",
    codeHint: "अपने ऑथेंटिकेटर ऐप का वर्तमान छह अंकों का कोड दर्ज करें।",
    verifyEnable: "सत्यापित करके सक्षम करें",
    verifying: "सत्यापन जारी...",
    removeTitle: "ऑथेंटिकेटर हटाएँ?",
    removeWarning: "अंतिम ऑथेंटिकेटर हटाने से खाते की सुरक्षा कम होगी। संभव हो तो पहले किसी दूसरे विश्वसनीय डिवाइस पर बैकअप फैक्टर जोड़ें।",
    verifyRemove: "सत्यापित करके हटाएँ",
    remove: "ऑथेंटिकेटर हटाएँ",
  },
} satisfies Record<MfaLanguage, Record<string, string>>;

function readSafeError(payload: unknown, language: MfaLanguage) {
  const code = typeof payload === "object" && payload && "error" in payload
    ? String((payload as { error?: unknown }).error ?? "")
    : "";
  return safeMessages[language][code] ?? (language === "hi"
    ? "सुरक्षा अनुरोध पूरा नहीं हो सका।"
    : language === "hinglish"
      ? "Security request complete nahi ho saki."
      : "The security request could not be completed.");
}

async function requestMfa<T>(
  path: "status" | "enroll" | "disable" | "reauth/start" | "reauth/verify",
  language: MfaLanguage,
  init?: RequestInit,
) {
  const appSession = await restoreBackendSession();
  if (!appSession?.session?.csrfToken) {
    const safe = new Error(safeMessages[language].MFA_SESSION_REQUIRED);
    safe.name = "MfaRequestError";
    throw safe;
  }
  const response = await fetch(`/api/legal-sathi/profile/security/2fa/${path}`, {
    method: init?.method ?? (path === "status" ? "GET" : "POST"),
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      "X-CSRF-Token": appSession.session.csrfToken,
      "X-Request-Id": crypto.randomUUID(),
      ...init?.headers,
    },
    body: init?.body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok === false) {
    const safe = new Error(readSafeError(payload, language));
    safe.name = "MfaRequestError";
    throw safe;
  }
  return payload as T;
}

export function SupabaseMfaSettings({ language = "en" }: { language?: MfaLanguage }) {
  const copy = mfaCopy[language];
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [configured, setConfigured] = useState(true);
  const [recentAuthenticationRequired, setRecentAuthenticationRequired] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [pendingDisableFactor, setPendingDisableFactor] = useState<string | null>(null);
  const [reauthenticationStep, setReauthenticationStep] = useState<ReauthenticationStep>("idle");
  const [reauthenticationCode, setReauthenticationCode] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [secretCopied, setSecretCopied] = useState(false);

  const refreshStatus = useCallback(async () => {
    setError("");
    const appSession = await restoreBackendSession();
    const email = appSession?.profile?.email ?? "";
    setAccountEmail(email);
    const result = await requestMfa<{ ok: true; configured: boolean; requiresReauthentication: boolean; status?: MfaStatus }>("status", language);
    setConfigured(result.configured);
    setRecentAuthenticationRequired(result.requiresReauthentication);
    setStatus(result.status ?? null);
  }, [language]);

  useEffect(() => {
    let active = true;
    setBusy(true);
    void refreshStatus()
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "The security status could not be loaded.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, [refreshStatus]);

  const beginReauthentication = async () => {
    if (!accountEmail) return setError("The signed-in account email is unavailable.");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await requestMfa("reauth/start", language, { method: "POST", body: JSON.stringify({}) });
      setReauthenticationStep("otp_sent");
      setNotice("A verification code was sent to your signed-in email address.");
    } catch {
      setError("Account verification could not be started.");
    } finally {
      setBusy(false);
    }
  };

  const verifyReauthentication = async () => {
    if (!/^\d{6}$/.test(reauthenticationCode) || !accountEmail) return;
    setBusy(true);
    setError("");
    try {
      await requestMfa("reauth/verify", language, { method: "POST", body: JSON.stringify({ code: reauthenticationCode }) });
      await refreshStatus();
      setReauthenticationStep("idle");
      setReauthenticationCode("");
      setNotice("Account verified. You can now manage authenticator security.");
    } catch {
      setError("The email verification code is invalid or expired.");
    } finally {
      setBusy(false);
    }
  };

  const startEnrollment = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestMfa<{ ok: true; enrollment: Enrollment }>("enroll", language, { method: "POST", body: JSON.stringify({ action: "start" }) });
      setEnrollment(result.enrollment);
      setEnrollmentCode("");
      setSecretCopied(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authenticator enrollment could not be started.");
    } finally {
      setBusy(false);
    }
  };

  const cancelEnrollment = async () => {
    const activeEnrollment = enrollment;
    setEnrollment(null);
    setEnrollmentCode("");
    setSecretCopied(false);
    if (!activeEnrollment) return;
    try {
      await requestMfa("enroll", language, { method: "POST", body: JSON.stringify({ action: "cancel", factorId: activeEnrollment.factorId }) });
    } catch {
      setNotice("Enrollment was closed. Refresh before starting another enrollment.");
    }
  };

  const verifyEnrollment = async () => {
    if (!enrollment || !/^\d{6}$/.test(enrollmentCode)) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestMfa<{ ok: true; status: MfaStatus }>("enroll", language, {
        method: "POST",
        body: JSON.stringify({ action: "verify", factorId: enrollment.factorId, code: enrollmentCode }),
      });
      setStatus(result.status);
      setEnrollment(null);
      setEnrollmentCode("");
      setSecretCopied(false);
      setNotice("Authenticator security is enabled. Future sign-ins must complete the AAL2 challenge.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The authenticator code could not be verified.");
    } finally {
      setBusy(false);
    }
  };

  const disableFactor = async (factorId: string) => {
    if (status?.requiresChallenge && !/^\d{6}$/.test(disableCode)) {
      setPendingDisableFactor(factorId);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestMfa<{ ok: true; status: MfaStatus }>("disable", language, {
        method: "POST",
        body: JSON.stringify({ factorId, code: disableCode }),
      });
      setStatus(result.status);
      setDisableCode("");
      setPendingDisableFactor(null);
      setNotice("The authenticator factor was removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The authenticator factor could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  const copySetupSecret = async () => {
    if (!enrollment?.secret) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setSecretCopied(true);
      window.setTimeout(() => setSecretCopied(false), 2_000);
    } catch {
      setError(language === "hi"
        ? "सेटअप कुंजी कॉपी नहीं हो सकी। इसे हाथ से दर्ज करें।"
        : language === "hinglish"
          ? "Setup key copy nahi ho saki. Ise manually enter karein."
          : "The setup key could not be copied. Enter it manually.");
    }
  };

  const statusLabel = busy
    ? copy.checking
    : error && !status
      ? copy.unavailable
      : status?.enabled
        ? copy.enabled
        : copy.setupRequired;

  return (
    <section aria-labelledby="mfa-settings-title" style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", padding: "1.25rem", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", gap: "0.8rem", alignItems: "flex-start" }}>
          <ShieldCheck size={20} aria-hidden="true" style={{ color: status?.enabled ? "#10b981" : "#fbbf24", marginTop: "0.1rem" }} />
          <div>
            <h4 id="mfa-settings-title" style={{ marginBottom: "0.3rem" }}>Two-Factor Authentication</h4>
            <p className="text-secondary" style={{ fontSize: "0.875rem", margin: 0, lineHeight: 1.5 }}>
              {status?.enabled
                ? `Protected by ${status.factors.length} verified authenticator factor${status.factors.length === 1 ? "" : "s"}.`
                : "Use a TOTP authenticator app for an AAL2 sign-in challenge."}
            </p>
          </div>
        </div>
        <span style={{ color: status?.enabled ? "#10b981" : "#fbbf24", fontSize: ".75rem", fontWeight: 700, whiteSpace: "nowrap" }}>
          {statusLabel}
        </span>
      </div>

      {busy && !status && <div className="text-secondary" role="status" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><Loader2 size={16} className="spin" /> {copy.checkingStatus}</div>}
      {error && <div role="alert" style={{ display: "flex", gap: "0.55rem", color: "#fca5a5", fontSize: "0.85rem" }}><AlertTriangle size={16} aria-hidden="true" />{error}</div>}
      {notice && <div role="status" style={{ color: "#86efac", fontSize: "0.85rem" }}>{notice}</div>}

      {!configured && !busy && (
        <div role="status" style={{ padding: "1rem", border: "1px solid rgba(245,158,11,.28)", borderRadius: "var(--radius-md)", color: "#fbbf24", fontSize: ".85rem" }}>
          Supabase authenticator security needs server configuration before enrollment can begin.
        </div>
      )}

      {configured && recentAuthenticationRequired && !busy && (
        <div style={{ display: "grid", gap: "0.9rem", padding: "1rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", gap: "0.65rem", alignItems: "flex-start" }}>
            <KeyRound size={18} aria-hidden="true" />
            <p className="text-secondary" style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.55 }}>
              {copy.reverify}
            </p>
          </div>
          {reauthenticationStep === "idle" ? (
            <button className="btn btn-primary" onClick={beginReauthentication} disabled={busy}>{copy.verifyByEmail}</button>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: "0.75rem" }}>
              <MfaCodeField id="mfa-email-otp" label={copy.emailCode} hint={copy.codeHint} value={reauthenticationCode} onChange={setReauthenticationCode} disabled={busy} />
              <button className="btn btn-primary" onClick={verifyReauthentication} disabled={busy || reauthenticationCode.length !== 6}>{copy.verifyAccount}</button>
              <button className="btn" onClick={() => { setReauthenticationStep("idle"); setReauthenticationCode(""); }} disabled={busy}>{copy.cancel}</button>
            </div>
          )}
        </div>
      )}

      {configured && status && !enrollment && (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {status.factors.map((factor) => (
            <div key={factor.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: "0.9rem 1rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
              <div>
                <strong style={{ fontSize: "0.9rem" }}>{factor.friendlyName}</strong>
                <p className="text-secondary" style={{ margin: "0.2rem 0 0", fontSize: "0.75rem" }}>Added {new Date(factor.createdAt).toLocaleDateString("en-IN")}</p>
              </div>
              <button className="btn" aria-label={`Remove ${factor.friendlyName}`} onClick={() => { setPendingDisableFactor(factor.id); setDisableCode(""); }} disabled={busy || recentAuthenticationRequired} title={copy.remove}><Trash2 size={16} /></button>
            </div>
          ))}
          {pendingDisableFactor && (
            <div role="alertdialog" aria-labelledby="mfa-remove-title" style={{ display: "grid", gap: "0.8rem", padding: "1rem", border: "1px solid rgba(245,158,11,.35)", borderRadius: "var(--radius-md)" }}>
              <strong id="mfa-remove-title">{copy.removeTitle}</strong>
              <p className="text-secondary" style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.5 }}>{copy.removeWarning}</p>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: "0.75rem" }}>
                {status.requiresChallenge && (
                  <MfaCodeField id="mfa-disable-code" label={copy.authenticatorCode} hint={copy.codeHint} value={disableCode} onChange={setDisableCode} disabled={busy} />
                )}
                <button className="btn btn-primary" onClick={() => void disableFactor(pendingDisableFactor)} disabled={busy || (status.requiresChallenge && disableCode.length !== 6)}>
                  {status.requiresChallenge ? copy.verifyRemove : copy.remove}
                </button>
                <button className="btn" onClick={() => { setPendingDisableFactor(null); setDisableCode(""); }} disabled={busy}>{copy.cancel}</button>
              </div>
            </div>
          )}
          {!recentAuthenticationRequired && (
            <button className="btn btn-primary" onClick={startEnrollment} disabled={busy} style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
              <Plus size={16} /> {status.enabled ? copy.addBackup : copy.enable}
            </button>
          )}
        </div>
      )}

      {enrollment && (
        <div role="dialog" aria-modal="true" aria-labelledby="mfa-setup-title" style={{ display: "grid", gap: "1rem", padding: "1rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
          <h4 id="mfa-setup-title" style={{ margin: 0 }}>{copy.setupTitle}</h4>
          <p className="text-secondary" style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.5 }}>{copy.setupIntro}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start" }}>
            {/* Supabase returns a trusted data-image QR payload. It is rendered as an image, never injected as HTML. */}
            <Image unoptimized src={enrollment.qrCode} width={164} height={164} alt="Authenticator enrollment QR code" style={{ background: "white", padding: "0.45rem", borderRadius: "6px" }} />
            <div style={{ minWidth: "14rem", flex: 1, display: "grid", gap: "0.55rem" }}>
              <strong style={{ fontSize: "0.88rem" }}>{copy.cannotScan}</strong>
              <dl style={{ display: "grid", gridTemplateColumns: "max-content minmax(0,1fr)", gap: "0.4rem 0.75rem", margin: 0, fontSize: "0.82rem" }}>
                <dt className="text-secondary">{copy.accountName}</dt><dd style={{ margin: 0 }}>Legal Saathi</dd>
                <dt className="text-secondary">{copy.type}</dt><dd style={{ margin: 0 }}>{copy.timeBased}</dd>
                <dt className="text-secondary">{copy.setupKey}</dt>
                <dd style={{ margin: 0 }}>
                  <code style={{ display: "block", padding: "0.65rem", background: "var(--bg-elevated)", borderRadius: "6px", wordBreak: "break-all", fontSize: "0.8rem" }}>{enrollment.secret}</code>
                </dd>
              </dl>
              <button className="btn" type="button" onClick={() => void copySetupSecret()} style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
                {secretCopied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {secretCopied ? copy.copied : copy.copyKey}
              </button>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: "0.75rem" }}>
            <MfaCodeField id="mfa-enrollment-code" label={copy.authenticatorCode} hint={copy.codeHint} value={enrollmentCode} onChange={setEnrollmentCode} disabled={busy} />
            <button className="btn btn-primary" onClick={verifyEnrollment} disabled={busy || enrollmentCode.length !== 6}>{busy ? copy.verifying : copy.verifyEnable}</button>
            <button className="btn" onClick={() => void cancelEnrollment()} disabled={busy}>{copy.cancel}</button>
          </div>
        </div>
      )}

      <p className="text-secondary" style={{ margin: 0, fontSize: "0.78rem", lineHeight: 1.55 }}>
        Supabase does not issue recovery codes for this TOTP flow. Add a separate backup authenticator factor and store it on a different trusted device. Setup secrets are shown only during enrollment and are never written to Legal Saathi logs or browser storage by this screen.
      </p>
    </section>
  );
}
