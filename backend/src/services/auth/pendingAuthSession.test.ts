import assert from "node:assert/strict";
import type { Request } from "express";

import { env } from "../../config/env";
import {
  openPendingAuthSession,
  readPendingAuthSession,
  requirePendingAuthSession,
  sealPendingAuthSession,
  type PendingAuthSession,
} from "./pendingAuthSession.service";

const originalSessionSecret = env.sessionSecret;
env.sessionSecret = "test-only-session-secret-with-at-least-thirty-two-characters";

try {
  const payload: PendingAuthSession = {
    state: {
      accessToken: "synthetic-access-token",
      refreshToken: "synthetic-refresh-token",
      expiresAt: Date.now() + 300_000,
      identity: {
        userId: "synthetic-user",
        email: "person@example.com",
        displayName: "Synthetic Person",
        avatarUrl: "",
        provider: "supabase",
      },
      passwordConfigured: false,
      hasVerifiedTotp: false,
      currentAal: "aal1",
      nextAal: "aal1",
      authMethod: "email_otp",
    },
    next: "password_setup",
    csrfToken: "synthetic-csrf-token",
    expiresAt: Date.now() + 300_000,
  };

  const sealed = sealPendingAuthSession(payload);
  assert.equal(sealed.includes(payload.state.accessToken), false);
  assert.deepEqual(openPendingAuthSession(sealed), payload);
  assert.equal(openPendingAuthSession(`${sealed}tampered`), null);

  const requestFor = (csrfToken: string) => ({
    header(name: string) {
      if (name.toLowerCase() === "cookie") return `legal_sathi_auth_pending=${encodeURIComponent(sealed)}`;
      if (name.toLowerCase() === "x-csrf-token") return csrfToken;
      return undefined;
    },
  }) as Request;

  assert.deepEqual(readPendingAuthSession(requestFor("")), payload);
  assert.deepEqual(requirePendingAuthSession(requestFor(payload.csrfToken)), payload);
  assert.equal(requirePendingAuthSession(requestFor("wrong-csrf-token")), null);

  const expired = sealPendingAuthSession({ ...payload, expiresAt: Date.now() - 1 });
  assert.equal(openPendingAuthSession(expired), null);
} finally {
  env.sessionSecret = originalSessionSecret;
}

console.log("Legal Saathi pending-auth session tests passed.");
