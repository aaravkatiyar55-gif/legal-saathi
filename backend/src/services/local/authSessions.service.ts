import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Request, Response } from "express";
import { env } from "../../config/env";
import {
  ConsentStoreError,
  consentService,
  currentAiDisclaimerVersion,
  currentConsentVersion,
  currentCookiePreferencesVersion,
  currentDataProcessingVersion,
  currentPrivacyVersion,
  currentTermsConsentVersion,
  currentTermsVersion,
} from "../consent/consent.service";
import { getSessionStore, hashSessionToken, SessionRecord } from "../sessions/sessionStore.service";
import { validateProviderSession, type ProviderSessionTokens } from "../auth/providerSessionValidation.service";

export type SessionIdentity = {
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: "google" | "development" | "supabase";
  subject?: string;
};

export type SessionLanguage = "en" | "hinglish" | "hi";

export type LocalSession = SessionIdentity & {
  id: string;
  csrfToken: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  consentVersion: string | null;
  consentedAt: string | null;
  language: SessionLanguage;
  providerSessionSealed?: string;
  reauthenticatedAt?: string;
};

export type { ProviderSessionTokens } from "../auth/providerSessionValidation.service";

const cookieName = "legal_sathi_session";
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const providerValidationIntervalMs = 5 * 60 * 1_000;
const providerValidationCache = new Map<string, number>();
const providerValidationInFlight = new Map<string, Promise<SessionRecord | null>>();
export {
  currentConsentVersion,
  currentAiDisclaimerVersion,
  currentCookiePreferencesVersion,
  currentDataProcessingVersion,
  currentPrivacyVersion,
  currentTermsConsentVersion,
  currentTermsVersion,
} from "../consent/consent.service";

function requireSessionSecret() {
  if (env.sessionSecret.trim().length < 32) {
    throw new Error("SESSION_NOT_CONFIGURED");
  }
  return env.sessionSecret;
}

function sign(sessionId: string) {
  return createHmac("sha256", requireSessionSecret()).update(sessionId).digest("base64url");
}

function providerSessionKey() {
  return createHash("sha256").update(`legal-saathi-provider-session:${requireSessionSecret()}`).digest();
}

function sealProviderSession(tokens: ProviderSessionTokens) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", providerSessionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function openProviderSession(value?: string): ProviderSessionTokens | null {
  if (!value) return null;
  try {
    const [ivValue, tagValue, encryptedValue] = value.split(".");
    if (!ivValue || !tagValue || !encryptedValue) return null;
    const decipher = createDecipheriv("aes-256-gcm", providerSessionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const parsed = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8")) as Partial<ProviderSessionTokens>;
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string" || typeof parsed.expiresAt !== "number") return null;
    if (!parsed.accessToken || !parsed.refreshToken || parsed.accessToken.length > 16_384 || parsed.refreshToken.length > 16_384) return null;
    return parsed as ProviderSessionTokens;
  } catch {
    return null;
  }
}

function readCookies(request: Request) {
  const raw = request.header("cookie") ?? "";
  return Object.fromEntries(
    raw.split(";").map((item) => {
      const index = item.indexOf("=");
      if (index < 0) return [item.trim(), ""];
      const rawValue = item.slice(index + 1).trim();
      try {
        return [item.slice(0, index).trim(), decodeURIComponent(rawValue)];
      } catch {
        return [item.slice(0, index).trim(), ""];
      }
    }),
  );
}

function readCookieSessionId(request: Request) {
  const value = readCookies(request)[cookieName] ?? "";
  const [sessionId, signature] = value.split(".");
  if (!sessionId || !signature) return "";
  const expected = sign(sessionId);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return "";
  return sessionId;
}

function toRecord(session: LocalSession): SessionRecord {
  const { id: _discarded, ...record } = session;
  return record;
}

export function isSessionConfigured() {
  return env.sessionSecret.trim().length >= 32 && (env.sessionStoreBackend === "supabase" || (env.nodeEnv !== "production" && env.sessionStoreBackend === "local"));
}

async function latestConsentForSession(subject?: string) {
  if (!subject) return null;
  try {
    return await consentService.latestCurrent(subject);
  } catch (error) {
    if (
      env.nodeEnv !== "production"
      && env.sessionStoreBackend === "local"
      && error instanceof ConsentStoreError
      && error.code === "CONSENT_STORE_NOT_CONFIGURED"
    ) {
      return null;
    }
    throw error;
  }
}

export async function createLocalSession(identity: SessionIdentity, providerSession?: ProviderSessionTokens) {
  requireSessionSecret();
  const now = new Date();
  const subject = identity.subject ?? (identity.provider === "development"
    ? `development:${createHash("sha256").update(identity.email.trim().toLowerCase()).digest("hex")}`
    : undefined);
  const previousConsent = await latestConsentForSession(subject);
  const acceptedCurrentConsent = Boolean(previousConsent);
  const session: LocalSession = {
    ...identity,
    subject,
    id: randomBytes(32).toString("base64url"),
    csrfToken: randomBytes(32).toString("base64url"),
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + sessionLifetimeMs).toISOString(),
    revokedAt: null,
    consentVersion: acceptedCurrentConsent ? currentTermsConsentVersion : null,
    consentedAt: acceptedCurrentConsent ? previousConsent?.acceptedAt ?? null : null,
    language: acceptedCurrentConsent ? previousConsent?.locale ?? "en" : "en",
    providerSessionSealed: providerSession ? sealProviderSession(providerSession) : undefined,
    reauthenticatedAt: now.toISOString(),
  };
  const tokenHash = hashSessionToken(session.id);
  await getSessionStore().create(tokenHash, toRecord(session));
  if (providerSession) providerValidationCache.set(tokenHash, Date.now());
  return session;
}

export function isProviderBackedSession(provider: SessionIdentity["provider"]) {
  return provider === "google" || provider === "supabase";
}

async function validateProviderBackedRecord(tokenHash: string, record: SessionRecord) {
  if (!isProviderBackedSession(record.provider)) return record;
  if ((providerValidationCache.get(tokenHash) ?? 0) + providerValidationIntervalMs > Date.now()) return record;
  const existing = providerValidationInFlight.get(tokenHash);
  if (existing) return existing;

  const task = (async () => {
    const tokens = openProviderSession(record.providerSessionSealed);
    if (!tokens) {
      record.revokedAt = new Date().toISOString();
      await getSessionStore().update(tokenHash, record);
      return null;
    }
    const validation = await validateProviderSession(tokens, { subject: record.subject, email: record.email });
    if (validation.status === "unavailable") return null;
    const current = await getSessionStore().get(tokenHash);
    if (!current || current.revokedAt || new Date(current.expiresAt).getTime() <= Date.now()) return null;
    if (validation.status === "invalid") {
      current.revokedAt = new Date().toISOString();
      await getSessionStore().update(tokenHash, current);
      providerValidationCache.delete(tokenHash);
      return null;
    }
    current.providerSessionSealed = sealProviderSession(validation.tokens);
    current.lastSeenAt = new Date().toISOString();
    await getSessionStore().update(tokenHash, current);
    if (providerValidationCache.size > 10_000) providerValidationCache.clear();
    providerValidationCache.set(tokenHash, Date.now());
    return current;
  })().finally(() => providerValidationInFlight.delete(tokenHash));
  providerValidationInFlight.set(tokenHash, task);
  return task;
}

export async function getRequestProviderSession(request: Request) {
  const session = await getRequestSession(request);
  if (!session || !isProviderBackedSession(session.provider)) return null;
  return openProviderSession(session.providerSessionSealed);
}

export async function updateRequestProviderSession(request: Request, tokens: ProviderSessionTokens) {
  const sessionId = readCookieSessionId(request);
  if (!sessionId) return false;
  const tokenHash = hashSessionToken(sessionId);
  const record = await getSessionStore().get(tokenHash);
  if (!record || record.revokedAt || !isProviderBackedSession(record.provider)) return false;
  record.providerSessionSealed = sealProviderSession(tokens);
  record.lastSeenAt = new Date().toISOString();
  await getSessionStore().update(tokenHash, record);
  providerValidationCache.set(tokenHash, Date.now());
  return true;
}

export async function markRequestSessionReauthenticated(request: Request) {
  const sessionId = readCookieSessionId(request);
  if (!sessionId) return false;
  const tokenHash = hashSessionToken(sessionId);
  const record = await getSessionStore().get(tokenHash);
  if (!record || record.revokedAt || new Date(record.expiresAt).getTime() <= Date.now()) return false;
  record.reauthenticatedAt = new Date().toISOString();
  record.lastSeenAt = record.reauthenticatedAt;
  await getSessionStore().update(tokenHash, record);
  return true;
}

export async function hasRecentRequestReauthentication(request: Request, maxAgeMs = 10 * 60 * 1_000) {
  const session = await getRequestSession(request);
  if (!session?.reauthenticatedAt) return false;
  const reauthenticatedAt = new Date(session.reauthenticatedAt).getTime();
  return Number.isFinite(reauthenticatedAt) && Date.now() - reauthenticatedAt <= maxAgeMs;
}

export async function getRequestSession(request: Request) {
  if (!isSessionConfigured()) return null;
  const sessionId = readCookieSessionId(request);
  if (!sessionId) return null;
  const tokenHash = hashSessionToken(sessionId);
  let record = await getSessionStore().get(tokenHash);
  if (!record || record.revokedAt || new Date(record.expiresAt).getTime() <= Date.now()) return null;
  record = await validateProviderBackedRecord(tokenHash, record);
  if (!record) return null;
  const session: LocalSession = { ...record, id: sessionId };
  if (Date.now() - new Date(session.lastSeenAt).getTime() >= 60_000) {
    session.lastSeenAt = new Date().toISOString();
    await getSessionStore().update(tokenHash, toRecord(session));
  }
  return session;
}

export function issueSessionCookie(response: Response, session: LocalSession) {
  response.cookie(cookieName, `${session.id}.${sign(session.id)}`, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: sessionLifetimeMs,
    path: "/",
  });
}

export async function revokeRequestSession(request: Request, response: Response) {
  const sessionId = readCookieSessionId(request);
  if (sessionId) {
    await revokeSessionById(sessionId);
  }
  response.clearCookie(cookieName, { httpOnly: true, secure: env.nodeEnv === "production", sameSite: "lax", path: "/" });
}

export async function revokeSessionById(sessionId: string) {
  const tokenHash = hashSessionToken(sessionId);
  const record = await getSessionStore().get(tokenHash);
  if (!record || record.revokedAt) return false;
  record.revokedAt = new Date().toISOString();
  await getSessionStore().update(tokenHash, record);
  providerValidationCache.delete(tokenHash);
  return true;
}

export async function revokeSessionsForSubject(subject: string, exceptSessionId?: string) {
  if (!subject) return;
  const exceptTokenHash = exceptSessionId ? hashSessionToken(exceptSessionId) : undefined;
  await getSessionStore().revokeForSubject(subject, new Date().toISOString(), exceptTokenHash);
  providerValidationCache.clear();
}

export async function revokeOtherSessionsForRequest(request: Request) {
  const sessionId = readCookieSessionId(request);
  if (!sessionId) return false;
  const record = await getSessionStore().get(hashSessionToken(sessionId));
  if (!record?.subject || record.revokedAt) return false;
  await revokeSessionsForSubject(record.subject, sessionId);
  return true;
}

export async function acceptTermsForRequest(
  request: Request,
  consentVersion: string,
  language: SessionLanguage,
  requestId: string,
) {
  const sessionId = readCookieSessionId(request);
  if (!sessionId) return null;
  const tokenHash = hashSessionToken(sessionId);
  const record = await getSessionStore().get(tokenHash);
  if (
    !record
    || !record.subject
    || record.revokedAt
    || new Date(record.expiresAt).getTime() <= Date.now()
    || consentVersion !== currentTermsConsentVersion
  ) return null;
  const userAgent = String(request.get("user-agent") ?? "").trim();
  const safeRequestId = /^[A-Za-z0-9_-]{8,120}$/.test(requestId) ? requestId : "consent-request";
  const accepted = await consentService.accept({
    subject: record.subject,
    locale: language,
    authenticationMethod: record.provider === "google" ? "google" : "supabase",
    authenticationSessionReference: tokenHash,
    normalizedEmail: record.email.trim().toLowerCase(),
    requestId: safeRequestId,
    userAgentMetadata: {
      present: Boolean(userAgent),
      length: Math.min(userAgent.length, 2_000),
      sha256: userAgent ? createHash("sha256").update(userAgent).digest("hex") : "",
    },
  });
  record.consentVersion = consentVersion;
  record.consentedAt = accepted.acceptedAt;
  record.language = language;
  await getSessionStore().update(tokenHash, record);
  return { ...record, id: sessionId };
}

export async function setSessionLanguageForRequest(request: Request, language: SessionLanguage) {
  const sessionId = readCookieSessionId(request);
  if (!sessionId) return null;
  const tokenHash = hashSessionToken(sessionId);
  const record = await getSessionStore().get(tokenHash);
  if (!record || record.revokedAt || new Date(record.expiresAt).getTime() <= Date.now()) return null;
  record.language = language;
  await getSessionStore().update(tokenHash, record);
  return { ...record, id: sessionId };
}

export async function requireSessionCsrf(request: Request) {
  const session = await getRequestSession(request);
  // A bearer Google credential is used only to establish a session, before a
  // cookie exists. Every subsequent cookie-authenticated write requires CSRF.
  if (!session) return true;
  const provided = request.header("x-csrf-token") ?? "";
  const expected = Buffer.from(session.csrfToken);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sessionPublicState(session: LocalSession) {
  const acceptedCurrent = session.consentVersion === currentTermsConsentVersion && Boolean(session.consentedAt);
  return {
    provider: session.provider,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
    termsVersion: acceptedCurrent ? currentTermsVersion : null,
    privacyVersion: acceptedCurrent ? currentPrivacyVersion : null,
    consentVersion: acceptedCurrent ? currentConsentVersion : null,
    consentedAt: session.consentedAt,
    requiredTermsVersion: currentTermsVersion,
    requiredPrivacyVersion: currentPrivacyVersion,
    requiredConsentVersion: currentConsentVersion,
    requiredAiDisclaimerVersion: currentAiDisclaimerVersion,
    requiredDataProcessingVersion: currentDataProcessingVersion,
    requiredCookiePreferencesVersion: currentCookiePreferencesVersion,
    acceptedCurrent,
    language: session.language,
  };
}
