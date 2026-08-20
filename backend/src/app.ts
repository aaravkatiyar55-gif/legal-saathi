import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { randomUUID } from "node:crypto";

import { env } from "./config/env";
import { errorMiddleware } from "./middleware/error.middleware";
import {
  adminRateLimit,
  aiRateLimit,
  authRateLimit,
  caseRateLimit,
  documentQuestionRateLimit,
  documentRateLimit,
  globalRateLimit,
  paymentRateLimit,
  paymentWebhookRateLimit,
} from "./middleware/rateLimit.middleware";
import { aiRoutes } from "./routes/ai.routes";
import { adminRoutes } from "./routes/admin.routes";
import { healthRoutes } from "./routes/health.routes";
import { paymentsRoutes, razorpayWebhookHandler } from "./routes/payments.routes";
import { profileRoutes } from "./routes/profile.routes";
import { supabaseCasesRoutes } from "./routes/supabaseCases.routes";
import { usageRoutes } from "./routes/usage.routes";
import { documentRoutes } from "./routes/documents.routes";
import { caseQuestionRoutes } from "./routes/caseQuestions.routes";
import { plansRoutes } from "./routes/plans.routes";
import { requireCsrfForSession } from "./middleware/csrf.middleware";
import { apiEnvelopeMiddleware } from "./middleware/apiEnvelope.middleware";
import { incidentRoutes } from "./routes/incidents.routes";
import { authRoutes } from "./routes/auth.routes";
import { mfaRoutes } from "./routes/mfa.routes";
import { chatRoutes } from "./routes/chats.routes";

export function createApp() {
  const app = express();

  app.set("trust proxy", env.nodeEnv === "production" ? 1 : false);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      strictTransportSecurity: env.nodeEnv === "production" ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(), usb=()");
    next();
  });
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || env.allowedOrigins.includes(origin));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Request-Id"],
    }),
  );
  app.use((request, response, next) => {
    const requestedId = String(request.header("x-request-id") ?? "").trim();
    const requestId = /^[A-Za-z0-9_-]{8,120}$/.test(requestedId) ? requestedId : randomUUID();
    response.locals.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    next();
  });
  app.use(apiEnvelopeMiddleware);
  app.use(globalRateLimit);
  // Razorpay webhook verification must receive the exact raw bytes. Keep this
  // route before the global JSON parser; it has no browser session or CSRF.
  app.post(
    "/payments/razorpay/webhook",
    paymentWebhookRateLimit,
    express.raw({ type: "application/json", limit: "256kb" }),
    razorpayWebhookHandler,
  );
  app.use(express.json({ limit: "512kb" }));
  app.use(morgan((tokens, request, response) => {
    const path = request.originalUrl.split("?")[0];
    return `[${response.locals.requestId ?? "request"}] ${tokens.method(request, response)} ${path} ${tokens.status(request, response)} ${tokens["response-time"](request, response)} ms`;
  }));

  app.use(healthRoutes);
  app.use("/plans", plansRoutes);
  app.use("/auth", authRoutes);
  app.use("/ai", aiRateLimit, requireCsrfForSession, aiRoutes);
  app.use("/cases", caseRateLimit, requireCsrfForSession, supabaseCasesRoutes);
  app.use("/chats", caseRateLimit, requireCsrfForSession, chatRoutes);
  app.use("/documents", documentRateLimit, requireCsrfForSession, documentRoutes);
  app.use("/case-questions", documentQuestionRateLimit, requireCsrfForSession, caseQuestionRoutes);
  app.use("/profile/security/2fa", mfaRoutes);
  // Retire the earlier browser-token exchange paths. Primary identity is now
  // established only through /auth and receives an app cookie after the final
  // Supabase AAL gate.
  app.use("/profile/auth", (_request, response) => {
    response.status(410).json({ ok: false, error: "AUTH_ENDPOINT_RETIRED", message: "Use the secure authentication flow.", requestId: response.locals.requestId });
  });
  app.post("/profile/session", (_request, response) => {
    response.status(410).json({ ok: false, error: "AUTH_ENDPOINT_RETIRED", message: "Use the secure authentication flow.", requestId: response.locals.requestId });
  });
  app.post("/profile/dev-session", (request, response, next) => {
    if (env.nodeEnv !== "production" && env.allowInsecureDevAuth) {
      next();
      return;
    }
    response.status(404).json({ ok: false, error: "NOT_FOUND", message: "This route is not available.", requestId: response.locals.requestId });
  });
  app.use("/profile", profileRoutes);
  app.use("/incidents", incidentRoutes);
  app.use("/admin", adminRateLimit, requireCsrfForSession, adminRoutes);
  app.use("/payments/razorpay", paymentRateLimit, requireCsrfForSession, paymentsRoutes);
  app.use("/usage", authRateLimit, usageRoutes);

  app.use(errorMiddleware);

  return app;
}
