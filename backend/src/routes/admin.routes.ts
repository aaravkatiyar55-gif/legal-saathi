import { Router } from "express";
import {
  createAdminSessionForIdentity,
  getAdminIdentity,
  isAdminSecurityConfigured,
  requireAdminAccess,
} from "../middleware/adminAccess.middleware";
import {
  allowedUserTiers,
  banUser,
  isValidUserEmail,
  listRecentUserEvents,
  listUserProfiles,
  normalizeUserEmail,
  OnlineUserStoreError,
  unbanUser,
} from "../services/supabase/onlineUsers.service";
import { getCaseWithMemory, listLatestCases } from "../services/legal/casePersistence.service";
import { SupabaseApiError } from "../services/supabase/supabaseClient";
import {
  deletePreviewCoupon,
  disablePreviewCoupon,
  isPreviewStoreEnabled,
  listPreviewCoupons,
  listPreviewProfiles,
  recordPreviewAdminEvent,
  resetPreviewUsage,
  savePreviewCoupon,
  updatePreviewProfile,
} from "../services/local/previewAccess.service";
import { adminLoginRateLimit } from "../middleware/rateLimit.middleware";
import { env } from "../config/env";
import { getRequestSession } from "../services/local/authSessions.service";
import { requireCsrfForSession } from "../middleware/csrf.middleware";
import { isAuthorizedAdminEmail, normalizeAdminEmail } from "../security/adminIdentity";
import {
  AdminCredentialStoreError,
  isAdminCredentialConfigured,
  recordAdminAudit,
  setupAdminCredential,
  validateAdminPassword,
  verifyAdminCredential,
} from "../services/admin/adminCredentials.service";
import {
  AdminPlanChangeError,
  changeUserPlanAsAdmin,
  presentAdminUserWithAuthoritativePlan,
} from "../services/admin/adminPlanChange.service";
import { getIncidentStore, incidentStatuses } from "../services/incidents/incident.service";
import { getHiddenUsers, hideUser, restoreUser } from "../services/admin/hiddenUsers.service";
import { getCommercialPricing, updateCommercialPricing } from "../services/billing/commercialPricing.service";
import { ConsentStoreError, listConsentEventsByEmail, type ConsentEvent } from "../services/consent/consent.service";

export const adminRoutes = Router();

async function getEligibleAdminSession(request: import("express").Request) {
  const session = await getRequestSession(request);
  if (
    !session
    || !isAuthorizedAdminEmail(session.email)
    || (env.nodeEnv === "production" && session.provider !== "google")
  ) return null;
  return session;
}

function requestId(response: import("express").Response) {
  return String(response.locals.requestId ?? "");
}

adminRoutes.get("/session/readiness", async (request, response) => {
  try {
    const session = await getEligibleAdminSession(request);
    if (!session) {
      response.status(403).json({ ok: false, error: "ADMIN_ACCESS_DENIED", message: "Admin access is unavailable for this account.", requestId: requestId(response) });
      return;
    }
    if (!isAdminSecurityConfigured()) {
      response.status(503).json({ ok: false, error: "ADMIN_NOT_CONFIGURED", message: "Admin security is not configured.", requestId: requestId(response) });
      return;
    }
    response.json({
      ok: true,
      eligible: true,
      credentialConfigured: await isAdminCredentialConfigured(session.email),
    });
  } catch (error) {
    response.status(503).json({ ok: false, error: "ADMIN_CREDENTIAL_STORE_UNAVAILABLE", message: "Admin authorization is temporarily unavailable.", requestId: requestId(response) });
  }
});

adminRoutes.post("/credential/setup", adminLoginRateLimit, requireCsrfForSession, async (request, response) => {
  try {
    const session = await getEligibleAdminSession(request);
    if (!session) {
      response.status(403).json({ ok: false, error: "ADMIN_ACCESS_DENIED", message: "Admin access is unavailable for this account.", requestId: requestId(response) });
      return;
    }
    const password = request.body?.password;
    const confirmation = request.body?.confirmation;
    if (password !== confirmation || !validateAdminPassword(password)) {
      response.status(400).json({
        ok: false,
        error: "ADMIN_PASSWORD_POLICY_FAILED",
        message: "Use 14-128 characters with uppercase, lowercase, a number, and a symbol.",
        requestId: requestId(response),
      });
      return;
    }
    await setupAdminCredential(session.email, password, requestId(response));
    response.status(201).json({ ok: true, credentialConfigured: true });
  } catch (error) {
    const alreadyConfigured = error instanceof AdminCredentialStoreError && error.code === "ADMIN_CREDENTIAL_ALREADY_CONFIGURED";
    response.status(alreadyConfigured ? 409 : 503).json({
      ok: false,
      error: alreadyConfigured ? "ADMIN_CREDENTIAL_ALREADY_CONFIGURED" : "ADMIN_CREDENTIAL_STORE_UNAVAILABLE",
      message: alreadyConfigured ? "An admin password is already configured for this account." : "Admin authorization is temporarily unavailable.",
      requestId: requestId(response),
    });
  }
});

adminRoutes.post("/session", adminLoginRateLimit, requireCsrfForSession, async (request, response) => {
  try {
    const session = await getEligibleAdminSession(request);
    if (!session) {
      response.status(403).json({ ok: false, error: "ADMIN_ACCESS_DENIED", message: "Admin access is unavailable for this account.", requestId: requestId(response) });
      return;
    }
    if (!await verifyAdminCredential(session.email, request.body?.password)) {
      await recordAdminAudit({
        actorEmail: normalizeAdminEmail(session.email),
        action: "admin_session_created",
        result: "denied",
        requestId: requestId(response),
      }).catch(() => undefined);
      response.status(401).json({ ok: false, error: "ADMIN_ACCESS_DENIED", message: "Admin authorization failed.", requestId: requestId(response) });
      return;
    }
    const adminSession = createAdminSessionForIdentity(session);
    await recordAdminAudit({
      actorEmail: normalizeAdminEmail(session.email),
      action: "admin_session_created",
      result: "success",
      requestId: requestId(response),
    }).catch(() => undefined);
    response.json({ ok: true, ...adminSession });
  } catch {
    response.status(503).json({ ok: false, error: "ADMIN_CREDENTIAL_STORE_UNAVAILABLE", message: "Admin authorization is temporarily unavailable.", requestId: requestId(response) });
  }
});

adminRoutes.use(requireAdminAccess);
adminRoutes.use((request, response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    next();
    return;
  }
  requireCsrfForSession(request, response, next);
});

adminRoutes.get("/session/status", (_request, response) => {
  response.json({ ok: true, adminEmail: getAdminIdentity(response) });
});

function sendAdminError(response: import("express").Response, error: unknown) {
  if (error instanceof Error && error.message === "INVALID_TIER") {
    response.status(400).json({ ok: false, error: `tier must be one of: ${allowedUserTiers.join(", ")}` });
    return;
  }
  response.status(error instanceof OnlineUserStoreError || error instanceof SupabaseApiError || error instanceof ConsentStoreError ? 503 : 500).json({
    ok: false,
    error: "Admin request failed",
  });
}

function readTargetEmail(request: import("express").Request, response: import("express").Response) {
  const email = normalizeUserEmail(request.params.email);
  if (!isValidUserEmail(email)) {
    response.status(400).json({ ok: false, error: "A valid user email is required" });
    return null;
  }
  return email;
}

function presentConsentEvent(event: ConsentEvent) {
  return {
    id: event.id,
    email: event.normalizedEmail,
    accepted: event.accepted,
    acceptedAt: event.acceptedAt,
    termsVersion: event.termsVersion,
    privacyVersion: event.privacyVersion,
    consentVersion: event.consentVersion,
    aiDisclaimerVersion: event.aiDisclaimerVersion,
    dataProcessingVersion: event.dataProcessingVersion,
    cookiePreferencesVersion: event.cookiePreferencesVersion,
    authenticationMethod: event.authenticationMethod,
    locale: event.locale,
    termsDocumentId: event.termsDocumentId,
    privacyDocumentId: event.privacyDocumentId,
    termsContentHashSha256: event.termsContentHashSha256,
    privacyContentHashSha256: event.privacyContentHashSha256,
    acceptedItems: event.acceptedItems,
    requestId: event.requestId,
  };
}

function csvCell(value: unknown) {
  let safe = String(value ?? "");
  if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
  return `"${safe.replaceAll("\"", "\"\"")}"`;
}

adminRoutes.get("/consents", async (request, response) => {
  const email = normalizeUserEmail(request.query.email);
  if (!isValidUserEmail(email)) {
    response.status(400).json({ ok: false, error: "A valid user email is required" });
    return;
  }
  try {
    const events = await listConsentEventsByEmail(email, Number(request.query.limit ?? 50));
    response.json({ ok: true, email, events: events.map(presentConsentEvent) });
  } catch (error) {
    sendAdminError(response, error);
  }
});

adminRoutes.get("/consents/export", async (request, response) => {
  const email = normalizeUserEmail(request.query.email);
  if (!isValidUserEmail(email)) {
    response.status(400).json({ ok: false, error: "A valid user email is required" });
    return;
  }
  try {
    const events = (await listConsentEventsByEmail(email, 200)).map(presentConsentEvent);
    const columns = [
      "id", "email", "accepted", "acceptedAt", "termsVersion", "privacyVersion",
      "consentVersion", "aiDisclaimerVersion", "dataProcessingVersion",
      "cookiePreferencesVersion", "authenticationMethod", "locale",
      "termsDocumentId", "privacyDocumentId", "termsContentHashSha256",
      "privacyContentHashSha256", "requestId",
    ] as const;
    const csv = [
      columns.map(csvCell).join(","),
      ...events.map((event) => columns.map((column) => csvCell(event[column])).join(",")),
    ].join("\r\n");
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="legal-saathi-consent-${email.replace(/[^a-z0-9]/gi, "_")}.csv"`);
    response.send(`\uFEFF${csv}`);
  } catch (error) {
    sendAdminError(response, error);
  }
});

adminRoutes.get("/users", async (_request, response) => {
  try {
    const hidden = await getHiddenUsers();
    if (isPreviewStoreEnabled()) {
      const users = await listPreviewProfiles();
      const presented = await Promise.all(users.map(async (profile) => {
        const p = await presentAdminUserWithAuthoritativePlan(profile);
        return { ...p, isHidden: hidden.includes(String(p.email).toLowerCase()) };
      }));
      response.json({ ok: true, users: presented, previewOnly: true });
      return;
    }

    const users = await listUserProfiles();
    const presented = await Promise.all(users.map(async (profile) => {
      const p = await presentAdminUserWithAuthoritativePlan(profile);
      return { ...p, isHidden: hidden.includes(String(p.email).toLowerCase()) };
    }));
    response.json({ ok: true, users: presented });
  } catch (error) {
    if (isPreviewStoreEnabled()) {
      const hidden = await getHiddenUsers();
      const users = await listPreviewProfiles();
      const presented = await Promise.all(users.map(async (profile) => {
        const p = await presentAdminUserWithAuthoritativePlan(profile);
        return { ...p, isHidden: hidden.includes(String(p.email).toLowerCase()) };
      }));
      response.json({ ok: true, users: presented, previewOnly: true });
      return;
    }
    sendAdminError(response, error);
  }
});

adminRoutes.post("/users/:email/ban", async (request, response) => {
  const email = readTargetEmail(request, response);
  if (!email) return;
  if (isPreviewStoreEnabled()) {
    response.json({ ok: true, profile: await updatePreviewProfile(email, { isBanned: true, banReason: String(request.body?.reason || "Restricted by preview admin") }, "ban_user"), previewOnly: true });
    return;
  }
  try {
    response.json({ ok: true, profile: await banUser(email, request.body?.reason, getAdminIdentity(response)) });
  } catch (error) {
    if (isPreviewStoreEnabled()) {
      response.json({ ok: true, profile: await updatePreviewProfile(email, { isBanned: true, banReason: String(request.body?.reason || "Restricted by preview admin") }, "ban_user"), previewOnly: true });
      return;
    }
    sendAdminError(response, error);
  }
});

adminRoutes.post("/users/:email/unban", async (request, response) => {
  const email = readTargetEmail(request, response);
  if (!email) return;
  if (isPreviewStoreEnabled()) {
    response.json({ ok: true, profile: await updatePreviewProfile(email, { isBanned: false, banReason: null }, "unban_user"), previewOnly: true });
    return;
  }
  try {
    response.json({ ok: true, profile: await unbanUser(email, getAdminIdentity(response)) });
  } catch (error) {
    if (isPreviewStoreEnabled()) {
      response.json({ ok: true, profile: await updatePreviewProfile(email, { isBanned: false, banReason: null }, "unban_user"), previewOnly: true });
      return;
    }
    sendAdminError(response, error);
  }
});

adminRoutes.post("/users/:email/tier", async (request, response) => {
  const email = readTargetEmail(request, response);
  if (!email) return;
  try {
    response.json({
      ok: true,
      ...(await changeUserPlanAsAdmin({
        targetEmail: email,
        requestedPlan: request.body?.tier,
        adminEmail: getAdminIdentity(response),
        requestId: response.locals.requestId,
      })),
      previewOnly: isPreviewStoreEnabled(),
    });
  } catch (error) {
    if (error instanceof AdminPlanChangeError) {
      const status = error.code === "USER_NOT_FOUND" ? 404 : error.code === "SAME_PLAN" ? 409 : error.code === "INVALID_PLAN" ? 400 : 503;
      response.status(status).json({ ok: false, error: error.code, message: error.message, requestId: response.locals.requestId });
      return;
    }
    sendAdminError(response, error);
  }
});

adminRoutes.post("/users/:email/usage/reset", async (request, response) => {
  const email = readTargetEmail(request, response);
  if (!email) return;
  if (!isPreviewStoreEnabled()) {
    response.status(501).json({ ok: false, error: "Usage reset preview endpoint is not enabled in production" });
    return;
  }
    const feature = ["chat", "caseFolders", "proChats", "ultraChats", "webSearches"].includes(String(request.body?.feature))
    ? request.body.feature
    : undefined;
  await resetPreviewUsage(email, feature);
  response.json({ ok: true, previewOnly: true });
});

adminRoutes.post("/users/:email/hide", async (request, response) => {
  const email = readTargetEmail(request, response);
  if (!email) return;
  await hideUser(email);
  response.json({ ok: true });
});

adminRoutes.post("/users/:email/restore", async (request, response) => {
  const email = readTargetEmail(request, response);
  if (!email) return;
  await restoreUser(email);
  response.json({ ok: true });
});

adminRoutes.get("/coupons", async (_request, response) => {
  if (!isPreviewStoreEnabled()) {
    response.status(501).json({ ok: false, error: "Coupon administration requires the production coupon store" });
    return;
  }
  response.json({ ok: true, coupons: await listPreviewCoupons(), previewOnly: true });
});

adminRoutes.post("/coupons", async (request, response) => {
  if (!isPreviewStoreEnabled()) {
    response.status(501).json({ ok: false, error: "Coupon administration requires the production coupon store" });
    return;
  }
  try {
    response.status(201).json({ ok: true, coupon: await savePreviewCoupon(request.body || {}), previewOnly: true });
  } catch (error) {
    response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Coupon could not be saved" });
  }
});

adminRoutes.post("/coupons/:code/disable", async (request, response) => {
  if (!isPreviewStoreEnabled()) {
    response.status(501).json({ ok: false, error: "Coupon administration requires the production coupon store" });
    return;
  }
  response.json({ ok: true, coupon: await disablePreviewCoupon(String(request.params.code)), previewOnly: true });
});

adminRoutes.delete("/coupons/:code", async (request, response) => {
  if (!isPreviewStoreEnabled()) {
    response.status(501).json({ ok: false, error: "Coupon administration requires the production coupon store" });
    return;
  }
  await deletePreviewCoupon(String(request.params.code));
  response.json({ ok: true, previewOnly: true });
});

adminRoutes.get("/pricing", async (_request, response) => {
  response.json({ ok: true, pricing: await getCommercialPricing() });
});

adminRoutes.patch("/pricing", async (request, response) => {
  try {
    const pricing = await updateCommercialPricing(request.body || {});
    if (isPreviewStoreEnabled()) {
      await recordPreviewAdminEvent({
        action: "commercial_pricing_updated",
        metadata: {
          actor: getAdminIdentity(response),
          plusMonthly: pricing.plans.plus.monthly,
          plusYearly: pricing.plans.plus.yearly,
          proMonthly: pricing.plans.pro.monthly,
          proYearly: pricing.plans.pro.yearly,
          maxMonthly: pricing.plans.max.monthly,
          maxYearly: pricing.plans.max.yearly,
        },
      });
    }
    response.json({ ok: true, pricing });
  } catch (error) {
    response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Pricing could not be saved" });
  }
});

adminRoutes.get("/user-events", async (_request, response) => {
  try {
    response.json({ ok: true, ...(await listRecentUserEvents()) });
  } catch (error) {
    sendAdminError(response, error);
  }
});

adminRoutes.get("/cases", async (_request, response) => {
  try {
    response.json({ ok: true, cases: await listLatestCases(undefined, true) });
  } catch (error) {
    sendAdminError(response, error);
  }
});

adminRoutes.get("/cases/:caseId", async (request, response) => {
  try {
    const result = await getCaseWithMemory(String(request.params.caseId), undefined, true);
    if (!result.case) {
      response.status(404).json({ ok: false, error: "Case not found" });
      return;
    }
    response.json({ ok: true, ...result });
  } catch (error) {
    sendAdminError(response, error);
  }
});

adminRoutes.get("/incidents", async (_request, response) => {
  try {
    const incidents = (await getIncidentStore().list(200)).map(({ reporterKey: _reporterKey, description: _description, ...incident }) => incident);
    response.json({
      ok: true,
      incidents,
      projectReference: env.nodeEnv === "production" ? "deployed Legal Saathi source checkout" : process.cwd(),
    });
  } catch {
    response.status(503).json({ ok: false, error: "INCIDENT_STORE_UNAVAILABLE", message: "The incident store is not configured." });
  }
});

adminRoutes.patch("/incidents/:incidentId/status", async (request, response) => {
  const incidentId = String(request.params.incidentId ?? "");
  const status = String(request.body?.status ?? "") as typeof incidentStatuses[number];
  if (!/^inc_[a-f0-9]{20}$/.test(incidentId) || !incidentStatuses.includes(status)) {
    response.status(400).json({ ok: false, error: "INVALID_INCIDENT_UPDATE", message: "Choose a valid incident and status." });
    return;
  }
    try {
      const incident = await getIncidentStore().updateStatus(incidentId, status);
    if (!incident) {
      response.status(404).json({ ok: false, error: "INCIDENT_NOT_FOUND", message: "Incident not found." });
      return;
    }
      const { reporterKey: _reporterKey, description: _description, ...safeIncident } = incident;
      response.json({ ok: true, incident: safeIncident });
  } catch {
    response.status(503).json({ ok: false, error: "INCIDENT_STORE_UNAVAILABLE", message: "The incident status could not be saved." });
  }
});
