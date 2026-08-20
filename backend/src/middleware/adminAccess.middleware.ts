import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { getRequestSession, type LocalSession } from "../services/local/authSessions.service";
import { isAuthorizedAdminEmail, normalizeAdminEmail } from "../security/adminIdentity";

type AdminSessionPayload = { scope: "admin"; email: string; exp: number; nonce: string; sid?: string };
const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", env.adminSessionSecret).update(encodedPayload).digest("base64url");
}

export function isAdminSecurityConfigured() {
  const signingConfigured = env.adminSessionSecret.trim().length >= 32;
  return Boolean(signingConfigured && (env.nodeEnv !== "production" || env.googleClientId.trim()));
}

export function createAdminSessionForIdentity(identity: LocalSession) {
  if (!isAdminSecurityConfigured()) throw new Error("ADMIN_NOT_CONFIGURED");
  if (
    !isAuthorizedAdminEmail(identity.email)
    || (env.nodeEnv === "production" && identity.provider !== "google")
  ) {
    throw new Error("ADMIN_ACCESS_DENIED");
  }
  const payload: AdminSessionPayload = {
    scope: "admin",
    email: normalizeAdminEmail(identity.email),
    exp: Date.now() + ADMIN_SESSION_TTL_MS,
    nonce: randomBytes(16).toString("base64url"),
    sid: identity.id,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { token: `${encodedPayload}.${signPayload(encodedPayload)}`, expiresAt: new Date(payload.exp).toISOString() };
}

function readAdminToken(request: Request) {
  return (request.header("authorization") ?? "").match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? "";
}

export function verifyAdminSession(request: Request): AdminSessionPayload | null {
  if (!isAdminSecurityConfigured()) return null;
  const [encodedPayload, signature, extra] = readAdminToken(request).split(".");
  if (!encodedPayload || !signature || extra || !safeEqual(signature, signPayload(encodedPayload))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AdminSessionPayload;
    if (
      payload.scope !== "admin"
      || !isAuthorizedAdminEmail(payload.email)
      || !Number.isFinite(payload.exp)
      || payload.exp <= Date.now()
    ) return null;
    payload.email = normalizeAdminEmail(payload.email);
    return payload;
  } catch {
    return null;
  }
}

export async function requireAdminAccess(request: Request, response: Response, next: NextFunction) {
  if (!isAdminSecurityConfigured()) {
    response.status(503).json({ ok: false, error: "Admin security is not configured" });
    return;
  }
  const admin = verifyAdminSession(request);
  if (!admin) {
    response.status(401).json({ ok: false, error: "Valid admin session is required" });
    return;
  }
  let session: LocalSession | null = null;
  try {
    session = await getRequestSession(request);
  } catch {
    session = null;
  }
  if (
    !session
    || !isAuthorizedAdminEmail(session.email)
    || (env.nodeEnv === "production" && session.provider !== "google")
    || !admin.sid
    || !safeEqual(admin.sid, session.id)
    || !safeEqual(admin.email, normalizeAdminEmail(session.email))
  ) {
    response.status(401).json({ ok: false, error: "Valid admin session is required" });
    return;
  }
  response.locals.admin = admin;
  next();
}

export function hasTemporaryAdminAccess(request: Request) {
  return Boolean(verifyAdminSession(request));
}

export const requireTemporaryAdminAccess = requireAdminAccess;

export function getAdminIdentity(response: Response) {
  return String(response.locals.admin?.email ?? "admin");
}
