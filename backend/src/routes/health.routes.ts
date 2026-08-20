import { Request, Router } from "express";
import { env } from "../config/env";
import { isRazorpayConfigured } from "../services/payments/razorpay.service";
import { isOpenRouterConfigured } from "../services/ai/openRouterProvider";
import { isMeshConfigured } from "../services/ai/meshProvider";
import { getWebSearchStatus } from "../services/ai/webSearch.service";
import { isAdminSecurityConfigured } from "../middleware/adminAccess.middleware";
import { isSessionConfigured } from "../services/local/authSessions.service";
import { requireAdminAccess } from "../middleware/adminAccess.middleware";
import { getSupabaseCapabilityRegistry } from "../services/supabase/capabilityRegistry.service";
import { isSupabaseMfaConfigured } from "../services/security/supabaseMfa.service";

export const healthRoutes = Router();

healthRoutes.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    app: "Legal Saathi",
    requestId: response.locals.requestId,
  });
});

function isLoopbackRequest(request: Request) {
  const address = request.socket.remoteAddress ?? "";
  return address === "::1" || address === "127.0.0.1" || address.startsWith("::ffff:127.");
}

function requireLocalDevelopmentOrAdmin(request: Request, response: import("express").Response, next: import("express").NextFunction) {
  if (env.nodeEnv !== "production" && isLoopbackRequest(request)) {
    next();
    return;
  }
  requireAdminAccess(request, response, next);
}

// Detailed diagnostics are limited to loopback development or an authenticated
// admin. Public readiness stays intentionally minimal.
healthRoutes.get("/config/status", requireLocalDevelopmentOrAdmin, async (_request, response) => {
  const web = getWebSearchStatus();
  const aiConfigured = env.aiProvider === "mesh" ? isMeshConfigured() : isOpenRouterConfigured();
  const supabase = await getSupabaseCapabilityRegistry();
  response.json({
    ok: true,
    mockMode: Boolean(env.mockMode),
    aiConfigured,
    openRouterPoolConfigured: env.openRouterApiKeys.length > 0,
    openRouterFreeOnly: Boolean(env.openRouterFreeOnly),
    freeAutoConfigured: env.modelAutoId === "openrouter/free",
    razorpayConfigured: isRazorpayConfigured(),
    googleConfigured: Boolean(env.googleClientId.trim()),
    webConfigured: web.configured,
    adminConfigured: isAdminSecurityConfigured(),
    sessionConfigured: isSessionConfigured(),
    ragConfigured: Boolean(env.ragEnabled),
    twoFactorConfigured: isSupabaseMfaConfigured(),
    persistentStorageConfigured: Boolean(env.supabaseUrl.trim() && env.supabaseServiceRoleKey.trim()),
    supabase,
  });
});
