import { createClient, type Factor, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

import { env } from "../../config/env";

export type MfaAal = "aal1" | "aal2" | null;

export type MfaSessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
};

export type MfaOwnerIdentity = {
  email: string;
  subject?: string;
};

export type SafeMfaFactor = {
  id: string;
  friendlyName: string;
  createdAt: string;
  updatedAt: string;
};

export type SafeMfaStatus = {
  configured: true;
  enabled: boolean;
  currentLevel: MfaAal;
  nextLevel: MfaAal;
  requiresChallenge: boolean;
  factors: SafeMfaFactor[];
  recoveryCodesSupported: false;
};

export type MfaEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

export function requiresAal2ForSensitiveAction(status: SafeMfaStatus) {
  return status.enabled && status.currentLevel !== "aal2";
}

export class SupabaseMfaError extends Error {
  constructor(
    readonly code:
      | "MFA_NOT_CONFIGURED"
      | "MFA_SESSION_REQUIRED"
      | "MFA_IDENTITY_MISMATCH"
      | "MFA_EMAIL_NOT_VERIFIED"
      | "MFA_FACTOR_NOT_FOUND"
      | "MFA_CODE_INVALID"
      | "MFA_AAL2_REQUIRED"
      | "MFA_PROVIDER_UNAVAILABLE",
    readonly status: number,
  ) {
    super(code);
    this.name = "SupabaseMfaError";
  }
}

type ProviderFactor = Pick<Factor, "id" | "factor_type" | "status" | "friendly_name" | "created_at" | "updated_at">;

export interface SupabaseMfaProviderClient {
  restoreSession(tokens: MfaSessionTokens): Promise<{ session: Session; user: User }>;
  listFactors(): Promise<ProviderFactor[]>;
  getAuthenticatorAssuranceLevel(): Promise<{ currentLevel: MfaAal; nextLevel: MfaAal }>;
  enrollTotp(): Promise<MfaEnrollment>;
  challengeAndVerify(factorId: string, code: string): Promise<void>;
  unenroll(factorId: string): Promise<void>;
  currentSession(): Promise<Session>;
}

export type SupabaseMfaProviderFactory = () => SupabaseMfaProviderClient;

const legalSaathiFactorNames = new Set([
  "legal saathi authenticator",
  "legal saathi authenticator app",
]);

function readPublishableKey() {
  return (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "").trim();
}

export function isSupabaseMfaConfigured() {
  return Boolean(env.supabaseUrl.trim() && readPublishableKey());
}

function normalizeAal(value: unknown): MfaAal {
  return value === "aal1" || value === "aal2" ? value : null;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function mapProviderError(error: unknown, fallback: SupabaseMfaError) {
  if (error instanceof SupabaseMfaError) return error;
  const status = Number((error as { status?: number } | null)?.status ?? 0);
  if ([400, 401, 403, 422].includes(status)) return fallback;
  return new SupabaseMfaError("MFA_PROVIDER_UNAVAILABLE", 503);
}

function requireSessionValue<T>(value: T | null | undefined): T {
  if (!value) throw new SupabaseMfaError("MFA_SESSION_REQUIRED", 401);
  return value;
}

function createProviderClient(): SupabaseMfaProviderClient {
  const key = readPublishableKey();
  if (!env.supabaseUrl.trim() || !key) throw new SupabaseMfaError("MFA_NOT_CONFIGURED", 503);
  const client = createClient(env.supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return new SupabaseJsMfaProviderClient(client);
}

class SupabaseJsMfaProviderClient implements SupabaseMfaProviderClient {
  constructor(private readonly client: SupabaseClient) {}

  async restoreSession(tokens: MfaSessionTokens) {
    const result = await this.client.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    if (result.error || !result.data.session) {
      throw result.error ?? new SupabaseMfaError("MFA_SESSION_REQUIRED", 401);
    }
    const userResult = await this.client.auth.getUser(result.data.session.access_token);
    if (userResult.error || !userResult.data.user) {
      throw userResult.error ?? new SupabaseMfaError("MFA_SESSION_REQUIRED", 401);
    }
    return { session: result.data.session, user: userResult.data.user };
  }

  async listFactors() {
    const result = await this.client.auth.mfa.listFactors();
    if (result.error || !result.data) throw result.error ?? new Error("MFA_FACTORS_UNAVAILABLE");
    return result.data.all;
  }

  async getAuthenticatorAssuranceLevel() {
    const result = await this.client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (result.error || !result.data) throw result.error ?? new Error("MFA_AAL_UNAVAILABLE");
    return {
      currentLevel: normalizeAal(result.data.currentLevel),
      nextLevel: normalizeAal(result.data.nextLevel),
    };
  }

  async enrollTotp() {
    const result = await this.client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Legal Saathi Authenticator",
      issuer: "Legal Saathi",
    });
    if (result.error || !result.data || result.data.type !== "totp") {
      throw result.error ?? new Error("MFA_ENROLLMENT_UNAVAILABLE");
    }
    return {
      factorId: result.data.id,
      qrCode: result.data.totp.qr_code,
      secret: result.data.totp.secret,
      uri: result.data.totp.uri,
    };
  }

  async challengeAndVerify(factorId: string, code: string) {
    const result = await this.client.auth.mfa.challengeAndVerify({ factorId, code });
    if (result.error) throw result.error;
  }

  async unenroll(factorId: string) {
    const result = await this.client.auth.mfa.unenroll({ factorId });
    if (result.error) throw result.error;
  }

  async currentSession() {
    const result = await this.client.auth.getSession();
    return requireSessionValue(result.data.session);
  }
}

function safeFactor(factor: ProviderFactor): SafeMfaFactor {
  return {
    id: factor.id,
    friendlyName: factor.friendly_name || "Authenticator app",
    createdAt: factor.created_at,
    updatedAt: factor.updated_at,
  };
}

function requireSixDigitCode(value: string) {
  const code = value.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) throw new SupabaseMfaError("MFA_CODE_INVALID", 400);
  return code;
}

export class SupabaseMfaService {
  private readonly enrollmentStarts = new Map<string, Promise<{ enrollment: MfaEnrollment; tokens: MfaSessionTokens }>>();

  constructor(private readonly providerFactory: SupabaseMfaProviderFactory = createProviderClient) {}

  private async authenticatedClient(tokens: MfaSessionTokens, owner: MfaOwnerIdentity) {
    if (!isSupabaseMfaConfigured() && this.providerFactory === createProviderClient) {
      throw new SupabaseMfaError("MFA_NOT_CONFIGURED", 503);
    }
    if (!tokens.accessToken || !tokens.refreshToken || tokens.accessToken.length > 16_384 || tokens.refreshToken.length > 16_384) {
      throw new SupabaseMfaError("MFA_SESSION_REQUIRED", 401);
    }
    const provider = this.providerFactory();
    try {
      const restored = await provider.restoreSession(tokens);
      const email = normalizeEmail(restored.user.email ?? "");
      if (!restored.user.email_confirmed_at || !email) {
        throw new SupabaseMfaError("MFA_EMAIL_NOT_VERIFIED", 401);
      }
      if (owner.subject && owner.subject !== restored.user.id) {
        throw new SupabaseMfaError("MFA_IDENTITY_MISMATCH", 403);
      }
      if (normalizeEmail(owner.email) !== email) {
        throw new SupabaseMfaError("MFA_IDENTITY_MISMATCH", 403);
      }
      return provider;
    } catch (error) {
      throw mapProviderError(error, new SupabaseMfaError("MFA_SESSION_REQUIRED", 401));
    }
  }

  private async inspect(provider: SupabaseMfaProviderClient): Promise<SafeMfaStatus> {
    try {
      const [allFactors, aal] = await Promise.all([
        provider.listFactors(),
        provider.getAuthenticatorAssuranceLevel(),
      ]);
      const factors = allFactors
        .filter((factor) => factor.factor_type === "totp" && factor.status === "verified")
        .map(safeFactor);
      return {
        configured: true,
        enabled: factors.length > 0,
        currentLevel: aal.currentLevel,
        nextLevel: aal.nextLevel,
        requiresChallenge: factors.length > 0 && aal.currentLevel !== "aal2",
        factors,
        recoveryCodesSupported: false,
      };
    } catch (error) {
      throw mapProviderError(error, new SupabaseMfaError("MFA_PROVIDER_UNAVAILABLE", 503));
    }
  }

  private async currentTokens(provider: SupabaseMfaProviderClient): Promise<MfaSessionTokens> {
    const session = await provider.currentSession();
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ?? Math.floor(Date.now() / 1_000) + 600,
    };
  }

  private enrollmentOwnerKey(owner: MfaOwnerIdentity) {
    return owner.subject?.trim() || normalizeEmail(owner.email);
  }

  private async createEnrollment(provider: SupabaseMfaProviderClient) {
    const factors = await provider.listFactors();
    const staleLegalSaathiFactors = factors.filter((factor) =>
      factor.factor_type === "totp"
      && factor.status === "unverified"
      && legalSaathiFactorNames.has(String(factor.friendly_name ?? "").trim().toLowerCase()));
    for (const factor of staleLegalSaathiFactors) {
      await provider.unenroll(factor.id);
    }
    return provider.enrollTotp();
  }

  async status(tokens: MfaSessionTokens, owner: MfaOwnerIdentity) {
    return this.inspect(await this.authenticatedClient(tokens, owner));
  }

  async statusWithTokens(tokens: MfaSessionTokens, owner: MfaOwnerIdentity) {
    const provider = await this.authenticatedClient(tokens, owner);
    return { status: await this.inspect(provider), tokens: await this.currentTokens(provider) };
  }

  async startEnrollment(tokens: MfaSessionTokens, owner: MfaOwnerIdentity) {
    const provider = await this.authenticatedClient(tokens, owner);
    try {
      return await this.createEnrollment(provider);
    } catch (error) {
      throw mapProviderError(error, new SupabaseMfaError("MFA_PROVIDER_UNAVAILABLE", 503));
    }
  }

  async startEnrollmentWithTokens(tokens: MfaSessionTokens, owner: MfaOwnerIdentity) {
    const ownerKey = this.enrollmentOwnerKey(owner);
    const existing = this.enrollmentStarts.get(ownerKey);
    if (existing) return existing;

    const task = (async () => {
      const provider = await this.authenticatedClient(tokens, owner);
      try {
        return {
          enrollment: await this.createEnrollment(provider),
          tokens: await this.currentTokens(provider),
        };
      } catch (error) {
        throw mapProviderError(error, new SupabaseMfaError("MFA_PROVIDER_UNAVAILABLE", 503));
      }
    })().finally(() => {
      this.enrollmentStarts.delete(ownerKey);
    });
    this.enrollmentStarts.set(ownerKey, task);
    return task;
  }

  async verifyEnrollment(tokens: MfaSessionTokens, owner: MfaOwnerIdentity, factorId: string, codeValue: string) {
    const provider = await this.authenticatedClient(tokens, owner);
    const code = requireSixDigitCode(codeValue);
    try {
      const factors = await provider.listFactors();
      const ownsFactor = factors.some((factor) => factor.id === factorId && factor.factor_type === "totp");
      if (!ownsFactor) throw new SupabaseMfaError("MFA_FACTOR_NOT_FOUND", 404);
      await provider.challengeAndVerify(factorId, code);
      const status = await this.inspect(provider);
      if (!status.enabled || status.currentLevel !== "aal2") {
        throw new SupabaseMfaError("MFA_AAL2_REQUIRED", 403);
      }
      const session = await provider.currentSession();
      return {
        status,
        tokens: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: session.expires_at ?? Math.floor(Date.now() / 1_000) + 600,
        },
      };
    } catch (error) {
      throw mapProviderError(error, new SupabaseMfaError("MFA_CODE_INVALID", 401));
    }
  }

  async cancelEnrollment(tokens: MfaSessionTokens, owner: MfaOwnerIdentity, factorId: string) {
    const provider = await this.authenticatedClient(tokens, owner);
    try {
      const factors = await provider.listFactors();
      const factor = factors.find((item) => item.id === factorId && item.factor_type === "totp" && item.status === "unverified");
      if (!factor) throw new SupabaseMfaError("MFA_FACTOR_NOT_FOUND", 404);
      await provider.unenroll(factorId);
    } catch (error) {
      throw mapProviderError(error, new SupabaseMfaError("MFA_PROVIDER_UNAVAILABLE", 503));
    }
  }

  async cancelEnrollmentWithTokens(tokens: MfaSessionTokens, owner: MfaOwnerIdentity, factorId: string) {
    const provider = await this.authenticatedClient(tokens, owner);
    try {
      const factors = await provider.listFactors();
      const factor = factors.find((item) => item.id === factorId && item.factor_type === "totp" && item.status === "unverified");
      if (!factor) throw new SupabaseMfaError("MFA_FACTOR_NOT_FOUND", 404);
      await provider.unenroll(factorId);
      return { tokens: await this.currentTokens(provider) };
    } catch (error) {
      throw mapProviderError(error, new SupabaseMfaError("MFA_PROVIDER_UNAVAILABLE", 503));
    }
  }

  async disableFactor(tokens: MfaSessionTokens, owner: MfaOwnerIdentity, factorId: string, codeValue: string) {
    const provider = await this.authenticatedClient(tokens, owner);
    try {
      const factors = await provider.listFactors();
      const factor = factors.find((item) => item.id === factorId && item.factor_type === "totp" && item.status === "verified");
      if (!factor) throw new SupabaseMfaError("MFA_FACTOR_NOT_FOUND", 404);
      const aal = await provider.getAuthenticatorAssuranceLevel();
      if (aal.currentLevel !== "aal2") {
        await provider.challengeAndVerify(factorId, requireSixDigitCode(codeValue));
        const elevated = await provider.getAuthenticatorAssuranceLevel();
        if (elevated.currentLevel !== "aal2") throw new SupabaseMfaError("MFA_AAL2_REQUIRED", 403);
      }
      await provider.unenroll(factorId);
      return this.inspect(provider);
    } catch (error) {
      throw mapProviderError(error, new SupabaseMfaError("MFA_CODE_INVALID", 401));
    }
  }

  async disableFactorWithTokens(tokens: MfaSessionTokens, owner: MfaOwnerIdentity, factorId: string, codeValue: string) {
    const provider = await this.authenticatedClient(tokens, owner);
    try {
      const factors = await provider.listFactors();
      const factor = factors.find((item) => item.id === factorId && item.factor_type === "totp" && item.status === "verified");
      if (!factor) throw new SupabaseMfaError("MFA_FACTOR_NOT_FOUND", 404);
      const aal = await provider.getAuthenticatorAssuranceLevel();
      if (aal.currentLevel !== "aal2") {
        await provider.challengeAndVerify(factorId, requireSixDigitCode(codeValue));
        const elevated = await provider.getAuthenticatorAssuranceLevel();
        if (elevated.currentLevel !== "aal2") throw new SupabaseMfaError("MFA_AAL2_REQUIRED", 403);
      }
      await provider.unenroll(factorId);
      return { status: await this.inspect(provider), tokens: await this.currentTokens(provider) };
    } catch (error) {
      throw mapProviderError(error, new SupabaseMfaError("MFA_CODE_INVALID", 401));
    }
  }
}

export const supabaseMfaService = new SupabaseMfaService();
