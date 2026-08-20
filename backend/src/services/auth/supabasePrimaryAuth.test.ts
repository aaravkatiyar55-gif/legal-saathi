import assert from "node:assert/strict";
import { env } from "../../config/env";
import {
  applicationSessionProvider,
  buildGoogleIdTokenCredentials,
  classifyEmailStartFailure,
  classifyGoogleFailure,
  decideNextStep,
  PrimaryAuthError,
  PrimaryAuthProvider,
  PrimaryAuthService,
  ProviderAuthState,
  validateEmail,
  validateOtp,
  validatePassword,
} from "./supabasePrimaryAuth.service";
import { clearPendingAuthSession, issuePendingAuthSession, openPendingAuthSession, sealPendingAuthSession } from "./pendingAuthSession.service";

function state(overrides: Partial<ProviderAuthState> = {}): ProviderAuthState {
  return {
    accessToken: "synthetic-access-token",
    refreshToken: "synthetic-refresh-token",
    expiresAt: Math.floor(Date.now() / 1_000) + 600,
    identity: {
      userId: "00000000-0000-4000-8000-000000000001",
      email: "verified@example.test",
      displayName: "Verified User",
      avatarUrl: "",
      provider: "supabase",
    },
    passwordConfigured: true,
    hasVerifiedTotp: false,
    currentAal: "aal1",
    nextAal: "aal1",
    authMethod: "password",
    ...overrides,
  };
}

class FakeProvider implements PrimaryAuthProvider {
  startedEmail = "";
  recoveryEmail = "";
  createPasswordCalls = 0;
  challengeCalls = 0;
  googleNonce = "";
  nextState = state();

  async startEmailOtp(email: string) { this.startedEmail = email; }
  async startPasswordRecovery(email: string) { this.recoveryEmail = email; }
  async verifyEmailOtp() { return this.nextState; }
  async signInWithPassword() { return this.nextState; }
  async signInWithGoogleIdToken(_idToken: string, nonce: string) {
    this.googleNonce = nonce;
    return this.nextState;
  }
  async createPassword(input: ProviderAuthState) {
    this.createPasswordCalls += 1;
    return { ...input, passwordConfigured: true };
  }
  async challengeTotp(input: ProviderAuthState) {
    this.challengeCalls += 1;
    return { ...input, currentAal: "aal2" as const, nextAal: "aal2" as const };
  }
}

async function main() {
assert.equal(validateEmail("  USER@Example.Test "), "user@example.test");
assert.equal(validateOtp(" 123456 "), "123456");
assert.equal(validatePassword("StrongPassword!42", "StrongPassword!42"), "StrongPassword!42");
assert.throws(() => validateEmail("not-an-email"), PrimaryAuthError);
assert.throws(() => validateOtp("12345"), PrimaryAuthError);
assert.throws(() => validatePassword("short", "short"), PrimaryAuthError);
assert.throws(() => validatePassword("StrongPassword!42", "DifferentPassword!42"), PrimaryAuthError);

assert.equal(classifyEmailStartFailure({ status: 429, code: "over_email_send_rate_limit" }).code, "EMAIL_RATE_LIMITED");
assert.equal(classifyEmailStartFailure({ status: 500, code: "unexpected_failure" }).code, "EMAIL_SEND_FAILED");
assert.equal(classifyEmailStartFailure({ status: 503, name: "AuthRetryableFetchError" }).code, "EMAIL_PROVIDER_UNAVAILABLE");
assert.equal(classifyEmailStartFailure({ status: 500, message: "SMTP auth failed" }).code, "SMTP_AUTH_FAILED");
assert.equal(classifyGoogleFailure({ status: 400, message: "Unacceptable audience in id_token" }).diagnosticCategory, "audience_mismatch");
assert.equal(classifyGoogleFailure({ status: 400, message: "Nonce mismatch" }).diagnosticCategory, "nonce_mismatch");
assert.equal(classifyGoogleFailure({ status: 400, message: "Identity already linked" }).diagnosticCategory, "identity_conflict");
assert.equal(classifyGoogleFailure({ status: 401, message: "Token rejected" }).diagnosticCategory, "token_rejected");
assert.equal(classifyGoogleFailure({ status: 503, message: "Service unavailable" }).code, "AUTH_PROVIDER_UNAVAILABLE");
assert.equal(classifyGoogleFailure({ status: 400, message: "Client ID does not match token audience" }).diagnosticCategory, "audience_mismatch");
const googleNonce = "n".repeat(43);
assert.deepEqual(
  buildGoogleIdTokenCredentials("synthetic-google-id-token", googleNonce),
  {
    provider: "google",
    token: "synthetic-google-id-token",
    nonce: googleNonce,
  },
);
assert.throws(
  () => buildGoogleIdTokenCredentials("synthetic-google-id-token", ""),
  (error: unknown) => error instanceof PrimaryAuthError && error.diagnosticCategory === "nonce_invalid",
);
assert.equal(applicationSessionProvider("google"), "google");
assert.equal(applicationSessionProvider("email_otp"), "supabase");
assert.equal(applicationSessionProvider("password"), "supabase");

assert.equal(decideNextStep(state({ authMethod: "email_otp", passwordConfigured: false })), "password_setup");
assert.equal(decideNextStep(state({ authMethod: "email_otp", passwordConfigured: false, hasVerifiedTotp: true, currentAal: "aal1", nextAal: "aal2" })), "mfa_challenge");
assert.equal(decideNextStep(state({ hasVerifiedTotp: true, currentAal: "aal1", nextAal: "aal2" })), "mfa_challenge");
assert.equal(decideNextStep(state({ hasVerifiedTotp: true, currentAal: "aal2", nextAal: "aal2" })), "complete");

const provider = new FakeProvider();
const service = new PrimaryAuthService(provider);

await service.startEmailOtp("verified@example.test");
assert.equal(provider.startedEmail, "verified@example.test");

provider.nextState = state({ authMethod: "email_otp", passwordConfigured: false });
const otpDecision = await service.verifyEmailOtp("verified@example.test", "123456");
assert.equal(otpDecision.next, "password_setup");

const passwordDecision = await service.createPassword(otpDecision.state, "StrongPassword!42", "StrongPassword!42");
assert.equal(provider.createPasswordCalls, 1);
assert.equal(passwordDecision.next, "complete");

provider.nextState = state({ hasVerifiedTotp: true, currentAal: "aal1", nextAal: "aal2", authMethod: "google" });
const googleDecision = await service.signInWithGoogleIdToken("synthetic-google-id-token", googleNonce);
assert.equal(provider.googleNonce, googleNonce);
assert.equal(googleDecision.next, "mfa_challenge");
const mfaDecision = await service.challengeTotp(googleDecision.state, "123456");
assert.equal(provider.challengeCalls, 1);
assert.equal(mfaDecision.next, "complete");
assert.equal(mfaDecision.state.identity.userId, "00000000-0000-4000-8000-000000000001");

await service.startPasswordRecovery("recovery@example.test");
assert.equal(provider.recoveryEmail, "recovery@example.test");
provider.nextState = state({ authMethod: "email_otp", passwordConfigured: true });
const recoveryDecision = await service.verifyPasswordRecovery("recovery@example.test", "123456");
assert.equal(recoveryDecision.next, "password_setup");
assert.equal(recoveryDecision.state.passwordConfigured, false);

provider.nextState = state({ authMethod: "email_otp", passwordConfigured: true, hasVerifiedTotp: true, currentAal: "aal1", nextAal: "aal2" });
const protectedRecovery = await service.verifyPasswordRecovery("recovery@example.test", "123456");
assert.equal(protectedRecovery.next, "mfa_challenge");
const protectedRecoveryAfterMfa = await service.challengeTotp(protectedRecovery.state, "123456");
assert.equal(protectedRecoveryAfterMfa.next, "password_setup");

const originalSessionSecret = env.sessionSecret;
env.sessionSecret = "synthetic-session-secret-for-auth-tests-only-123456789";
try {
  const pending = {
    state: state({ authMethod: "email_otp", passwordConfigured: false }),
    next: "password_setup" as const,
    csrfToken: "synthetic-csrf-token",
    expiresAt: Date.now() + 60_000,
  };
  const sealed = sealPendingAuthSession(pending);
  assert.equal(sealed.includes(pending.state.accessToken), false);
  assert.equal(sealed.includes(pending.state.refreshToken), false);
  const opened = openPendingAuthSession(sealed);
  assert.equal(opened?.state.identity.userId, pending.state.identity.userId);
  assert.equal(opened?.next, "password_setup");
  assert.equal(openPendingAuthSession(`${sealed}tampered`), null);

  const cookieOptions: Array<{ action: "set" | "clear"; path?: string }> = [];
  const response = {
    cookie: (_name: string, _value: string, options: { path?: string }) => cookieOptions.push({ action: "set", path: options.path }),
    clearCookie: (_name: string, options: { path?: string }) => cookieOptions.push({ action: "clear", path: options.path }),
  };
  issuePendingAuthSession(response as never, pending.state, "password_setup");
  clearPendingAuthSession(response as never);
  assert.deepEqual(cookieOptions, [
    { action: "set", path: "/" },
    { action: "clear", path: "/" },
  ]);
} finally {
  env.sessionSecret = originalSessionSecret;
}

console.log("Supabase primary auth OTP/password recovery/Google decisions, email error classification, final-AAL gate, validation, stable identity, and encrypted pending state: PASS");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Auth test failed");
  process.exitCode = 1;
});
