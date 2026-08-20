import assert from "node:assert/strict";
import type { Session, User } from "@supabase/supabase-js";

import {
  type MfaAal,
  type MfaEnrollment,
  type MfaSessionTokens,
  type SupabaseMfaProviderClient,
  requiresAal2ForSensitiveAction,
  SupabaseMfaError,
  SupabaseMfaService,
} from "./supabaseMfa.service";

const tokens: MfaSessionTokens = {
  accessToken: "synthetic-access-token-for-tests",
  refreshToken: "synthetic-refresh-token-for-tests",
};
const owner = { email: "owner@example.test", subject: "user-owner" };

type FakeOptions = {
  userId?: string;
  email?: string;
  verifiedEmail?: boolean;
  currentLevel?: MfaAal;
  nextLevel?: MfaAal;
  factors?: Array<{ id: string; factor_type: "totp"; status: "verified" | "unverified"; friendly_name?: string }>;
  verificationSucceeds?: boolean;
  enrollmentDelayMs?: number;
};

class FakeProvider implements SupabaseMfaProviderClient {
  enrollCount = 0;
  readonly unenrolledFactorIds: string[] = [];
  private currentLevel: MfaAal;
  private factors: Array<{ id: string; factor_type: "totp"; status: "verified" | "unverified"; friendly_name?: string }>;
  private readonly options: FakeOptions;

  constructor(options: FakeOptions = {}) {
    this.options = options;
    this.currentLevel = options.currentLevel ?? "aal1";
    this.factors = options.factors ?? [];
  }

  async restoreSession(): Promise<{ session: Session; user: User }> {
    return {
      session: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: "bearer" as const,
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1_000) + 3600,
        user: {} as never,
      },
      user: {
        id: this.options.userId ?? "user-owner",
        email: this.options.email ?? "owner@example.test",
        email_confirmed_at: this.options.verifiedEmail === false ? undefined : new Date().toISOString(),
      } as never,
    };
  }

  async listFactors() {
    return this.factors.map((factor) => ({
      ...factor,
      friendly_name: factor.friendly_name ?? "Authenticator app",
      created_at: "2026-07-14T00:00:00.000Z",
      updated_at: "2026-07-14T00:00:00.000Z",
    }));
  }

  async getAuthenticatorAssuranceLevel() {
    return { currentLevel: this.currentLevel, nextLevel: this.options.nextLevel ?? (this.factors.some((factor) => factor.status === "verified") ? "aal2" : "aal1") };
  }

  async enrollTotp(): Promise<MfaEnrollment> {
    this.enrollCount += 1;
    if (this.options.enrollmentDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.options.enrollmentDelayMs));
    }
    this.factors.push({
      id: "11111111-1111-4111-8111-111111111111",
      factor_type: "totp",
      status: "unverified",
      friendly_name: "Legal Saathi Authenticator",
    });
    return {
      factorId: "11111111-1111-4111-8111-111111111111",
      qrCode: "data:image/svg+xml;utf-8,%3Csvg%3E%3C/svg%3E",
      secret: "SYNTHETICSECRET",
      uri: "otpauth://totp/Legal%20Saathi:synthetic",
    };
  }

  async challengeAndVerify(factorId: string, code: string) {
    if (this.options.verificationSucceeds === false || code !== "123456") {
      throw Object.assign(new Error("invalid code"), { status: 422 });
    }
    this.factors = this.factors.map((factor) => factor.id === factorId ? { ...factor, status: "verified" } : factor);
    this.currentLevel = "aal2";
  }

  async unenroll(factorId: string) {
    this.unenrolledFactorIds.push(factorId);
    this.factors = this.factors.filter((factor) => factor.id !== factorId);
    this.currentLevel = "aal1";
  }

  async currentSession(): Promise<Session> {
    return (await this.restoreSession()).session;
  }
}

async function rejectsCode(task: () => Promise<unknown>, code: SupabaseMfaError["code"]) {
  await assert.rejects(task, (error: unknown) => error instanceof SupabaseMfaError && error.code === code);
}

async function main() {
  let passed = 0;
  const check = (condition: unknown, label: string) => {
    assert.ok(condition, label);
    passed += 1;
  };

  const disabled = new SupabaseMfaService(() => new FakeProvider());
  const disabledStatus = await disabled.status(tokens, owner);
  check(disabledStatus.enabled === false && disabledStatus.currentLevel === "aal1", "account without factor remains AAL1");
  check(disabledStatus.recoveryCodesSupported === false, "service never advertises fake recovery codes");
  check(!requiresAal2ForSensitiveAction(disabledStatus), "sensitive actions remain available to accounts without an MFA factor");

  const enrollingProvider = new FakeProvider();
  const enrolling = new SupabaseMfaService(() => enrollingProvider);
  const enrollment = await enrolling.startEnrollment(tokens, owner);
  check(Boolean(enrollment.qrCode && enrollment.secret && enrollment.factorId), "official enrollment payload is returned once");
  const verified = await enrolling.verifyEnrollment(tokens, owner, enrollment.factorId, "123456");
  check(verified.status.enabled && verified.status.currentLevel === "aal2", "verified TOTP elevates the session to AAL2");
  check(!("recoveryCodes" in verified), "verification response contains no invented recovery codes");

  const challengeProvider = new FakeProvider({
    factors: [{ id: "22222222-2222-4222-8222-222222222222", factor_type: "totp", status: "verified" }],
    currentLevel: "aal1",
  });
  const challengeService = new SupabaseMfaService(() => challengeProvider);
  const needsChallenge = await challengeService.status(tokens, owner);
  check(needsChallenge.requiresChallenge, "verified factor at AAL1 requires a challenge");
  check(requiresAal2ForSensitiveAction(needsChallenge), "sensitive actions reject an MFA-enabled AAL1 session");
  const afterDisable = await challengeService.disableFactor(tokens, owner, needsChallenge.factors[0].id, "123456");
  check(!afterDisable.enabled, "disable requires a valid challenge and removes the owned factor");

  const cleanupProvider = new FakeProvider({
    factors: [
      { id: "44444444-4444-4444-8444-444444444444", factor_type: "totp", status: "unverified", friendly_name: "Legal Saathi authenticator" },
      { id: "55555555-5555-4555-8555-555555555555", factor_type: "totp", status: "unverified", friendly_name: "Another application" },
      { id: "66666666-6666-4666-8666-666666666666", factor_type: "totp", status: "verified", friendly_name: "Legal Saathi Authenticator" },
    ],
  });
  const cleanupService = new SupabaseMfaService(() => cleanupProvider);
  await cleanupService.startEnrollment(tokens, owner);
  check(cleanupProvider.unenrolledFactorIds.includes("44444444-4444-4444-8444-444444444444"), "stale Legal Saathi enrollment is removed before starting again");
  check(!cleanupProvider.unenrolledFactorIds.includes("55555555-5555-4555-8555-555555555555"), "unrelated unverified factors are not removed");
  check(!cleanupProvider.unenrolledFactorIds.includes("66666666-6666-4666-8666-666666666666"), "verified factors are never removed during enrollment cleanup");

  const concurrentProvider = new FakeProvider({ enrollmentDelayMs: 20 });
  const concurrentService = new SupabaseMfaService(() => concurrentProvider);
  const [firstEnrollment, secondEnrollment] = await Promise.all([
    concurrentService.startEnrollmentWithTokens(tokens, owner),
    concurrentService.startEnrollmentWithTokens(tokens, owner),
  ]);
  check(firstEnrollment.enrollment.factorId === secondEnrollment.enrollment.factorId, "concurrent enrollment clicks share one enrollment result");
  check(concurrentProvider.enrollCount === 1, "concurrent enrollment clicks create only one provider factor");

  await rejectsCode(
    () => new SupabaseMfaService(() => new FakeProvider({ userId: "other-user" })).status(tokens, owner),
    "MFA_IDENTITY_MISMATCH",
  );
  passed += 1;
  await rejectsCode(
    () => new SupabaseMfaService(() => new FakeProvider({ verifiedEmail: false })).status(tokens, owner),
    "MFA_EMAIL_NOT_VERIFIED",
  );
  passed += 1;
  await rejectsCode(
    () => new SupabaseMfaService(() => new FakeProvider()).status({ accessToken: "", refreshToken: "" }, owner),
    "MFA_SESSION_REQUIRED",
  );
  passed += 1;
  await rejectsCode(
    () => new SupabaseMfaService(() => new FakeProvider({ verificationSucceeds: false, factors: [{ id: "33333333-3333-4333-8333-333333333333", factor_type: "totp", status: "unverified" }] })).verifyEnrollment(tokens, owner, "33333333-3333-4333-8333-333333333333", "123456"),
    "MFA_CODE_INVALID",
  );
  passed += 1;

  process.stdout.write(`Supabase MFA/AAL2 focused tests passed: ${passed}/18\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Supabase MFA tests failed"}\n`);
  process.exitCode = 1;
});
