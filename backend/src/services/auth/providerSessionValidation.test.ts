import assert from "node:assert/strict";
import { createProviderSessionValidator } from "./providerSessionValidation.service";

async function run() {
  const expected = { subject: "user-1", email: "owner@example.test" };
  const tokens = { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: 1 };

const validateSuccess = createProviderSessionValidator({
  supabaseUrl: "https://example.supabase.test",
  publishableKey: "synthetic-public-key",
  fetchImpl: async () => new Response(JSON.stringify({
    access_token: "new-access",
    refresh_token: "new-refresh",
    expires_in: 600,
    user: { id: expected.subject, email: expected.email, email_confirmed_at: "2026-07-22T00:00:00Z" },
  }), { status: 200, headers: { "Content-Type": "application/json" } }),
});
  assert.equal((await validateSuccess(tokens, expected)).status, "valid");

const validateRevoked = createProviderSessionValidator({
  supabaseUrl: "https://example.supabase.test",
  publishableKey: "synthetic-public-key",
  fetchImpl: async () => new Response("{}", { status: 401 }),
});
  assert.equal((await validateRevoked(tokens, expected)).status, "invalid");

const validateMismatch = createProviderSessionValidator({
  supabaseUrl: "https://example.supabase.test",
  publishableKey: "synthetic-public-key",
  fetchImpl: async () => new Response(JSON.stringify({
    access_token: "new-access",
    refresh_token: "new-refresh",
    expires_in: 600,
    user: { id: "other-user", email: expected.email, email_confirmed_at: "2026-07-22T00:00:00Z" },
  }), { status: 200, headers: { "Content-Type": "application/json" } }),
});
  assert.equal((await validateMismatch(tokens, expected)).status, "invalid");

const validateUnavailable = createProviderSessionValidator({
  supabaseUrl: "https://example.supabase.test",
  publishableKey: "synthetic-public-key",
  fetchImpl: async () => new Response("{}", { status: 503 }),
});
  assert.equal((await validateUnavailable(tokens, expected)).status, "unavailable");

  console.log("Provider session refresh/revocation validation: PASS 4/4");
}

void run();
