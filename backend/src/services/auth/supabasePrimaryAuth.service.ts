import { createClient, Session, SupabaseClient, User } from "@supabase/supabase-js";
import { env } from "../../config/env";
import { getSupabaseClient } from "../supabase/supabaseClient";

export type AuthMethod = "email_otp" | "password" | "google";
export type AuthNextStep = "complete" | "password_setup" | "mfa_challenge";

export function applicationSessionProvider(authMethod: AuthMethod) {
  return authMethod === "google" ? "google" as const : "supabase" as const;
}

export type VerifiedSupabaseIdentity = {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: "supabase";
};

export type ProviderAuthState = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  identity: VerifiedSupabaseIdentity;
  passwordConfigured: boolean;
  hasVerifiedTotp: boolean;
  currentAal: "aal1" | "aal2" | null;
  nextAal: "aal1" | "aal2" | null;
  authMethod: AuthMethod;
};

export type AuthFlowDecision = {
  next: AuthNextStep;
  state: ProviderAuthState;
};

export class PrimaryAuthError extends Error {
  constructor(
    readonly code:
      | "AUTH_NOT_CONFIGURED"
      | "AUTH_EMAIL_INVALID"
      | "AUTH_OTP_INVALID"
      | "AUTH_CREDENTIALS_INVALID"
      | "AUTH_GOOGLE_INVALID"
      | "AUTH_EMAIL_NOT_VERIFIED"
      | "AUTH_PASSWORD_WEAK"
      | "AUTH_PASSWORD_MISMATCH"
      | "AUTH_PENDING_SESSION_INVALID"
      | "AUTH_MFA_REQUIRED"
      | "AUTH_MFA_INVALID"
      | "AUTH_GOOGLE_PROVIDER_DISABLED"
      | "EMAIL_RATE_LIMITED"
      | "SMTP_AUTH_FAILED"
      | "EMAIL_PROVIDER_UNAVAILABLE"
      | "EMAIL_SEND_FAILED"
      | "AUTH_PROVIDER_UNAVAILABLE",
    readonly status: number,
    readonly diagnosticCategory?: string,
  ) {
    super(code);
    this.name = "PrimaryAuthError";
  }
}

export interface PrimaryAuthProvider {
  startEmailOtp(email: string): Promise<void>;
  startPasswordRecovery(email: string): Promise<void>;
  verifyEmailOtp(email: string, otp: string): Promise<ProviderAuthState>;
  signInWithPassword(email: string, password: string): Promise<ProviderAuthState>;
  signInWithGoogleIdToken(idToken: string, nonce: string): Promise<ProviderAuthState>;
  createPassword(state: ProviderAuthState, password: string): Promise<ProviderAuthState>;
  challengeTotp(state: ProviderAuthState, code: string): Promise<ProviderAuthState>;
}

export function buildGoogleIdTokenCredentials(idToken: string, nonce: string) {
  if (!idToken || idToken.length > 8_192) {
    throw new PrimaryAuthError("AUTH_GOOGLE_INVALID", 401, "credential_missing");
  }
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(nonce)) {
    throw new PrimaryAuthError("AUTH_GOOGLE_INVALID", 401, "nonce_invalid");
  }
  return {
    provider: "google" as const,
    token: idToken,
    nonce,
  };
}

const commonPasswords = new Set([
  "password123!",
  "password@123",
  "qwerty123456",
  "legal123456!",
  "welcome12345!",
]);

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string) {
  const email = normalizeEmail(value);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PrimaryAuthError("AUTH_EMAIL_INVALID", 400);
  }
  return email;
}

export function validateOtp(value: string) {
  const otp = value.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(otp)) throw new PrimaryAuthError("AUTH_OTP_INVALID", 400);
  return otp;
}

export function validatePassword(password: string, confirmation: string) {
  if (password !== confirmation) throw new PrimaryAuthError("AUTH_PASSWORD_MISMATCH", 400);
  const weak =
    password.length < 12 ||
    password.length > 128 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password) ||
    commonPasswords.has(password.toLowerCase());
  if (weak) throw new PrimaryAuthError("AUTH_PASSWORD_WEAK", 400);
  return password;
}

export function decideNextStep(state: ProviderAuthState): AuthNextStep {
  if (state.hasVerifiedTotp && state.currentAal !== "aal2") return "mfa_challenge";
  if (state.authMethod === "email_otp" && !state.passwordConfigured) return "password_setup";
  return "complete";
}

function readPublishableKey() {
  return env.supabasePublishableKey.trim();
}

let googleProviderStatusCache: { enabled: boolean; expiresAt: number } | null = null;

export async function isSupabaseGoogleProviderEnabled() {
  if (!isSupabasePrimaryAuthConfigured()) return false;
  if (googleProviderStatusCache && googleProviderStatusCache.expiresAt > Date.now()) {
    return googleProviderStatusCache.enabled;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`${env.supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: readPublishableKey() },
      signal: controller.signal,
    });
    const payload = response.ok
      ? await response.json() as { external?: { google?: boolean } }
      : null;
    const enabled = payload?.external?.google === true;
    googleProviderStatusCache = { enabled, expiresAt: Date.now() + 60_000 };
    return enabled;
  } catch {
    googleProviderStatusCache = { enabled: false, expiresAt: Date.now() + 15_000 };
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function isSupabasePrimaryAuthConfigured() {
  return Boolean(env.supabaseUrl.trim() && readPublishableKey());
}

function createAuthClient() {
  const key = readPublishableKey();
  if (!env.supabaseUrl.trim() || !key) throw new PrimaryAuthError("AUTH_NOT_CONFIGURED", 503);
  return createClient(env.supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function verifiedIdentity(user: User): VerifiedSupabaseIdentity {
  const email = normalizeEmail(user.email ?? "");
  if (!user.id || !email || !user.email_confirmed_at) {
    throw new PrimaryAuthError("AUTH_EMAIL_NOT_VERIFIED", 401);
  }
  const metadata = user.user_metadata ?? {};
  return {
    userId: user.id,
    email,
    displayName: String(metadata.full_name ?? metadata.name ?? email.split("@")[0]).slice(0, 200),
    avatarUrl: String(metadata.avatar_url ?? metadata.picture ?? "").slice(0, 1_000),
    provider: "supabase",
  };
}

async function inspectSession(
  client: SupabaseClient,
  session: Session,
  authMethod: AuthMethod,
  passwordKnown = false,
): Promise<ProviderAuthState> {
  const userResult = await client.auth.getUser(session.access_token);
  if (userResult.error || !userResult.data.user) {
    throw new PrimaryAuthError("AUTH_PENDING_SESSION_INVALID", 401);
  }
  const [factorsResult, aalResult] = await Promise.all([
    client.auth.mfa.listFactors(),
    client.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (factorsResult.error || aalResult.error) {
    throw new PrimaryAuthError("AUTH_PROVIDER_UNAVAILABLE", 503);
  }
  const refreshed = (await client.auth.getSession()).data.session ?? session;
  const currentAal = aalResult.data.currentLevel === "aal2" ? "aal2" : aalResult.data.currentLevel === "aal1" ? "aal1" : null;
  const nextAal = aalResult.data.nextLevel === "aal2" ? "aal2" : aalResult.data.nextLevel === "aal1" ? "aal1" : null;
  return {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: refreshed.expires_at ?? Math.floor(Date.now() / 1_000) + 600,
    identity: verifiedIdentity(userResult.data.user),
    passwordConfigured: passwordKnown || userResult.data.user.app_metadata?.legal_saathi_password_set === true,
    hasVerifiedTotp: factorsResult.data.totp.some((factor) => factor.status === "verified"),
    currentAal,
    nextAal,
    authMethod,
  };
}

async function restoreClient(state: ProviderAuthState) {
  const client = createAuthClient();
  const result = await client.auth.setSession({
    access_token: state.accessToken,
    refresh_token: state.refreshToken,
  });
  if (result.error || !result.data.session) {
    throw new PrimaryAuthError("AUTH_PENDING_SESSION_INVALID", 401);
  }
  return { client, session: result.data.session };
}

function mapProviderFailure(error: unknown, fallback: PrimaryAuthError) {
  if (error instanceof PrimaryAuthError) return error;
  const status = Number((error as { status?: number } | null)?.status ?? 0);
  if (status === 400 || status === 401 || status === 422) return fallback;
  return new PrimaryAuthError("AUTH_PROVIDER_UNAVAILABLE", 503);
}

type ProviderErrorShape = {
  status?: number;
  code?: string;
  message?: string;
  name?: string;
};

export function classifyEmailStartFailure(error: unknown) {
  if (error instanceof PrimaryAuthError) return error;
  const provider = (error ?? {}) as ProviderErrorShape;
  const status = Number(provider.status ?? 0);
  const code = String(provider.code ?? "").trim().toLowerCase();
  const message = String(provider.message ?? "").trim().toLowerCase();
  const name = String(provider.name ?? "").trim().toLowerCase();

  if (status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    return new PrimaryAuthError("EMAIL_RATE_LIMITED", 429);
  }
  if (code === "email_address_invalid") {
    return new PrimaryAuthError("AUTH_EMAIL_INVALID", 400);
  }
  if (message.includes("smtp") && /auth|credential|535/.test(message)) {
    return new PrimaryAuthError("SMTP_AUTH_FAILED", 503);
  }
  if (code === "unexpected_failure" || status === 500) {
    return new PrimaryAuthError("EMAIL_SEND_FAILED", 503);
  }
  if (name === "authretryablefetcherror" || status === 502 || status === 503 || status === 504 || status === 0) {
    return new PrimaryAuthError("EMAIL_PROVIDER_UNAVAILABLE", 503);
  }
  return new PrimaryAuthError("EMAIL_SEND_FAILED", 503);
}

export function classifyGoogleFailure(error: unknown) {
  if (error instanceof PrimaryAuthError) return error;
  const provider = (error ?? {}) as ProviderErrorShape;
  const code = String(provider.code ?? "").trim().toLowerCase();
  const message = String(provider.message ?? "").trim().toLowerCase();
  const status = Number(provider.status ?? 0);
  if (code === "oauth_provider_not_supported") {
    return new PrimaryAuthError("AUTH_GOOGLE_PROVIDER_DISABLED", 503, "provider_disabled");
  }
  if (/audience|client[ _-]?id/.test(message)) {
    return new PrimaryAuthError("AUTH_GOOGLE_INVALID", 401, "audience_mismatch");
  }
  if (/nonce/.test(message)) {
    return new PrimaryAuthError("AUTH_GOOGLE_INVALID", 401, "nonce_mismatch");
  }
  if (/expired|expiration|jwt.*exp/.test(message)) {
    return new PrimaryAuthError("AUTH_GOOGLE_INVALID", 401, "token_expired");
  }
  if (/identity.*already|user.*already|already.*registered|identity.*linked/.test(message)) {
    return new PrimaryAuthError("AUTH_GOOGLE_INVALID", 401, "identity_conflict");
  }
  if (status === 400 || status === 401 || status === 422) {
    return new PrimaryAuthError("AUTH_GOOGLE_INVALID", 401, "token_rejected");
  }
  return new PrimaryAuthError("AUTH_PROVIDER_UNAVAILABLE", 503, "provider_unavailable");
}

export class SupabasePrimaryAuthProvider implements PrimaryAuthProvider {
  async startEmailOtp(emailValue: string) {
    const email = validateEmail(emailValue);
    try {
      const { error } = await createAuthClient().auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
    } catch (error) {
      throw classifyEmailStartFailure(error);
    }
  }

  async startPasswordRecovery(emailValue: string) {
    const email = validateEmail(emailValue);
    try {
      const { error } = await createAuthClient().auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
    } catch (error) {
      throw classifyEmailStartFailure(error);
    }
  }

  async verifyEmailOtp(emailValue: string, otpValue: string) {
    const email = validateEmail(emailValue);
    const token = validateOtp(otpValue);
    try {
      const client = createAuthClient();
      const result = await client.auth.verifyOtp({ email, token, type: "email" });
      if (result.error || !result.data.session) throw result.error;
      return inspectSession(client, result.data.session, "email_otp");
    } catch (error) {
      throw mapProviderFailure(error, new PrimaryAuthError("AUTH_OTP_INVALID", 401));
    }
  }

  async signInWithPassword(emailValue: string, password: string) {
    const email = validateEmail(emailValue);
    if (!password || password.length > 128) throw new PrimaryAuthError("AUTH_CREDENTIALS_INVALID", 401);
    try {
      const client = createAuthClient();
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error || !result.data.session) throw result.error;
      return inspectSession(client, result.data.session, "password", true);
    } catch (error) {
      throw mapProviderFailure(error, new PrimaryAuthError("AUTH_CREDENTIALS_INVALID", 401));
    }
  }

  async signInWithGoogleIdToken(idToken: string, nonce: string) {
    try {
      const client = createAuthClient();
      const result = await client.auth.signInWithIdToken(buildGoogleIdTokenCredentials(idToken, nonce));
      if (result.error || !result.data.session) throw result.error;
      return inspectSession(client, result.data.session, "google");
    } catch (error) {
      throw classifyGoogleFailure(error);
    }
  }

  async createPassword(state: ProviderAuthState, password: string) {
    try {
      const { client, session } = await restoreClient(state);
      const updated = await client.auth.updateUser({ password });
      if (updated.error || !updated.data.user) throw updated.error;

      const serviceClient = getSupabaseClient();
      if (!serviceClient) throw new PrimaryAuthError("AUTH_NOT_CONFIGURED", 503);
      const currentAppMetadata = updated.data.user.app_metadata ?? {};
      const metadataResult = await serviceClient.auth.admin.updateUserById(updated.data.user.id, {
        app_metadata: { ...currentAppMetadata, legal_saathi_password_set: true },
      });
      if (metadataResult.error) throw new PrimaryAuthError("AUTH_PROVIDER_UNAVAILABLE", 503);

      return inspectSession(client, session, state.authMethod, true);
    } catch (error) {
      throw mapProviderFailure(error, new PrimaryAuthError("AUTH_PENDING_SESSION_INVALID", 401));
    }
  }

  async challengeTotp(state: ProviderAuthState, codeValue: string) {
    const code = validateOtp(codeValue);
    try {
      const { client, session } = await restoreClient(state);
      const factors = await client.auth.mfa.listFactors();
      const factor = factors.data?.totp.find((item) => item.status === "verified");
      if (factors.error || !factor) throw new PrimaryAuthError("AUTH_MFA_REQUIRED", 401);
      const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (verified.error) throw verified.error;
      const nextSession = (await client.auth.getSession()).data.session ?? session;
      const inspected = await inspectSession(client, nextSession, state.authMethod, state.passwordConfigured);
      if (inspected.currentAal !== "aal2") throw new PrimaryAuthError("AUTH_MFA_INVALID", 401);
      return inspected;
    } catch (error) {
      throw mapProviderFailure(error, new PrimaryAuthError("AUTH_MFA_INVALID", 401));
    }
  }
}

export class PrimaryAuthService {
  constructor(private readonly provider: PrimaryAuthProvider = new SupabasePrimaryAuthProvider()) {}

  startEmailOtp(email: string) {
    return this.provider.startEmailOtp(email);
  }

  async verifyEmailOtp(email: string, otp: string): Promise<AuthFlowDecision> {
    const state = await this.provider.verifyEmailOtp(email, otp);
    return { state, next: decideNextStep(state) };
  }

  async signInWithPassword(email: string, password: string): Promise<AuthFlowDecision> {
    const state = await this.provider.signInWithPassword(email, password);
    return { state, next: decideNextStep(state) };
  }

  async signInWithGoogleIdToken(idToken: string, nonce: string): Promise<AuthFlowDecision> {
    const state = await this.provider.signInWithGoogleIdToken(idToken, nonce);
    return { state, next: decideNextStep(state) };
  }

  startPasswordRecovery(email: string) {
    return this.provider.startPasswordRecovery(email);
  }

  async verifyPasswordRecovery(email: string, otp: string): Promise<AuthFlowDecision> {
    const state = await this.provider.verifyEmailOtp(email, otp);
    const recoveryState = { ...state, authMethod: "email_otp" as const, passwordConfigured: false };
    return { state: recoveryState, next: decideNextStep(recoveryState) };
  }

  async createPassword(state: ProviderAuthState, password: string, confirmation: string): Promise<AuthFlowDecision> {
    const validPassword = validatePassword(password, confirmation);
    const updated = await this.provider.createPassword(state, validPassword);
    return { state: updated, next: decideNextStep(updated) };
  }

  async challengeTotp(state: ProviderAuthState, code: string): Promise<AuthFlowDecision> {
    const updated = await this.provider.challengeTotp(state, code);
    return { state: updated, next: decideNextStep(updated) };
  }
}
