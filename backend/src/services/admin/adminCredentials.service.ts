import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { env } from "../../config/env";
import { getSupabaseClient } from "../supabase/supabaseClient";
import { normalizeAdminEmail } from "../../security/adminIdentity";

const scryptAsync = promisify(scrypt);
const credentialTable = "legal_sathi_admin_credentials";
const auditTable = "legal_sathi_admin_audit_events";
const derivedKeyLength = 64;
const localStorePath = path.resolve(process.cwd(), ".local", "admin-credentials.json");
let localStoreQueue: Promise<void> = Promise.resolve();

type StoredCredential = {
  email: string;
  password_salt: string;
  password_hash: string;
  password_version: number;
};

type LocalAdminStore = {
  version: 1;
  credentials: Record<string, StoredCredential>;
  audit: Array<{
    actorEmail: string;
    action: string;
    result: "success" | "denied" | "failed";
    requestId: string;
    targetEmail?: string;
    metadata?: Record<string, string | number | boolean | null>;
    createdAt: string;
  }>;
};

export class AdminCredentialStoreError extends Error {
  constructor(readonly code: "ADMIN_CREDENTIAL_STORE_UNAVAILABLE" | "ADMIN_CREDENTIAL_ALREADY_CONFIGURED") {
    super(code);
    this.name = "AdminCredentialStoreError";
  }
}

export function validateAdminPassword(password: unknown) {
  if (typeof password !== "string" || password.length < 14 || password.length > 128) return false;
  return /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

async function derivePassword(password: string, salt: Buffer) {
  return await scryptAsync(password, salt, derivedKeyLength) as Buffer;
}

function canUseLocalAdminStore() {
  return env.nodeEnv !== "production" && env.sessionStoreBackend === "local";
}

function withLocalStoreLock<T>(task: () => Promise<T>) {
  const run = localStoreQueue.then(task, task);
  localStoreQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function readLocalStore(): Promise<LocalAdminStore> {
  try {
    const parsed = JSON.parse(await fs.readFile(localStorePath, "utf8")) as Partial<LocalAdminStore>;
    return parsed.version === 1 && parsed.credentials && typeof parsed.credentials === "object"
      ? {
          version: 1,
          credentials: parsed.credentials,
          audit: Array.isArray(parsed.audit) ? parsed.audit.slice(-1_000) : [],
        }
      : { version: 1, credentials: {}, audit: [] };
  } catch {
    return { version: 1, credentials: {}, audit: [] };
  }
}

async function writeLocalStore(store: LocalAdminStore) {
  await fs.mkdir(path.dirname(localStorePath), { recursive: true });
  const temporaryPath = `${localStorePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, localStorePath);
}

async function readCredential(email: string) {
  if (canUseLocalAdminStore()) {
    return withLocalStoreLock(async () => {
      const store = await readLocalStore();
      return store.credentials[normalizeAdminEmail(email)] ?? null;
    });
  }
  const client = getSupabaseClient();
  if (!client) throw new AdminCredentialStoreError("ADMIN_CREDENTIAL_STORE_UNAVAILABLE");
  const { data, error } = await client
    .from(credentialTable)
    .select("email,password_salt,password_hash,password_version")
    .eq("email", normalizeAdminEmail(email))
    .maybeSingle();
  if (error) throw new AdminCredentialStoreError("ADMIN_CREDENTIAL_STORE_UNAVAILABLE");
  return data as StoredCredential | null;
}

export async function isAdminCredentialConfigured(email: string) {
  return Boolean(await readCredential(email));
}

export async function setupAdminCredential(email: string, password: string, requestId: string) {
  const normalizedEmail = normalizeAdminEmail(email);
  if (!validateAdminPassword(password)) throw new Error("ADMIN_PASSWORD_POLICY_FAILED");
  if (canUseLocalAdminStore()) {
    const salt = randomBytes(24);
    const hash = await derivePassword(password, salt);
    await withLocalStoreLock(async () => {
      const store = await readLocalStore();
      if (store.credentials[normalizedEmail]) {
        throw new AdminCredentialStoreError("ADMIN_CREDENTIAL_ALREADY_CONFIGURED");
      }
      store.credentials[normalizedEmail] = {
        email: normalizedEmail,
        password_salt: salt.toString("base64url"),
        password_hash: hash.toString("base64url"),
        password_version: 1,
      };
      await writeLocalStore(store);
    });
    await recordAdminAudit({
      actorEmail: normalizedEmail,
      action: "admin_credential_created",
      result: "success",
      requestId,
    });
    return;
  }
  if (await readCredential(normalizedEmail)) {
    throw new AdminCredentialStoreError("ADMIN_CREDENTIAL_ALREADY_CONFIGURED");
  }
  const client = getSupabaseClient();
  if (!client) throw new AdminCredentialStoreError("ADMIN_CREDENTIAL_STORE_UNAVAILABLE");
  const salt = randomBytes(24);
  const hash = await derivePassword(password, salt);
  const { error } = await client.from(credentialTable).insert({
    email: normalizedEmail,
    password_salt: salt.toString("base64url"),
    password_hash: hash.toString("base64url"),
    password_version: 1,
  });
  if (error) {
    if (String(error.code ?? "") === "23505") {
      throw new AdminCredentialStoreError("ADMIN_CREDENTIAL_ALREADY_CONFIGURED");
    }
    throw new AdminCredentialStoreError("ADMIN_CREDENTIAL_STORE_UNAVAILABLE");
  }
  await recordAdminAudit({
    actorEmail: normalizedEmail,
    action: "admin_credential_created",
    result: "success",
    requestId,
  }).catch(() => undefined);
}

export async function verifyAdminCredential(email: string, password: unknown) {
  if (typeof password !== "string" || password.length > 128) return false;
  const credential = await readCredential(email);
  if (!credential) return false;
  let salt: Buffer;
  let storedHash: Buffer;
  try {
    salt = Buffer.from(credential.password_salt, "base64url");
    storedHash = Buffer.from(credential.password_hash, "base64url");
  } catch {
    return false;
  }
  if (storedHash.length !== derivedKeyLength || salt.length < 16) return false;
  const suppliedHash = await derivePassword(password, salt);
  return timingSafeEqual(storedHash, suppliedHash);
}

export async function recordAdminAudit(input: {
  actorEmail: string;
  action: string;
  result: "success" | "denied" | "failed";
  requestId: string;
  targetEmail?: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  if (canUseLocalAdminStore()) {
    await withLocalStoreLock(async () => {
      const store = await readLocalStore();
      store.audit = [...store.audit, {
        actorEmail: normalizeAdminEmail(input.actorEmail),
        action: input.action,
        result: input.result,
        requestId: input.requestId,
        ...(input.targetEmail ? { targetEmail: normalizeAdminEmail(input.targetEmail) } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
        createdAt: new Date().toISOString(),
      }].slice(-1_000);
      await writeLocalStore(store);
    });
    return;
  }
  const client = getSupabaseClient();
  if (!client) throw new AdminCredentialStoreError("ADMIN_CREDENTIAL_STORE_UNAVAILABLE");
  const { error } = await client.from(auditTable).insert({
    actor_email: normalizeAdminEmail(input.actorEmail),
    action: input.action,
    result: input.result,
    request_id: input.requestId,
    target_email: input.targetEmail ? normalizeAdminEmail(input.targetEmail) : null,
    metadata: input.metadata ?? {},
  });
  if (error) throw new AdminCredentialStoreError("ADMIN_CREDENTIAL_STORE_UNAVAILABLE");
}
