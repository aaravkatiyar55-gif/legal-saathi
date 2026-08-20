export type PrimaryAuthNext = "complete" | "password_setup" | "mfa_challenge";

export type PrimaryAuthConfig = {
  ok: true;
  authAvailable: boolean;
  emailOtpAvailable: boolean;
  passwordAvailable: boolean;
  googleAvailable: boolean;
  googleProviderReady: boolean;
  googleClientId?: string;
  mfaAvailable: boolean;
  developmentAuthEnabled: boolean;
};

export type PrimaryAuthResult = {
  ok: true;
  next: PrimaryAuthNext;
  pendingCsrfToken?: string;
};

export type PendingAuthResult = {
  ok: true;
  pending: boolean;
  next?: Exclude<PrimaryAuthNext, "complete">;
  pendingCsrfToken?: string;
};

type AuthErrorPayload = { error?: string; message?: string; requestId?: string };

export class AuthClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly requestId: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthClientError";
  }
}

const authBaseUrl = "/api/legal-sathi/auth";
let pendingCsrfToken = "";

function safeMessage(code: string) {
  switch (code) {
    case "AUTH_NOT_CONFIGURED":
      return "Secure email authentication is not configured on this environment.";
    case "AUTH_EMAIL_INVALID":
      return "Enter a valid email address.";
    case "AUTH_OTP_INVALID":
      return "The verification code is invalid or expired.";
    case "AUTH_CREDENTIALS_INVALID":
      return "The email or password is incorrect.";
    case "AUTH_GOOGLE_INVALID":
      return "Google sign-in could not be verified.";
    case "AUTH_GOOGLE_PROVIDER_DISABLED":
      return "Google sign-in is not enabled by the identity provider on this environment.";
    case "AUTH_EMAIL_NOT_VERIFIED":
      return "A verified email address is required.";
    case "AUTH_PASSWORD_WEAK":
      return "Use at least 12 characters with uppercase, lowercase, a number, and a symbol.";
    case "AUTH_PASSWORD_MISMATCH":
      return "The passwords do not match.";
    case "AUTH_MFA_REQUIRED":
      return "Enter the code from your authenticator app.";
    case "AUTH_MFA_INVALID":
      return "The authenticator code is invalid or expired.";
    case "AUTH_PENDING_SESSION_INVALID":
      return "This secure sign-in step expired. Start again.";
    case "RATE_LIMITED":
      return "Too many sign-in attempts. Please wait and try again.";
    case "EMAIL_RATE_LIMITED":
      return "Too many verification emails were requested. Please wait before trying again.";
    case "SMTP_AUTH_FAILED":
      return "The verification-email sender could not authenticate.";
    case "EMAIL_PROVIDER_UNAVAILABLE":
      return "The verification-email provider is temporarily unavailable.";
    case "EMAIL_SEND_FAILED":
      return "The verification email could not be sent. Please try again after checking the email provider.";
    default:
      return "The authentication service is temporarily unavailable.";
  }
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const requestId = crypto.randomUUID();
  let response: Response;
  try {
    response = await fetch(`${authBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(pendingCsrfToken ? { "X-CSRF-Token": pendingCsrfToken } : {}),
        "X-Request-Id": requestId,
        ...init?.headers,
      },
    });
  } catch {
    throw new AuthClientError("AUTH_NETWORK_UNAVAILABLE", 0, requestId, "Legal Saathi could not reach the authentication service.");
  }
  const payload = await response.json().catch(() => ({})) as AuthErrorPayload & Partial<PrimaryAuthResult>;
  if (!response.ok || (payload as { ok?: boolean }).ok === false) {
    const code = payload.error ?? "AUTH_PROVIDER_UNAVAILABLE";
    throw new AuthClientError(
      code,
      response.status,
      payload.requestId ?? response.headers.get("x-request-id") ?? requestId,
      safeMessage(code),
    );
  }
  if (payload.pendingCsrfToken) pendingCsrfToken = payload.pendingCsrfToken;
  if (payload.next === "complete") pendingCsrfToken = "";
  return payload as T;
}

export const getPrimaryAuthConfig = () => authRequest<PrimaryAuthConfig>("/config");

export const restorePendingAuthState = async () => {
  const result = await authRequest<PendingAuthResult>("/pending");
  if (!result.pending) pendingCsrfToken = "";
  return result;
};

export const startEmailOtp = (email: string) => authRequest<{ ok: true; message: string }>("/email/start", {
  method: "POST",
  body: JSON.stringify({ email }),
});

export const verifyEmailOtp = (email: string, otp: string) => authRequest<PrimaryAuthResult>("/email/verify", {
  method: "POST",
  body: JSON.stringify({ email, otp }),
});

export const loginWithPassword = (email: string, password: string) => authRequest<PrimaryAuthResult>("/password/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});

export const createPassword = (password: string, confirmation: string) => authRequest<PrimaryAuthResult>("/password/create", {
  method: "POST",
  body: JSON.stringify({ password, confirmation }),
});

export const requestPasswordReset = (email: string) => authRequest<{ ok: true; message: string }>("/password/reset", {
  method: "POST",
  body: JSON.stringify({ email }),
});

export const verifyPasswordRecovery = (email: string, otp: string) => authRequest<PrimaryAuthResult>("/password/recovery/verify", {
  method: "POST",
  body: JSON.stringify({ email, otp }),
});

export const exchangeGoogleCredential = (credential: string, nonce: string) => authRequest<PrimaryAuthResult>("/google", {
  method: "POST",
  body: JSON.stringify({ credential, nonce }),
});

export const verifyMfaChallenge = (code: string) => authRequest<PrimaryAuthResult>("/mfa/challenge", {
  method: "POST",
  body: JSON.stringify({ code }),
});

export function resetPendingAuthState() {
  pendingCsrfToken = "";
}
