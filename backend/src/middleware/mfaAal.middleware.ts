import type { NextFunction, Request, Response } from "express";

import {
  getRequestProviderSession,
  getRequestSession,
  isProviderBackedSession,
  updateRequestProviderSession,
} from "../services/local/authSessions.service";
import {
  requiresAal2ForSensitiveAction,
  SupabaseMfaError,
  supabaseMfaService,
} from "../services/security/supabaseMfa.service";

function sendMfaError(response: Response, error: unknown) {
  const safe = error instanceof SupabaseMfaError
    ? error
    : new SupabaseMfaError("MFA_PROVIDER_UNAVAILABLE", 503);
  const message = safe.code === "MFA_AAL2_REQUIRED"
    ? "Complete the authenticator challenge before continuing."
    : safe.code === "MFA_SESSION_REQUIRED"
      ? "Sign in again before continuing."
      : "Authenticator security could not be verified right now.";
  response.status(safe.status).json({
    ok: false,
    error: safe.code,
    message,
    requestId: response.locals.requestId,
  });
}

export async function requireAal2WhenMfaEnabled(request: Request, response: Response, next: NextFunction) {
  const session = await getRequestSession(request);
  if (!session) {
    sendMfaError(response, new SupabaseMfaError("MFA_SESSION_REQUIRED", 401));
    return;
  }
  if (!isProviderBackedSession(session.provider)) {
    next();
    return;
  }

  const tokens = await getRequestProviderSession(request);
  if (!tokens) {
    sendMfaError(response, new SupabaseMfaError("MFA_SESSION_REQUIRED", 401));
    return;
  }

  try {
    const result = await supabaseMfaService.statusWithTokens(tokens, {
      email: session.email,
      subject: session.subject,
    });
    const updated = await updateRequestProviderSession(request, {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresAt: result.tokens.expiresAt ?? Math.floor(Date.now() / 1_000) + 600,
    });
    if (!updated) throw new SupabaseMfaError("MFA_SESSION_REQUIRED", 401);
    if (requiresAal2ForSensitiveAction(result.status)) {
      throw new SupabaseMfaError("MFA_AAL2_REQUIRED", 403);
    }
    response.locals.mfaStatus = result.status;
    next();
  } catch (error) {
    sendMfaError(response, error);
  }
}
