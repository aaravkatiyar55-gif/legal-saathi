import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { env } from "../../config/env";
import { getSupabaseClient } from "../supabase/supabaseClient";
import {
  currentAiDisclaimerVersion,
  currentConsentPolicy,
  currentConsentVersion,
  currentCookiePreferencesVersion,
  currentDataProcessingVersion,
  currentPrivacyVersion,
  currentTermsConsentVersion,
  currentTermsVersion,
} from "./consentPolicy";
import { acceptedConsentItems, consentDocumentBundle } from "./consentDocuments.service";

export type ConsentLocale = "en" | "hinglish" | "hi";
export type ConsentAuthenticationMethod = "google" | "supabase";

export {
  currentAiDisclaimerVersion,
  currentConsentPolicy,
  currentConsentVersion,
  currentCookiePreferencesVersion,
  currentDataProcessingVersion,
  currentPrivacyVersion,
  currentTermsConsentVersion,
  currentTermsVersion,
} from "./consentPolicy";

export type ConsentEvent = {
  id: string;
  subject: string;
  termsVersion: string;
  privacyVersion: string;
  consentVersion: string;
  aiDisclaimerVersion: string;
  dataProcessingVersion: string;
  cookiePreferencesVersion: string;
  acceptedAt: string;
  sourceVersion: string;
  locale: ConsentLocale;
  authenticationMethod: ConsentAuthenticationMethod;
  authenticationSessionReference: string;
  normalizedEmail: string;
  accepted: boolean;
  termsDocumentId: string;
  privacyDocumentId: string;
  termsContentHashSha256: string;
  privacyContentHashSha256: string;
  acceptedItems: string[];
  requestId: string;
  sourceRoute: string;
  userAgentMetadata: Record<string, unknown>;
  revokedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
};

export type ConsentAcceptanceInput = {
  subject: string;
  locale: ConsentLocale;
  authenticationMethod: ConsentAuthenticationMethod;
  authenticationSessionReference: string;
  normalizedEmail: string;
  requestId: string;
  userAgentMetadata: Record<string, unknown>;
};

export class ConsentStoreError extends Error {
  constructor(
    readonly code: "CONSENT_STORE_NOT_CONFIGURED" | "CONSENT_STORE_READ_FAILED" | "CONSENT_STORE_WRITE_FAILED",
    readonly reason: "not_configured" | "table_missing" | "schema_mismatch" | "access_denied" | "conflict" | "database_unavailable" | "unknown" = "unknown",
  ) {
    super(code);
    this.name = "ConsentStoreError";
  }
}

function classifyStoreFailure(error: { code?: string } | null) {
  const code = String(error?.code ?? "");
  if (code === "PGRST205" || code === "42P01") return "table_missing" as const;
  if (code === "PGRST204" || code === "42703") return "schema_mismatch" as const;
  if (code === "42501" || code === "PGRST301" || code === "PGRST302") return "access_denied" as const;
  if (code === "23505") return "conflict" as const;
  if (code === "PGRST000" || code === "PGRST001" || code === "PGRST002" || code === "PGRST003") {
    return "database_unavailable" as const;
  }
  return "unknown" as const;
}

export interface ConsentStoreAdapter {
  latest(subject: string): Promise<ConsentEvent | null>;
  history(subject: string, limit: number): Promise<ConsentEvent[]>;
  insert(input: ConsentAcceptanceInput): Promise<ConsentEvent>;
}

const consentColumns = [
  "id",
  "user_subject",
  "terms_version",
  "privacy_version",
  "consent_version",
  "ai_disclaimer_version",
  "data_processing_version",
  "cookie_preferences_version",
  "accepted_at",
  "source_version",
  "locale",
  "authentication_method",
  "authentication_session_reference",
  "normalized_email",
  "accepted",
  "terms_document_id",
  "privacy_document_id",
  "terms_content_hash_sha256",
  "privacy_content_hash_sha256",
  "accepted_items",
  "request_id",
  "source_route",
  "user_agent_metadata",
  "revoked_at",
  "superseded_at",
  "created_at",
].join(",");

function mapConsentRow(row: Record<string, unknown>): ConsentEvent {
  return {
    id: String(row.id ?? ""),
    subject: String(row.user_subject ?? ""),
    termsVersion: String(row.terms_version ?? ""),
    privacyVersion: String(row.privacy_version ?? ""),
    consentVersion: String(row.consent_version ?? ""),
    aiDisclaimerVersion: String(row.ai_disclaimer_version ?? ""),
    dataProcessingVersion: String(row.data_processing_version ?? ""),
    cookiePreferencesVersion: String(row.cookie_preferences_version ?? ""),
    acceptedAt: String(row.accepted_at ?? ""),
    sourceVersion: String(row.source_version ?? ""),
    locale: row.locale === "hi" || row.locale === "hinglish" ? row.locale : "en",
    authenticationMethod: row.authentication_method === "google" ? "google" : "supabase",
    authenticationSessionReference: String(row.authentication_session_reference ?? ""),
    normalizedEmail: String(row.normalized_email ?? ""),
    accepted: row.accepted !== false,
    termsDocumentId: String(row.terms_document_id ?? ""),
    privacyDocumentId: String(row.privacy_document_id ?? ""),
    termsContentHashSha256: String(row.terms_content_hash_sha256 ?? ""),
    privacyContentHashSha256: String(row.privacy_content_hash_sha256 ?? ""),
    acceptedItems: Array.isArray(row.accepted_items) ? row.accepted_items.map(String) : [],
    requestId: String(row.request_id ?? ""),
    sourceRoute: String(row.source_route ?? ""),
    userAgentMetadata: row.user_agent_metadata && typeof row.user_agent_metadata === "object"
      ? row.user_agent_metadata as Record<string, unknown>
      : {},
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    supersededAt: row.superseded_at ? String(row.superseded_at) : null,
    createdAt: String(row.created_at ?? row.accepted_at ?? ""),
  };
}

const supabaseConsentStore: ConsentStoreAdapter = {
  async latest(subject) {
    const client = getSupabaseClient();
    if (!client) throw new ConsentStoreError("CONSENT_STORE_NOT_CONFIGURED", "not_configured");
    const { data, error } = await client
      .from("legal_sathi_consent_events")
      .select(consentColumns)
      .eq("user_subject", subject)
      .is("revoked_at", null)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new ConsentStoreError("CONSENT_STORE_READ_FAILED", classifyStoreFailure(error));
    return data ? mapConsentRow(data as unknown as Record<string, unknown>) : null;
  },

  async history(subject, limit) {
    const client = getSupabaseClient();
    if (!client) throw new ConsentStoreError("CONSENT_STORE_NOT_CONFIGURED", "not_configured");
    const { data, error } = await client
      .from("legal_sathi_consent_events")
      .select(consentColumns)
      .eq("user_subject", subject)
      .order("accepted_at", { ascending: false })
      .limit(Math.min(50, Math.max(1, limit)));
    if (error) throw new ConsentStoreError("CONSENT_STORE_READ_FAILED", classifyStoreFailure(error));
    return (data ?? []).map((row) => mapConsentRow(row as unknown as Record<string, unknown>));
  },

  async insert(input) {
    const client = getSupabaseClient();
    if (!client) throw new ConsentStoreError("CONSENT_STORE_NOT_CONFIGURED", "not_configured");
    const { data, error } = await client
      .from("legal_sathi_consent_events")
      .insert({
        user_subject: input.subject,
        terms_version: currentTermsVersion,
        privacy_version: currentPrivacyVersion,
        consent_version: currentConsentVersion,
        ai_disclaimer_version: currentAiDisclaimerVersion,
        data_processing_version: currentDataProcessingVersion,
        cookie_preferences_version: currentCookiePreferencesVersion,
        source_version: "legal-saathi-local",
        locale: input.locale,
        authentication_method: input.authenticationMethod,
        authentication_session_reference: input.authenticationSessionReference,
        normalized_email: input.normalizedEmail,
        accepted: true,
        terms_document_id: consentDocumentBundle.terms.id,
        privacy_document_id: consentDocumentBundle.privacy.id,
        terms_content_hash_sha256: consentDocumentBundle.terms.sha256,
        privacy_content_hash_sha256: consentDocumentBundle.privacy.sha256,
        accepted_items: [...acceptedConsentItems],
        request_id: input.requestId,
        source_route: "/profile/consent",
        user_agent_metadata: input.userAgentMetadata,
      })
      .select(consentColumns)
      .single();
    if (error || !data) throw new ConsentStoreError("CONSENT_STORE_WRITE_FAILED", classifyStoreFailure(error));
    return mapConsentRow(data as unknown as Record<string, unknown>);
  },

};

type LocalConsentStore = {
  version: 1;
  events: Record<string, ConsentEvent[]>;
};

const localConsentPath = path.resolve(process.cwd(), ".local", "consent-events.json");
let localConsentQueue: Promise<void> = Promise.resolve();

function withLocalConsentLock<T>(task: () => Promise<T>) {
  const run = localConsentQueue.then(task, task);
  localConsentQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function readLocalConsentStore(): Promise<LocalConsentStore> {
  try {
    const parsed = JSON.parse(await fs.readFile(localConsentPath, "utf8")) as Partial<LocalConsentStore>;
    return parsed.version === 1 && parsed.events && typeof parsed.events === "object"
      ? { version: 1, events: parsed.events }
      : { version: 1, events: {} };
  } catch {
    return { version: 1, events: {} };
  }
}

async function writeLocalConsentStore(store: LocalConsentStore) {
  await fs.mkdir(path.dirname(localConsentPath), { recursive: true });
  const temporaryPath = `${localConsentPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, localConsentPath);
}

const localConsentStore: ConsentStoreAdapter = {
  latest: (subject) => withLocalConsentLock(async () => {
    const store = await readLocalConsentStore();
    return store.events[subject]?.at(-1) ?? null;
  }),

  history: (subject, limit) => withLocalConsentLock(async () => {
    const store = await readLocalConsentStore();
    return [...(store.events[subject] ?? [])]
      .reverse()
      .slice(0, Math.min(50, Math.max(1, limit)));
  }),

  insert: (input) => withLocalConsentLock(async () => {
    const acceptedAt = new Date().toISOString();
    const event: ConsentEvent = {
      id: randomUUID(),
      subject: input.subject,
      termsVersion: currentTermsVersion,
      privacyVersion: currentPrivacyVersion,
      consentVersion: currentConsentVersion,
      aiDisclaimerVersion: currentAiDisclaimerVersion,
      dataProcessingVersion: currentDataProcessingVersion,
      cookiePreferencesVersion: currentCookiePreferencesVersion,
      acceptedAt,
      sourceVersion: "legal-saathi-local",
      locale: input.locale,
      authenticationMethod: input.authenticationMethod,
      authenticationSessionReference: input.authenticationSessionReference,
      normalizedEmail: input.normalizedEmail,
      accepted: true,
      termsDocumentId: consentDocumentBundle.terms.id,
      privacyDocumentId: consentDocumentBundle.privacy.id,
      termsContentHashSha256: consentDocumentBundle.terms.sha256,
      privacyContentHashSha256: consentDocumentBundle.privacy.sha256,
      acceptedItems: [...acceptedConsentItems],
      requestId: input.requestId,
      sourceRoute: "/profile/consent",
      userAgentMetadata: input.userAgentMetadata,
      revokedAt: null,
      supersededAt: null,
      createdAt: acceptedAt,
    };
    const store = await readLocalConsentStore();
    store.events[input.subject] = [...(store.events[input.subject] ?? []), event];
    await writeLocalConsentStore(store);
    return event;
  }),
};

const defaultConsentStore = env.nodeEnv !== "production" && env.sessionStoreBackend === "local"
  ? localConsentStore
  : supabaseConsentStore;

export function isCurrentConsentEvent(event: ConsentEvent | null): event is ConsentEvent {
  return Boolean(
    event
    && !event.revokedAt
    && event.accepted
    && event.termsVersion === currentTermsVersion
    && event.privacyVersion === currentPrivacyVersion
    && event.consentVersion === currentConsentVersion
    && event.aiDisclaimerVersion === currentAiDisclaimerVersion
    && event.dataProcessingVersion === currentDataProcessingVersion
    && event.cookiePreferencesVersion === currentCookiePreferencesVersion
    && event.termsDocumentId === consentDocumentBundle.terms.id
    && event.privacyDocumentId === consentDocumentBundle.privacy.id
    && event.termsContentHashSha256 === consentDocumentBundle.terms.sha256
    && event.privacyContentHashSha256 === consentDocumentBundle.privacy.sha256,
  );
}

export class ConsentService {
  constructor(private readonly store: ConsentStoreAdapter = defaultConsentStore) {}

  async latestCurrent(subject: string) {
    const latest = await this.store.latest(subject);
    return isCurrentConsentEvent(latest) ? latest : null;
  }

  history(subject: string, limit = 20) {
    return this.store.history(subject, limit);
  }

  async accept(input: ConsentAcceptanceInput) {
    const latest = await this.store.latest(input.subject);
    if (isCurrentConsentEvent(latest)) {
      return latest;
    }
    try {
      return await this.store.insert(input);
    } catch (error) {
      if (error instanceof ConsentStoreError && error.reason === "conflict") {
        const concurrent = await this.store.latest(input.subject);
        if (isCurrentConsentEvent(concurrent)) return concurrent;
      }
      throw error;
    }
  }
}

export const consentService = new ConsentService();

export async function listConsentEventsByEmail(email: string, limit = 50) {
  const client = getSupabaseClient();
  if (!client) throw new ConsentStoreError("CONSENT_STORE_NOT_CONFIGURED", "not_configured");
  const { data, error } = await client
    .from("legal_sathi_consent_events")
    .select(consentColumns)
    .eq("normalized_email", email.trim().toLowerCase())
    .order("accepted_at", { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error) throw new ConsentStoreError("CONSENT_STORE_READ_FAILED", classifyStoreFailure(error));
  return (data ?? []).map((row) => mapConsentRow(row as unknown as Record<string, unknown>));
}
