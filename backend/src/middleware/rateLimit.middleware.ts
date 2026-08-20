import { rateLimit } from "express-rate-limit";

function createLimiter(windowMs: number, limit: number, message: string, skipSuccessfulRequests = false) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests,
    message: { ok: false, error: "RATE_LIMITED", message },
    handler(_request, response, _next, options) {
      response.status(options.statusCode).json({
        ok: false,
        error: "RATE_LIMITED",
        message,
        requestId: response.locals.requestId,
      });
    },
  });
}

export const globalRateLimit = createLimiter(15 * 60 * 1000, 500, "Too many requests. Please try again later.");
export const authRateLimit = createLimiter(10 * 60 * 1000, 20, "Too many sign-in attempts. Please wait and try again.");
// Only failed session establishment attempts count. Normal session refreshes
// and a user closing a Google chooser never reach this limiter as failures.
export const authSessionRateLimit = createLimiter(10 * 60 * 1000, 12, "Too many sign-in attempts. Please wait and try again.", true);
export const securitySettingsRateLimit = createLimiter(10 * 60 * 1000, 12, "Too many security-setting attempts. Please wait and try again.");
export const aiRateLimit = createLimiter(60 * 1000, 20, "AI request limit reached. Please wait a minute and try again.");
export const paymentRateLimit = createLimiter(10 * 60 * 1000, 15, "Too many payment attempts. Please wait and try again.");
export const adminRateLimit = createLimiter(5 * 60 * 1000, 30, "Too many admin requests. Please wait and try again.");
export const adminLoginRateLimit = createLimiter(15 * 60 * 1000, 8, "Too many admin sign-in attempts. Please wait and try again.", true);
export const caseRateLimit = createLimiter(15 * 60 * 1000, 80, "Too many case requests. Please wait and try again.");
export const caseCreateRateLimit = createLimiter(10 * 60 * 1000, 12, "Too many case creation requests. Please wait and try again.");
export const documentRateLimit = createLimiter(15 * 60 * 1000, 80, "Too many document requests. Please wait and try again.");
export const documentUploadRateLimit = createLimiter(15 * 60 * 1000, 12, "Too many document uploads. Please wait and try again.");
export const documentQuestionRateLimit = createLimiter(10 * 60 * 1000, 25, "Too many document questions. Please wait and try again.");
export const couponRateLimit = createLimiter(10 * 60 * 1000, 30, "Too many coupon requests. Please wait and try again.");
export const paymentOrderRateLimit = createLimiter(10 * 60 * 1000, 10, "Too many payment order requests. Please wait and try again.");
export const paymentVerifyRateLimit = createLimiter(10 * 60 * 1000, 20, "Too many payment verification requests. Please wait and try again.");
export const paymentWebhookRateLimit = createLimiter(60 * 1000, 120, "Too many webhook events. Please retry later.");
export const incidentReportRateLimit = createLimiter(60 * 60 * 1000, 8, "Too many problem reports. Please wait before reporting again.");
export const publicIncidentReportRateLimit = createLimiter(60 * 60 * 1000, 3, "Too many problem reports. Please wait before reporting again.");

