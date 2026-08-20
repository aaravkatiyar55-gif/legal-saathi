import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { requireCsrfForSession } from "../middleware/csrf.middleware";
import { securitySettingsRateLimit } from "../middleware/rateLimit.middleware";
import { PrimaryAuthError, PrimaryAuthService } from "../services/auth/supabasePrimaryAuth.service";
import {
  getRequestProviderSession,
  getRequestSession,
  hasRecentRequestReauthentication,
  markRequestSessionReauthenticated,
  revokeOtherSessionsForRequest,
  updateRequestProviderSession,
} from "../services/local/authSessions.service";
import {
  isSupabaseMfaConfigured,
  SupabaseMfaError,
  SupabaseMfaService,
  supabaseMfaService,
} from "../services/security/supabaseMfa.service";

const enrollmentSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("cancel"), factorId: z.string().uuid() }),
  z.object({ action: z.literal("verify"), factorId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }),
]);

const disableSchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/).optional().default(""),
});

const reauthenticationSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

function safeMessage(error: SupabaseMfaError) {
  switch (error.code) {
    case "MFA_NOT_CONFIGURED":
      return "Authenticator-app security is not configured on this environment.";
    case "MFA_SESSION_REQUIRED":
      return "Verify your account again before changing two-factor authentication.";
    case "MFA_IDENTITY_MISMATCH":
      return "The verified account does not match the signed-in account.";
    case "MFA_EMAIL_NOT_VERIFIED":
      return "A verified email account is required.";
    case "MFA_FACTOR_NOT_FOUND":
      return "This authenticator factor is no longer available.";
    case "MFA_CODE_INVALID":
      return "The authenticator code is invalid or expired.";
    case "MFA_AAL2_REQUIRED":
      return "Complete the authenticator challenge before continuing.";
    default:
      return "The authentication service is temporarily unavailable.";
  }
}

function sendError(response: Response, error: unknown) {
  const safe = error instanceof SupabaseMfaError
    ? error
    : new SupabaseMfaError("MFA_PROVIDER_UNAVAILABLE", 503);
  response.status(safe.status).json({ ok: false, error: safe.code, message: safeMessage(safe), requestId: response.locals.requestId });
}

function sendRecentAuthenticationRequired(response: Response) {
  response.status(401).json({
    ok: false,
    error: "MFA_RECENT_AUTH_REQUIRED",
    message: "Verify your signed-in email before changing authenticator security.",
    requestId: response.locals.requestId,
  });
}

async function requireSupabaseAppSession(request: Request, response: Response) {
  const session = await getRequestSession(request);
  if (!session || (session.provider !== "supabase" && session.provider !== "google")) {
    response.status(401).json({
      ok: false,
      error: "MFA_SESSION_REQUIRED",
      message: "Sign in through the verified Supabase authentication flow before changing two-factor authentication.",
      requestId: response.locals.requestId,
    });
    return null;
  }
  return session;
}

async function requireProviderTokens(request: Request, response: Response) {
  const tokens = await getRequestProviderSession(request);
  if (!tokens) {
    response.status(401).json({
      ok: false,
      error: "MFA_SESSION_REQUIRED",
      message: "Verify your account again before changing two-factor authentication.",
      requestId: response.locals.requestId,
    });
    return null;
  }
  return tokens;
}

async function persistProviderTokens(request: Request, tokens: { accessToken: string; refreshToken: string; expiresAt?: number }) {
  const updated = await updateRequestProviderSession(request, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt ?? Math.floor(Date.now() / 1_000) + 600,
  });
  if (!updated) throw new SupabaseMfaError("MFA_SESSION_REQUIRED", 401);
}

export function createMfaRoutes(
  service: SupabaseMfaService = supabaseMfaService,
  primaryAuth: PrimaryAuthService = new PrimaryAuthService(),
) {
  const router = Router();

  router.get("/status", async (request, response) => {
    const session = await requireSupabaseAppSession(request, response);
    if (!session) return;
    response.setHeader("Cache-Control", "no-store");
    if (!isSupabaseMfaConfigured()) {
      response.json({ ok: true, configured: false, requiresReauthentication: true, recoveryCodesSupported: false });
      return;
    }
    const tokens = await requireProviderTokens(request, response);
    if (!tokens) return;
    try {
      const result = await service.statusWithTokens(tokens, { email: session.email, subject: session.subject });
      await persistProviderTokens(request, result.tokens);
      response.json({ ok: true, configured: true, requiresReauthentication: !(await hasRecentRequestReauthentication(request)), recoveryCodesSupported: false, status: result.status });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/reauth/start", securitySettingsRateLimit, requireCsrfForSession, async (request, response) => {
    const session = await requireSupabaseAppSession(request, response);
    if (!session) return;
    try {
      await primaryAuth.startEmailOtp(session.email);
      response.status(202).json({ ok: true, message: "A verification code was sent to the signed-in email address." });
    } catch {
      response.status(503).json({ ok: false, error: "MFA_PROVIDER_UNAVAILABLE", message: "Account verification could not be started.", requestId: response.locals.requestId });
    }
  });

  router.post("/reauth/verify", securitySettingsRateLimit, requireCsrfForSession, async (request, response) => {
    const session = await requireSupabaseAppSession(request, response);
    if (!session) return;
    const parsed = reauthenticationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: "AUTH_OTP_INVALID", message: "The verification code is invalid or expired.", requestId: response.locals.requestId });
      return;
    }
    try {
      const decision = await primaryAuth.verifyEmailOtp(session.email, parsed.data.code);
      if (decision.state.identity.userId !== session.subject || decision.state.identity.email !== session.email.toLowerCase()) {
        throw new SupabaseMfaError("MFA_IDENTITY_MISMATCH", 403);
      }
      await persistProviderTokens(request, decision.state);
      await markRequestSessionReauthenticated(request);
      response.json({ ok: true, verified: true });
    } catch (error) {
      if (error instanceof SupabaseMfaError) {
        sendError(response, error);
        return;
      }
      const invalid = error instanceof PrimaryAuthError && ["AUTH_OTP_INVALID", "AUTH_EMAIL_NOT_VERIFIED"].includes(error.code);
      response.status(invalid ? 401 : 503).json({
        ok: false,
        error: invalid ? "AUTH_OTP_INVALID" : "MFA_PROVIDER_UNAVAILABLE",
        message: invalid ? "The verification code is invalid or expired." : "Account verification could not be completed.",
        requestId: response.locals.requestId,
      });
    }
  });

  router.post("/enroll", securitySettingsRateLimit, requireCsrfForSession, async (request, response) => {
    const session = await requireSupabaseAppSession(request, response);
    if (!session) return;
    const parsed = enrollmentSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: "MFA_REQUEST_INVALID", message: "Check the MFA request and try again.", requestId: response.locals.requestId });
      return;
    }
    if (parsed.data.action !== "status" && !(await hasRecentRequestReauthentication(request))) {
      sendRecentAuthenticationRequired(response);
      return;
    }
    const tokens = await requireProviderTokens(request, response);
    if (!tokens) return;
    response.setHeader("Cache-Control", "no-store");
    const owner = { email: session.email, subject: session.subject };
    try {
      if (parsed.data.action === "status") {
        const result = await service.statusWithTokens(tokens, owner);
        await persistProviderTokens(request, result.tokens);
        response.json({ ok: true, status: result.status });
        return;
      }
      if (parsed.data.action === "start") {
        const result = await service.startEnrollmentWithTokens(tokens, owner);
        await persistProviderTokens(request, result.tokens);
        response.json({ ok: true, enrollment: result.enrollment });
        return;
      }
      if (parsed.data.action === "cancel") {
        const result = await service.cancelEnrollmentWithTokens(tokens, owner, parsed.data.factorId);
        await persistProviderTokens(request, result.tokens);
        response.json({ ok: true, cancelled: true });
        return;
      }
      const result = await service.verifyEnrollment(tokens, owner, parsed.data.factorId, parsed.data.code);
      await persistProviderTokens(request, result.tokens);
      await markRequestSessionReauthenticated(request);
      await revokeOtherSessionsForRequest(request);
      response.json({ ok: true, status: result.status });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/disable", securitySettingsRateLimit, requireCsrfForSession, async (request, response) => {
    const session = await requireSupabaseAppSession(request, response);
    if (!session) return;
    if (!(await hasRecentRequestReauthentication(request))) {
      sendRecentAuthenticationRequired(response);
      return;
    }
    const parsed = disableSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: "MFA_REQUEST_INVALID", message: "Check the MFA request and try again.", requestId: response.locals.requestId });
      return;
    }
    const tokens = await requireProviderTokens(request, response);
    if (!tokens) return;
    response.setHeader("Cache-Control", "no-store");
    try {
      const result = await service.disableFactorWithTokens(tokens, { email: session.email, subject: session.subject }, parsed.data.factorId, parsed.data.code);
      await persistProviderTokens(request, result.tokens);
      await markRequestSessionReauthenticated(request);
      await revokeOtherSessionsForRequest(request);
      response.json({ ok: true, status: result.status });
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}

export const mfaRoutes = createMfaRoutes();
