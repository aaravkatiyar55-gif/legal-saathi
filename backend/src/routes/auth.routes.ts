import { Router, Response } from "express";
import { createHash } from "node:crypto";
import { env } from "../config/env";
import { authSessionRateLimit } from "../middleware/rateLimit.middleware";
import {
  createLocalSession,
  isSessionConfigured,
  issueSessionCookie,
  revokeRequestSession,
  revokeSessionById,
  revokeSessionsForSubject,
  sessionPublicState,
} from "../services/local/authSessions.service";
import { ensurePreviewProfile } from "../services/local/previewAccess.service";
import { recordUserSession } from "../services/supabase/onlineUsers.service";
import {
  AuthFlowDecision,
  applicationSessionProvider,
  isSupabaseGoogleProviderEnabled,
  isSupabasePrimaryAuthConfigured,
  PrimaryAuthError,
  PrimaryAuthService,
} from "../services/auth/supabasePrimaryAuth.service";
import {
  clearPendingAuthSession,
  issuePendingAuthSession,
  readPendingAuthSession,
  requirePendingAuthSession,
} from "../services/auth/pendingAuthSession.service";

function safeGoogleClientIdIdentifier(value: string) {
  return value
    ? `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 12)}`
    : "unavailable";
}

function safeGoogleCredentialAudienceIdentifier(credential: string) {
  try {
    const encodedPayload = credential.split(".")[1];
    if (!encodedPayload || encodedPayload.length > 12_000) return "unavailable";
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as { aud?: unknown };
    const audience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    return safeGoogleClientIdIdentifier(typeof audience === "string" ? audience : "");
  } catch {
    return "unavailable";
  }
}

function safeErrorMessage(code: PrimaryAuthError["code"]) {
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
      return "Two-factor authentication is required.";
    case "AUTH_MFA_INVALID":
      return "The authenticator code is invalid or expired.";
    case "AUTH_PENDING_SESSION_INVALID":
      return "This secure sign-in step expired. Start again.";
    case "EMAIL_RATE_LIMITED":
      return "Too many verification emails were requested. Please wait before trying again.";
    case "SMTP_AUTH_FAILED":
      return "The verification-email sender could not authenticate.";
    case "EMAIL_PROVIDER_UNAVAILABLE":
      return "The verification-email provider is temporarily unavailable.";
    case "EMAIL_SEND_FAILED":
      return "The verification email could not be sent.";
    default:
      return "The authentication service is temporarily unavailable.";
  }
}

function sendAuthError(response: Response, error: unknown) {
  const safe = error instanceof PrimaryAuthError
    ? error
    : new PrimaryAuthError("AUTH_PROVIDER_UNAVAILABLE", 503);
  response.status(safe.status).json({
    ok: false,
    error: safe.code,
    message: safeErrorMessage(safe.code),
    requestId: response.locals.requestId,
  });
}

function canUseLocalProfileFallback() {
  return env.nodeEnv !== "production" && (env.localCasesFallback || env.localPaymentTestMode);
}

async function createVerifiedAppSession(
  request: import("express").Request,
  response: Response,
  decision: AuthFlowDecision,
) {
  if (decision.next !== "complete") {
    const pending = issuePendingAuthSession(response, decision.state, decision.next);
    response.json({
      ok: true,
      next: decision.next,
      pendingCsrfToken: pending.csrfToken,
    });
    return;
  }
  if (!isSessionConfigured()) throw new PrimaryAuthError("AUTH_NOT_CONFIGURED", 503);

  const identity = {
    email: decision.state.identity.email,
    displayName: decision.state.identity.displayName,
    avatarUrl: decision.state.identity.avatarUrl,
    provider: applicationSessionProvider(decision.state.authMethod),
    subject: decision.state.identity.userId,
  };

  await revokeRequestSession(request, response);
  const appSession = await createLocalSession(identity, {
    accessToken: decision.state.accessToken,
    refreshToken: decision.state.refreshToken,
    expiresAt: decision.state.expiresAt,
  });
  // The durable session is the authentication boundary. Profile/event telemetry
  // must not turn a successfully verified Supabase identity into a failed login.
  clearPendingAuthSession(response);
  issueSessionCookie(response, appSession);
  let profile = {
    email: identity.email,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
  };
  try {
    profile = canUseLocalProfileFallback()
      ? await ensurePreviewProfile(identity)
      : await recordUserSession({ ...identity, eventType: "login" });
  } catch {
    console.warn("[Auth] profile telemetry unavailable", {
      requestId: response.locals.requestId,
      stage: "profile_telemetry",
    });
  }
  response.json({
    ok: true,
    next: "complete",
    profile,
    session: sessionPublicState(appSession),
  });
}

export function createAuthRoutes(service = new PrimaryAuthService()) {
  const router = Router();

  router.get("/config", async (_request, response) => {
    const clientId = env.googleClientId.trim();
    const authAvailable = isSupabasePrimaryAuthConfigured() && isSessionConfigured();
    const providerEnabled = await isSupabaseGoogleProviderEnabled();
    const googleAvailable = authAvailable && Boolean(clientId) && clientId.endsWith(".apps.googleusercontent.com");
    response.json({
      ok: true,
      authAvailable,
      emailOtpAvailable: authAvailable,
      passwordAvailable: authAvailable,
      googleAvailable,
      googleProviderReady: googleAvailable && providerEnabled,
      // A Google OAuth client ID is intentionally public: GIS receives it in
      // the page. Serving the backend-validated value here prevents a stale
      // Vercel build-time value from minting an ID token for another audience.
      googleClientId: googleAvailable ? clientId : undefined,
      mfaAvailable: authAvailable,
      developmentAuthEnabled: env.nodeEnv !== "production" && env.allowInsecureDevAuth,
    });
  });

  router.get("/pending", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const pending = readPendingAuthSession(request);
    if (!pending) {
      clearPendingAuthSession(response);
      response.json({ ok: true, pending: false });
      return;
    }
    response.json({
      ok: true,
      pending: true,
      next: pending.next,
      pendingCsrfToken: pending.csrfToken,
    });
  });

  router.post("/email/start", authSessionRateLimit, async (request, response) => {
    try {
      clearPendingAuthSession(response);
      await service.startEmailOtp(String(request.body?.email ?? ""));
      response.status(202).json({
        ok: true,
        message: "If the address can receive sign-in email, a verification code has been sent.",
      });
    } catch (error) {
      sendAuthError(response, error);
    }
  });

  router.post("/email/verify", authSessionRateLimit, async (request, response) => {
    try {
      const decision = await service.verifyEmailOtp(
        String(request.body?.email ?? ""),
        String(request.body?.otp ?? ""),
      );
      await createVerifiedAppSession(request, response, decision);
    } catch (error) {
      sendAuthError(response, error);
    }
  });

  router.post("/password/login", authSessionRateLimit, async (request, response) => {
    try {
      const decision = await service.signInWithPassword(
        String(request.body?.email ?? ""),
        String(request.body?.password ?? ""),
      );
      await createVerifiedAppSession(request, response, decision);
    } catch (error) {
      sendAuthError(response, error);
    }
  });

  router.post("/password/create", authSessionRateLimit, async (request, response) => {
    const pending = requirePendingAuthSession(request);
    if (!pending || pending.next !== "password_setup") {
      sendAuthError(response, new PrimaryAuthError("AUTH_PENDING_SESSION_INVALID", 401));
      return;
    }
    try {
      const decision = await service.createPassword(
        pending.state,
        String(request.body?.password ?? ""),
        String(request.body?.confirmation ?? ""),
      );
      await revokeSessionsForSubject(decision.state.identity.userId);
      await createVerifiedAppSession(request, response, decision);
    } catch (error) {
      sendAuthError(response, error);
    }
  });

  router.post("/password/reset", authSessionRateLimit, async (request, response) => {
    try {
      await service.startPasswordRecovery(String(request.body?.email ?? ""));
      response.status(202).json({
        ok: true,
        message: "If the address can receive sign-in email, a verification code has been sent.",
      });
    } catch (error) {
      if (error instanceof PrimaryAuthError && error.code === "AUTH_EMAIL_INVALID") {
        sendAuthError(response, error);
        return;
      }
      // Keep recovery non-enumerating even when Supabase declines the request.
      response.status(202).json({
        ok: true,
        message: "If the address can receive sign-in email, a verification code has been sent.",
      });
    }
  });

  router.post("/password/recovery/verify", authSessionRateLimit, async (request, response) => {
    try {
      const decision = await service.verifyPasswordRecovery(
        String(request.body?.email ?? ""),
        String(request.body?.otp ?? ""),
      );
      await createVerifiedAppSession(request, response, decision);
    } catch (error) {
      sendAuthError(response, error);
    }
  });

  router.post("/google", authSessionRateLimit, async (request, response) => {
    const credential = String(request.body?.credential ?? "");
    const nonce = String(request.body?.nonce ?? "");
    let stage = "supabase_id_token_exchange";
    try {
      const decision = await service.signInWithGoogleIdToken(credential, nonce);
      stage = "application_session_creation";
      await createVerifiedAppSession(request, response, decision);
    } catch (error) {
      const safe = error instanceof PrimaryAuthError
        ? error
        : new PrimaryAuthError("AUTH_PROVIDER_UNAVAILABLE", 503, "unexpected_failure");
      console.warn("[Auth] Google verification failed", {
        requestId: response.locals.requestId,
        code: safe.code,
        category: safe.diagnosticCategory ?? "unknown",
        status: safe.status,
        stage,
        expectedClientId: safeGoogleClientIdIdentifier(env.googleClientId),
        actualClientId: safeGoogleCredentialAudienceIdentifier(credential),
      });
      sendAuthError(response, error);
    }
  });

  router.post("/mfa/challenge", authSessionRateLimit, async (request, response) => {
    const pending = requirePendingAuthSession(request);
    if (!pending || pending.next !== "mfa_challenge") {
      sendAuthError(response, new PrimaryAuthError("AUTH_PENDING_SESSION_INVALID", 401));
      return;
    }
    try {
      const decision = await service.challengeTotp(pending.state, String(request.body?.code ?? ""));
      await createVerifiedAppSession(request, response, decision);
    } catch (error) {
      sendAuthError(response, error);
    }
  });

  return router;
}

export const authRoutes = createAuthRoutes();
