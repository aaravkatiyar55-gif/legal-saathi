import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "../../config/env";
import { isSupabaseConfigured, getSupabaseClient } from "../supabase/supabaseClient";

export type TwoFactorRecord = {
  ownerKey: string;
  encryptedSecret: string;
  recoveryCodeHashes: string[];
  lastAcceptedStep: string | null;
  enabledAt: string | null;
  disabledAt: string | null;
  updatedAt: string;
};

export interface TwoFactorStoreAdapter {
  get(ownerKey: string): Promise<TwoFactorRecord | null>;
  upsert(record: TwoFactorRecord): Promise<void>;
}

export type TwoFactorReadinessInput = {
  storeBackend: string;
  encryptionKey: string;
  databaseConfigured: boolean;
  loginChallengeImplemented: boolean;
};

function parseEncryptionKey(value: string) {
  const normalized = value.trim();
  if (/^[a-f0-9]{64}$/i.test(normalized)) return Buffer.from(normalized, "hex");
  try {
    const decoded = Buffer.from(normalized, "base64");
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

export function evaluateTwoFactorReadiness(input: TwoFactorReadinessInput) {
  const missingVariables: string[] = [];
  const blockers: string[] = [];
  if (input.storeBackend !== "supabase") missingVariables.push("TOTP_STORE_BACKEND");
  if (!parseEncryptionKey(input.encryptionKey)) missingVariables.push("TOTP_ENCRYPTION_KEY");
  if (!input.databaseConfigured) missingVariables.push("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  if (!input.loginChallengeImplemented) blockers.push("LOGIN_CHALLENGE_INTEGRATION");
  return {
    configured: missingVariables.length === 0 && blockers.length === 0,
    enabled: false,
    setupRequired: true,
    missingVariables: [...new Set(missingVariables)].sort(),
    blockers,
    accountGuidance: "Google password and Google 2-Step Verification are managed in your Google Account.",
  };
}

export function getTwoFactorReadiness() {
  return evaluateTwoFactorReadiness({
    storeBackend: env.totpStoreBackend,
    encryptionKey: env.totpEncryptionKey,
    databaseConfigured: isSupabaseConfigured(),
    // Storage alone is not 2FA. Enrollment stays disabled until the primary
    // login challenge and recovery flow are fully integrated and reviewed.
    loginChallengeImplemented: false,
  });
}

export function twoFactorOwnerKey(identity: string) {
  return createHash("sha256").update(identity.trim().toLowerCase(), "utf8").digest("hex");
}

export function encryptTotpSecret(secret: string, keyValue: string) {
  const key = parseEncryptionKey(keyValue);
  if (!key) throw new Error("TOTP_ENCRYPTION_KEY_INVALID");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptTotpSecret(payload: string, keyValue: string) {
  const key = parseEncryptionKey(keyValue);
  if (!key) throw new Error("TOTP_ENCRYPTION_KEY_INVALID");
  const [ivValue, tagValue, ciphertextValue, extra] = payload.split(".");
  if (!ivValue || !tagValue || !ciphertextValue || extra) throw new Error("TOTP_SECRET_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

export function hashRecoveryCode(ownerKey: string, code: string, keyValue: string) {
  const key = parseEncryptionKey(keyValue);
  if (!key) throw new Error("TOTP_ENCRYPTION_KEY_INVALID");
  return createHmac("sha256", key).update(`${ownerKey}:${code.trim().toUpperCase()}`, "utf8").digest("hex");
}

const supabaseTwoFactorStore: TwoFactorStoreAdapter = {
  async get(ownerKey) {
    const client = getSupabaseClient();
    if (!client) throw new Error("TOTP_STORE_NOT_CONFIGURED");
    const result = await client.from("legal_sathi_two_factor_accounts").select("*").eq("owner_key", ownerKey).maybeSingle();
    if (result.error) throw new Error("TOTP_STORE_READ_FAILED");
    if (!result.data) return null;
    const row = result.data as Record<string, unknown>;
    return {
      ownerKey,
      encryptedSecret: String(row.encrypted_secret ?? ""),
      recoveryCodeHashes: Array.isArray(row.recovery_code_hashes) ? row.recovery_code_hashes.map(String) : [],
      lastAcceptedStep: row.last_accepted_step == null ? null : String(row.last_accepted_step),
      enabledAt: row.enabled_at ? String(row.enabled_at) : null,
      disabledAt: row.disabled_at ? String(row.disabled_at) : null,
      updatedAt: String(row.updated_at ?? ""),
    };
  },
  async upsert(record) {
    const client = getSupabaseClient();
    if (!client) throw new Error("TOTP_STORE_NOT_CONFIGURED");
    const result = await client.from("legal_sathi_two_factor_accounts").upsert({
      owner_key: record.ownerKey,
      encrypted_secret: record.encryptedSecret,
      recovery_code_hashes: record.recoveryCodeHashes,
      last_accepted_step: record.lastAcceptedStep,
      enabled_at: record.enabledAt,
      disabled_at: record.disabledAt,
      updated_at: record.updatedAt,
    }, { onConflict: "owner_key" });
    if (result.error) throw new Error("TOTP_STORE_WRITE_FAILED");
  },
};

export function getTwoFactorStore(): TwoFactorStoreAdapter {
  if (!getTwoFactorReadiness().configured) throw new Error("TOTP_SETUP_REQUIRED");
  return supabaseTwoFactorStore;
}

