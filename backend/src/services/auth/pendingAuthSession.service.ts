import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Request, Response } from "express";
import { env } from "../../config/env";
import { AuthNextStep, ProviderAuthState } from "./supabasePrimaryAuth.service";

const pendingCookieName = "legal_sathi_auth_pending";
const pendingLifetimeMs = 10 * 60 * 1_000;

export type PendingAuthSession = {
  state: ProviderAuthState;
  next: Exclude<AuthNextStep, "complete">;
  csrfToken: string;
  expiresAt: number;
};

function encryptionKey() {
  if (env.sessionSecret.trim().length < 32) throw new Error("SESSION_NOT_CONFIGURED");
  return createHash("sha256").update(`legal-saathi-auth-pending:${env.sessionSecret}`).digest();
}

export function sealPendingAuthSession(payload: PendingAuthSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function openPendingAuthSession(value: string): PendingAuthSession | null {
  try {
    const [ivValue, tagValue, encryptedValue] = value.split(".");
    if (!ivValue || !tagValue || !encryptedValue) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as PendingAuthSession;
    if (!payload.state?.identity?.userId || payload.expiresAt <= Date.now()) return null;
    if (payload.next !== "password_setup" && payload.next !== "mfa_challenge") return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(request: Request) {
  const raw = request.header("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== pendingCookieName) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return "";
    }
  }
  return "";
}

export function issuePendingAuthSession(
  response: Response,
  state: ProviderAuthState,
  next: Exclude<AuthNextStep, "complete">,
) {
  const payload: PendingAuthSession = {
    state,
    next,
    csrfToken: randomBytes(32).toString("base64url"),
    expiresAt: Date.now() + pendingLifetimeMs,
  };
  response.cookie(pendingCookieName, sealPendingAuthSession(payload), {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: pendingLifetimeMs,
    path: "/",
  });
  return payload;
}

export function clearPendingAuthSession(response: Response) {
  response.clearCookie(pendingCookieName, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function readPendingAuthSession(request: Request) {
  return openPendingAuthSession(readCookie(request));
}

export function requirePendingAuthSession(request: Request) {
  const pending = readPendingAuthSession(request);
  if (!pending) return null;
  const provided = Buffer.from(request.header("x-csrf-token") ?? "");
  const expected = Buffer.from(pending.csrfToken);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return pending;
}
