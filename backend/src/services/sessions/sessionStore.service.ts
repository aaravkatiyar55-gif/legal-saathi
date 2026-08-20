import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/env";
import { getSupabaseClient } from "../supabase/supabaseClient";

export type SessionRecord = {
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: "google" | "development" | "supabase";
  subject?: string;
  csrfToken: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  consentVersion: string | null;
  consentedAt: string | null;
  language: "en" | "hinglish" | "hi";
  providerSessionSealed?: string;
  reauthenticatedAt?: string;
};

export interface SessionStoreAdapter {
  create(tokenHash: string, session: SessionRecord): Promise<void>;
  get(tokenHash: string): Promise<SessionRecord | null>;
  update(tokenHash: string, session: SessionRecord): Promise<void>;
  latestConsentForSubject(subject: string): Promise<Pick<SessionRecord, "consentVersion" | "consentedAt" | "language"> | null>;
  revokeForSubject(subject: string, revokedAt: string, exceptTokenHash?: string): Promise<void>;
}

type LocalStore = { version: 2; sessions: Record<string, SessionRecord> };
const localPath = path.resolve(process.cwd(), ".local", "auth-sessions.json");
let localQueue: Promise<void> = Promise.resolve();

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function withLocalLock<T>(task: () => Promise<T>) {
  const run = localQueue.then(task, task);
  localQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function readLocalStore(): Promise<LocalStore> {
  try {
    const parsed = JSON.parse(await fs.readFile(localPath, "utf8")) as { version?: number; sessions?: Record<string, SessionRecord & { id?: string }> };
    if (parsed.version === 2) return { version: 2, sessions: parsed.sessions ?? {} };
    const migrated: Record<string, SessionRecord> = {};
    for (const [legacyKey, legacy] of Object.entries(parsed.sessions ?? {})) {
      const token = legacy.id || legacyKey;
      const { id: _discarded, ...record } = legacy;
      migrated[hashSessionToken(token)] = record;
    }
    return { version: 2, sessions: migrated };
  } catch {
    return { version: 2, sessions: {} };
  }
}

async function writeLocalStore(store: LocalStore) {
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  const temporaryPath = `${localPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, localPath);
}

const localAdapter: SessionStoreAdapter = {
  create: (tokenHash, session) => withLocalLock(async () => {
    const store = await readLocalStore();
    store.sessions[tokenHash] = session;
    await writeLocalStore(store);
  }),
  get: (tokenHash) => withLocalLock(async () => {
    const store = await readLocalStore();
    return store.sessions[tokenHash] ?? null;
  }),
  update: (tokenHash, session) => withLocalLock(async () => {
    const store = await readLocalStore();
    store.sessions[tokenHash] = session;
    await writeLocalStore(store);
  }),
  latestConsentForSubject: (subject) => withLocalLock(async () => {
    const store = await readLocalStore();
    const latest = Object.values(store.sessions)
      .filter((session) => session.subject === subject && session.consentVersion && session.consentedAt)
      .sort((left, right) => String(right.consentedAt).localeCompare(String(left.consentedAt)))[0];
    return latest
      ? { consentVersion: latest.consentVersion, consentedAt: latest.consentedAt, language: latest.language }
      : null;
  }),
  revokeForSubject: (subject, revokedAt, exceptTokenHash) => withLocalLock(async () => {
    const store = await readLocalStore();
    let changed = false;
    for (const [tokenHash, session] of Object.entries(store.sessions)) {
      if (session.subject !== subject || session.revokedAt || tokenHash === exceptTokenHash) continue;
      session.revokedAt = revokedAt;
      changed = true;
    }
    if (changed) await writeLocalStore(store);
  }),
};

function fromSupabaseRow(row: Record<string, unknown>): SessionRecord {
  const provider = row.provider === "development"
    ? "development"
    : row.provider === "supabase"
      ? "supabase"
      : "google";
  return {
    email: String(row.email ?? ""), displayName: String(row.display_name ?? ""), avatarUrl: String(row.avatar_url ?? ""),
    provider, subject: row.google_subject ? String(row.google_subject) : undefined,
    csrfToken: String(row.csrf_token ?? ""), createdAt: String(row.created_at ?? ""), lastSeenAt: String(row.last_seen_at ?? ""),
    expiresAt: String(row.expires_at ?? ""), revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    consentVersion: row.consent_version ? String(row.consent_version) : null, consentedAt: row.consented_at ? String(row.consented_at) : null,
    language: row.language === "hi" || row.language === "hinglish" ? row.language : "en",
    providerSessionSealed: row.provider_session_sealed ? String(row.provider_session_sealed) : undefined,
    reauthenticatedAt: row.reauthenticated_at ? String(row.reauthenticated_at) : undefined,
  };
}

function toSupabaseRow(tokenHash: string, session: SessionRecord) {
  return {
    token_hash: tokenHash, email: session.email, display_name: session.displayName, avatar_url: session.avatarUrl,
    provider: session.provider, google_subject: session.subject ?? null, csrf_token: session.csrfToken,
    created_at: session.createdAt, last_seen_at: session.lastSeenAt, expires_at: session.expiresAt, revoked_at: session.revokedAt,
    consent_version: session.consentVersion, consented_at: session.consentedAt, language: session.language,
    provider_session_sealed: session.providerSessionSealed ?? null,
    reauthenticated_at: session.reauthenticatedAt ?? null,
  };
}

const supabaseAdapter: SessionStoreAdapter = {
  async create(tokenHash, session) {
    const client = getSupabaseClient();
    if (!client) throw new Error("SESSION_STORE_NOT_CONFIGURED");
    const { error } = await client.from("legal_sathi_sessions").insert(toSupabaseRow(tokenHash, session));
    if (error) throw new Error("SESSION_STORE_WRITE_FAILED");
  },
  async get(tokenHash) {
    const client = getSupabaseClient();
    if (!client) throw new Error("SESSION_STORE_NOT_CONFIGURED");
    const { data, error } = await client.from("legal_sathi_sessions").select("*").eq("token_hash", tokenHash).maybeSingle();
    if (error) throw new Error("SESSION_STORE_READ_FAILED");
    return data ? fromSupabaseRow(data as Record<string, unknown>) : null;
  },
  async update(tokenHash, session) {
    const client = getSupabaseClient();
    if (!client) throw new Error("SESSION_STORE_NOT_CONFIGURED");
    const { error } = await client.from("legal_sathi_sessions").update(toSupabaseRow(tokenHash, session)).eq("token_hash", tokenHash);
    if (error) throw new Error("SESSION_STORE_WRITE_FAILED");
  },
  async latestConsentForSubject(subject) {
    const client = getSupabaseClient();
    if (!client) throw new Error("SESSION_STORE_NOT_CONFIGURED");
    const { data, error } = await client
      .from("legal_sathi_sessions")
      .select("consent_version,consented_at,language")
      .eq("google_subject", subject)
      .not("consented_at", "is", null)
      .order("consented_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("SESSION_STORE_READ_FAILED");
    if (!data) return null;
    return {
      consentVersion: data.consent_version ? String(data.consent_version) : null,
      consentedAt: data.consented_at ? String(data.consented_at) : null,
      language: data.language === "hi" || data.language === "hinglish" ? data.language : "en",
    };
  },
  async revokeForSubject(subject, revokedAt, exceptTokenHash) {
    const client = getSupabaseClient();
    if (!client) throw new Error("SESSION_STORE_NOT_CONFIGURED");
    let query = client
      .from("legal_sathi_sessions")
      .update({ revoked_at: revokedAt })
      .eq("google_subject", subject)
      .is("revoked_at", null);
    if (exceptTokenHash) query = query.neq("token_hash", exceptTokenHash);
    const { error } = await query;
    if (error) throw new Error("SESSION_STORE_WRITE_FAILED");
  },
};

export function getSessionStore(): SessionStoreAdapter {
  if (env.sessionStoreBackend === "local" && env.nodeEnv !== "production") return localAdapter;
  if (env.sessionStoreBackend === "supabase") return supabaseAdapter;
  throw new Error("SESSION_STORE_NOT_CONFIGURED");
}
