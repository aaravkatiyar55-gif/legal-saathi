import { Router } from "express";
import { requireActiveOnlineAccount } from "../middleware/accountAccess.middleware";
import { getVerifiedUser } from "../middleware/identity.middleware";
import {
  getUserProfile,
  isValidUserEmail,
  normalizeUserEmail,
  OnlineUserStoreError,
  recordUserSession,
} from "../services/supabase/onlineUsers.service";
import { ensurePreviewProfile, getPreviewProfile } from "../services/local/previewAccess.service";
import { authSessionRateLimit } from "../middleware/rateLimit.middleware";
import { requireCsrfForSession } from "../middleware/csrf.middleware";
import { requireAal2WhenMfaEnabled } from "../middleware/mfaAal.middleware";
import {
  createLocalSession,
  acceptTermsForRequest,
  currentConsentVersion,
  currentPrivacyVersion,
  currentTermsVersion,
  currentTermsConsentVersion,
  getRequestSession,
  isSessionConfigured,
  issueSessionCookie,
  revokeRequestSession,
  revokeSessionById,
  setSessionLanguageForRequest,
  sessionPublicState,
  type LocalSession,
} from "../services/local/authSessions.service";
import { isLoopbackDevelopmentRequest } from "../security/requestOrigin";
import { getPlanState } from "../services/billing/planState.service";
import { getPlanStateWithTransactions } from "../services/billing/planState.service";
import { listLatestCases } from "../services/legal/casePersistence.service";
import { createDataRightsRequest } from "../services/legal/dataRights.service";
import { env } from "../config/env";
import {
  consentService,
  ConsentStoreError,
  currentAiDisclaimerVersion,
  currentCookiePreferencesVersion,
  currentDataProcessingVersion,
} from "../services/consent/consent.service";
import { consentDocumentBundle } from "../services/consent/consentDocuments.service";
import { isAuthorizedAdminEmail } from "../security/adminIdentity";


export const profileRoutes = Router();

function sessionClientState(session: LocalSession) {
  return {
    ...sessionPublicState(session),
    adminEligible: isAuthorizedAdminEmail(session.email) && (env.nodeEnv !== "production" || session.provider === "google"),
  };
}

// Public configuration only. The client ID is an OAuth public identifier; no
// client secret, provider key, or session secret is ever returned.
profileRoutes.get("/config", (_request, response) => {
  const clientId = env.googleClientId.trim();
  response.json({
    ok: true,
    google: {
      configured: Boolean(clientId) && !clientId.includes("PASTE_") && clientId.endsWith(".apps.googleusercontent.com"),
      clientId: Boolean(clientId) && !clientId.includes("PASTE_") ? clientId : "",
    },
  });
});

function sendProfileStoreError(response: import("express").Response, error: unknown) {
  response.status(error instanceof OnlineUserStoreError ? 503 : 500).json({
    ok: false,
    error: "Online profile request failed",
  });
}

function canUseLocalProfileFallback() {
  return env.nodeEnv !== "production" && (env.localCasesFallback || env.localPaymentTestMode);
}

// Explicit development-only identity bootstrap. Protected routes never infer
// identity from ownerEmail/email fields in their own request payloads.
profileRoutes.post("/dev-session", authSessionRateLimit, async (request, response) => {
  if (!env.allowInsecureDevAuth || !isLoopbackDevelopmentRequest(request)) {
    response.status(404).json({ ok: false, error: "NOT_FOUND", message: "This route is not available.", requestId: response.locals.requestId });
    return;
  }
  if (!isSessionConfigured()) {
    response.status(503).json({ ok: false, error: "SESSION_NOT_CONFIGURED", message: "Secure session setup is incomplete.", requestId: response.locals.requestId });
    return;
  }
  const email = normalizeUserEmail(request.body?.email);
  if (!isValidUserEmail(email)) {
    response.status(400).json({ ok: false, error: "INVALID_DEVELOPMENT_ACCOUNT", message: "Enter a valid development email address.", requestId: response.locals.requestId });
    return;
  }
  const displayName = typeof request.body?.displayName === "string" ? request.body.displayName.trim().slice(0, 200) : email;
  const identity = { email, displayName: displayName || email, avatarUrl: "", provider: "development" as const };
  await revokeRequestSession(request, response);
  const session = await createLocalSession(identity);
  try {
    const profile = canUseLocalProfileFallback()
      ? await ensurePreviewProfile({ ...identity })
      : await recordUserSession({ ...identity, eventType: "login" });
    issueSessionCookie(response, session);
    response.json({ ok: true, profile, localProfileFallback: canUseLocalProfileFallback(), session: sessionClientState(session) });
  } catch (error) {
    await revokeSessionById(session.id);
    sendProfileStoreError(response, error);
  }
});

profileRoutes.get("/session", async (request, response) => {
  const session = await getRequestSession(request);
  if (!session) {
    // A page load without a session is an expected state, not an API failure.
    response.json({ ok: true, authenticated: false });
    return;
  }
  let profile: { email: string; displayName: string; avatarUrl: string } | null = canUseLocalProfileFallback()
    ? await getPreviewProfile(session.email) || await ensurePreviewProfile({ email: session.email, displayName: session.displayName, avatarUrl: session.avatarUrl, provider: session.provider })
    : null;
  if (!canUseLocalProfileFallback()) {
    try {
      profile = await getUserProfile(session.email, true);
    } catch {
      console.warn("[Auth] profile lookup unavailable", { requestId: response.locals.requestId, stage: "profile_session_lookup" });
    }
  }
  // A verified durable session remains valid even when optional profile
  // telemetry is temporarily unavailable. The client can refresh the profile
  // later without losing the authenticated session.
  profile ??= { email: session.email, displayName: session.displayName, avatarUrl: session.avatarUrl };
  response.json({ ok: true, authenticated: true, profile, session: sessionClientState(session) });
});

profileRoutes.delete("/session", requireCsrfForSession, async (request, response) => {
  await revokeRequestSession(request, response);
  response.json({ ok: true });
});

profileRoutes.get("/consent/document", requireActiveOnlineAccount, (_request, response) => {
  response.json({
    ok: true,
    policy: consentDocumentBundle,
  });
});

profileRoutes.post("/consent", requireActiveOnlineAccount, requireCsrfForSession, async (request, response) => {
  const accepted = request.body?.accepted === true;
  const language = request.body?.locale;
  const versionsAreCurrent = request.body?.termsVersion === currentTermsVersion
    && request.body?.privacyVersion === currentPrivacyVersion
    && request.body?.consentVersion === currentConsentVersion;
  if (!accepted || !versionsAreCurrent || (language !== "en" && language !== "hinglish" && language !== "hi")) {
    response.status(400).json({ ok: false, error: "CONSENT_REQUIRED", message: "Review and accept the Terms & Safety notice to continue." });
    return;
  }
  try {
    const session = await acceptTermsForRequest(
      request,
      currentTermsConsentVersion,
      language,
      String(response.locals.requestId ?? ""),
    );
    if (!session) {
      response.status(401).json({ ok: false, error: "AUTH_REQUIRED", message: "Sign in to record your consent." });
      return;
    }
    response.json({
      ok: true,
      termsVersion: currentTermsVersion,
      privacyVersion: currentPrivacyVersion,
      consentVersion: currentConsentVersion,
      aiDisclaimerVersion: currentAiDisclaimerVersion,
      dataProcessingVersion: currentDataProcessingVersion,
      cookiePreferencesVersion: currentCookiePreferencesVersion,
      consentedAt: session.consentedAt,
    });
  } catch (error) {
    if (error instanceof ConsentStoreError) {
      console.warn("[Consent] acceptance could not be stored", {
        requestId: response.locals.requestId,
        code: error.code,
        reason: error.reason,
      });
    }
    response.status(error instanceof ConsentStoreError ? 503 : 500).json({
      ok: false,
      error: "CONSENT_STORE_UNAVAILABLE",
      message: "Consent could not be recorded right now.",
      requestId: response.locals.requestId,
    });
  }
});

profileRoutes.get("/consent/history", requireActiveOnlineAccount, async (request, response) => {
  const session = await getRequestSession(request);
  if (!session?.subject) {
    response.status(401).json({ ok: false, error: "AUTH_REQUIRED", message: "Sign in to review consent history." });
    return;
  }
  try {
    const history = await consentService.history(session.subject);
    response.json({
      ok: true,
      current: {
        termsVersion: currentTermsVersion,
        privacyVersion: currentPrivacyVersion,
        consentVersion: currentConsentVersion,
        aiDisclaimerVersion: currentAiDisclaimerVersion,
        dataProcessingVersion: currentDataProcessingVersion,
        cookiePreferencesVersion: currentCookiePreferencesVersion,
      },
      events: history.map((event) => ({
        id: event.id,
        termsVersion: event.termsVersion,
        privacyVersion: event.privacyVersion,
        consentVersion: event.consentVersion,
        aiDisclaimerVersion: event.aiDisclaimerVersion,
        dataProcessingVersion: event.dataProcessingVersion,
        cookiePreferencesVersion: event.cookiePreferencesVersion,
        acceptedAt: event.acceptedAt,
        locale: event.locale,
        authenticationMethod: event.authenticationMethod,
        supersededAt: event.supersededAt,
      })),
      cookies: {
        essentialRequired: true,
        analyticsActive: false,
        marketingActive: false,
        optionalPersonalizationActive: false,
      },
    });
  } catch {
    response.status(503).json({
      ok: false,
      error: "CONSENT_STORE_UNAVAILABLE",
      message: "Consent history could not be loaded right now.",
      requestId: response.locals.requestId,
    });
  }
});

profileRoutes.post("/language", requireActiveOnlineAccount, requireCsrfForSession, async (request, response) => {
  const language = request.body?.language;
  if (language !== "en" && language !== "hinglish" && language !== "hi") {
    response.status(400).json({ ok: false, error: "INVALID_LANGUAGE", message: "Choose English, Hinglish, or Hindi." });
    return;
  }
  const session = await setSessionLanguageForRequest(request, language);
  if (!session) {
    response.status(401).json({ ok: false, error: "AUTH_REQUIRED", message: "Sign in to save your language preference." });
    return;
  }
  response.json({ ok: true, language: session.language });
});

profileRoutes.get("/status", requireActiveOnlineAccount, async (_request, response) => {
  const identity = getVerifiedUser(response);
  if (canUseLocalProfileFallback()) {
    response.json({ ok: true, profile: await getPreviewProfile(identity.email) || await ensurePreviewProfile(identity), localProfileFallback: true });
    return;
  }
  try {
    const profile = await getUserProfile(identity.email, true);
    if (!profile) {
      response.status(404).json({ ok: false, error: "Profile not found" });
      return;
    }
    response.json({ ok: true, profile });
  } catch (error) {
    if (canUseLocalProfileFallback()) {
      response.json({ ok: true, profile: await getPreviewProfile(identity.email) || await ensurePreviewProfile(identity), localProfileFallback: true });
      return;
    }
    sendProfileStoreError(response, error);
  }
});

profileRoutes.get("/plan-state", requireActiveOnlineAccount, async (_request, response) => {
  const identity = getVerifiedUser(response);
  const planState = response.locals.planState ?? await getPlanState(identity.email, response.locals.userProfile?.tier ?? "free");
  response.json({ ok: true, planState });
});

profileRoutes.get("/export", requireActiveOnlineAccount, requireAal2WhenMfaEnabled, async (_request, response) => {
  const identity = getVerifiedUser(response);
  const profile = canUseLocalProfileFallback()
    ? await getPreviewProfile(identity.email) || await ensurePreviewProfile(identity)
    : await getUserProfile(identity.email, true);
  const [cases, billing] = await Promise.all([
    listLatestCases(identity.email),
    getPlanStateWithTransactions(identity.email, response.locals.userProfile?.tier ?? "free", 100),
  ]);
  response.setHeader("Content-Disposition", `attachment; filename="legal-sathi-export-${new Date().toISOString().slice(0, 10)}.json"`);
  response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    profile,
    planState: billing.planState,
    unitTransactions: billing.transactions,
    cases,
    notice: "Payment and security records may be retained where legally or operationally required. Raw document assets are not embedded in this JSON export.",
  });
});

profileRoutes.post("/deletion-request", requireActiveOnlineAccount, requireCsrfForSession, requireAal2WhenMfaEnabled, async (_request, response) => {
  const identity = getVerifiedUser(response);
  try {
    const request = await createDataRightsRequest(identity.email, "deletion");
    response.status(202).json({
      ok: true,
      request: { id: request.id, status: request.status, requestedAt: request.requestedAt },
      message: "Your verified deletion request is pending review. Legally required payment and security records may be retained or anonymized.",
    });
  } catch {
    response.status(503).json({ ok: false, error: "DATA_RIGHTS_STORE_UNAVAILABLE", message: "The deletion request store is not configured on this environment." });
  }
});
