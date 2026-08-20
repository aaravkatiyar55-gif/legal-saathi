import type { NextFunction, Request, Response } from "express";
import { consentService } from "../services/consent/consent.service";
import { currentTermsConsentVersion, getRequestSession } from "../services/local/authSessions.service";

export async function requireCurrentTermsConsent(request: Request, response: Response, next: NextFunction) {
  const session = await getRequestSession(request);
  if (!session?.subject || session.consentVersion !== currentTermsConsentVersion || !session.consentedAt) {
    response.status(409).json({
      ok: false,
      error: "CONSENT_REQUIRED",
      message: "Review and accept the current Terms & Safety notice before sending legal content for AI processing.",
    });
    return;
  }
  try {
    const current = await consentService.latestCurrent(session.subject);
    if (!current) {
      response.status(409).json({
        ok: false,
        error: "CONSENT_REQUIRED",
        message: "Review and accept the current Terms & Safety notice before sending legal content for AI processing.",
      });
      return;
    }
    next();
  } catch {
    response.status(503).json({
      ok: false,
      error: "CONSENT_STORE_UNAVAILABLE",
      message: "Consent status could not be verified right now.",
      requestId: response.locals.requestId,
    });
  }
}
