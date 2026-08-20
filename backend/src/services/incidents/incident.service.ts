import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "../../config/env";
import { getSupabaseClient } from "../supabase/supabaseClient";

export const incidentStatuses = ["new", "investigating", "resolved", "ignored", "needs_codex_review"] as const;
export type IncidentStatus = typeof incidentStatuses[number];

const safeVersion = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/);
const safeRouteCategories = [
  "admin", "ai", "application", "auth", "case-questions", "cases", "client",
  "documents", "incidents", "payments", "profile", "rag", "transcription", "web", "unknown",
] as const;
const safeFeatures = [
  "admin", "application", "auth", "case", "chat", "client", "document", "incidents",
  "payment", "profile", "rag", "transcription", "web", "unknown",
] as const;
export const incidentAttemptedActions = [
  "Complete the current action",
  "Send a legal information question",
  "Open or update a case",
  "Process a document",
  "Sign in or manage my session",
  "Use Web or legal grounding",
  "Open pricing or payment",
] as const;
export const incidentReproducibility = ["once", "sometimes", "always", "unknown"] as const;
export const incidentReportSchema = z.object({
  requestId: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9_-]+$/),
  timestamp: z.string().datetime(),
  deploymentVersion: safeVersion,
  frontendVersion: safeVersion,
  routeCategory: z.enum(safeRouteCategories),
  feature: z.enum(safeFeatures),
  errorCode: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
  httpStatus: z.number().int().min(0).max(599),
  modelClass: z.enum(["auto", "fast", "flash", "pro", "ultra", "unknown"]),
  webEnabled: z.boolean(),
  ragEnabled: z.boolean(),
  planClass: z.enum(["free", "plus", "pro", "max", "unknown"]),
  browserFamily: z.enum(["Chrome", "Edge", "Firefox", "Safari", "Chromium", "Other"]),
  browserVersion: z.string().trim().max(20).regex(/^[0-9.]*$/),
  osCategory: z.enum(["Windows", "macOS", "Linux", "Android", "iOS", "Other"]),
  retryCount: z.number().int().min(0).max(5),
  requestDurationMs: z.number().int().min(0).max(120_000),
  online: z.boolean(),
  attemptedAction: z.enum(incidentAttemptedActions),
  reproducibility: z.enum(incidentReproducibility),
  description: z.string().trim().max(500).optional().default(""),
  diagnosticsConsent: z.literal(true),
}).strict();

export type IncidentReportInput = z.infer<typeof incidentReportSchema>;

export type IncidentRecord = Omit<IncidentReportInput, "diagnosticsConsent" | "description"> & {
  id: string;
  fingerprint: string;
  reporterKey: string;
  description: string;
  status: IncidentStatus;
  reportCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  retryResult: "not_attempted" | "failed" | "recovered";
};

type IncidentStoreFile = { version: 1; incidents: Record<string, IncidentRecord> };

export interface IncidentStoreAdapter {
  report(reporterKey: string, input: IncidentReportInput): Promise<IncidentRecord>;
  list(limit: number): Promise<IncidentRecord[]>;
  updateStatus(id: string, status: IncidentStatus): Promise<IncidentRecord | null>;
}

function fingerprint(input: IncidentReportInput) {
  return createHash("sha256").update(JSON.stringify({
    deploymentVersion: input.deploymentVersion,
    routeCategory: input.routeCategory,
    feature: input.feature,
    errorCode: input.errorCode,
    httpStatus: input.httpStatus,
    modelClass: input.modelClass,
    webEnabled: input.webEnabled,
    ragEnabled: input.ragEnabled,
    planClass: input.planClass,
  })).digest("hex");
}

export function incidentReporterKey(identity: string) {
  return createHash("sha256").update(identity.trim().toLowerCase(), "utf8").digest("hex");
}

function createRecord(reporterKey: string, input: IncidentReportInput, recordedAt = new Date().toISOString()): IncidentRecord {
  const safeFingerprint = fingerprint(input);
  const { diagnosticsConsent: _diagnosticsConsent, description: _description, timestamp: _clientTimestamp, ...safeInput } = input;
  return {
    ...safeInput,
    timestamp: recordedAt,
    id: `inc_${safeFingerprint.slice(0, 20)}`,
    fingerprint: safeFingerprint,
    reporterKey,
    // Free text can contain legal facts even after pattern redaction. Accept it
    // for backwards-compatible clients, but never persist it in diagnostics.
    description: "",
    status: "new",
    reportCount: 1,
    firstSeenAt: recordedAt,
    lastSeenAt: recordedAt,
    retryResult: input.retryCount > 0 ? "failed" : "not_attempted",
  };
}

export function createLocalIncidentStore(filePath: string): IncidentStoreAdapter {
  let queue: Promise<void> = Promise.resolve();
  const locked = <T>(task: () => Promise<T>) => {
    const run = queue.then(task, task);
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
  const read = async (): Promise<IncidentStoreFile> => {
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as IncidentStoreFile;
      return parsed.version === 1 && parsed.incidents ? parsed : { version: 1, incidents: {} };
    } catch {
      return { version: 1, incidents: {} };
    }
  };
  const write = async (store: IncidentStoreFile) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, filePath);
  };
  return {
    report: (reporterKey, input) => locked(async () => {
      const store = await read();
      const incoming = createRecord(reporterKey, input);
      const existing = store.incidents[incoming.fingerprint];
      const duplicateSubmission = existing?.reporterKey === reporterKey && existing.requestId === input.requestId;
      const record = existing ? duplicateSubmission ? existing : {
        ...existing,
        reporterKey,
        reportCount: existing.reportCount + 1,
        lastSeenAt: incoming.lastSeenAt,
        timestamp: incoming.timestamp,
        requestId: input.requestId,
        retryCount: input.retryCount,
        retryResult: input.retryCount > 0 ? "failed" : existing.retryResult,
        requestDurationMs: input.requestDurationMs,
        online: input.online,
        status: existing.status === "resolved" || existing.status === "ignored" ? "new" : existing.status,
      } : incoming;
      store.incidents[incoming.fingerprint] = record;
      await write(store);
      return record;
    }),
    list: (limit) => locked(async () => Object.values((await read()).incidents)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, Math.max(1, Math.min(200, limit)))),
    updateStatus: (id, status) => locked(async () => {
      const store = await read();
      const entry = Object.entries(store.incidents).find(([, incident]) => incident.id === id);
      if (!entry) return null;
      const record = { ...entry[1], status };
      store.incidents[entry[0]] = record;
      await write(store);
      return record;
    }),
  };
}

function rowToIncident(row: Record<string, unknown>): IncidentRecord {
  return {
    id: String(row.id), fingerprint: String(row.fingerprint), reporterKey: String(row.reporter_key),
    requestId: String(row.request_id), timestamp: String(row.last_seen_at), deploymentVersion: String(row.deployment_version),
    frontendVersion: String(row.frontend_version), routeCategory: String(row.route_category) as IncidentRecord["routeCategory"], feature: String(row.feature) as IncidentRecord["feature"],
    errorCode: String(row.error_code), httpStatus: Number(row.http_status), modelClass: String(row.model_class) as IncidentRecord["modelClass"],
    webEnabled: Boolean(row.web_enabled), ragEnabled: Boolean(row.rag_enabled), planClass: String(row.plan_class) as IncidentRecord["planClass"],
    browserFamily: String(row.browser_family) as IncidentRecord["browserFamily"], browserVersion: String(row.browser_version), osCategory: String(row.os_category) as IncidentRecord["osCategory"],
    retryCount: Number(row.retry_count), requestDurationMs: Number(row.request_duration_ms), online: Boolean(row.online),
    attemptedAction: String(row.attempted_action) as IncidentRecord["attemptedAction"], reproducibility: String(row.reproducibility ?? "unknown") as IncidentRecord["reproducibility"], description: "", status: String(row.status) as IncidentStatus,
    reportCount: Number(row.report_count), firstSeenAt: String(row.first_seen_at), lastSeenAt: String(row.last_seen_at),
    retryResult: String(row.retry_result) as IncidentRecord["retryResult"],
  };
}

const supabaseIncidentStore: IncidentStoreAdapter = {
  async report(reporterKey, input) {
    const client = getSupabaseClient();
    if (!client) throw new Error("INCIDENT_STORE_NOT_CONFIGURED");
    const incoming = createRecord(reporterKey, input);
    const result = await client.rpc("legal_sathi_report_incident", { p_incident: {
      ...incoming,
      reporterKey: incoming.reporterKey,
    } });
    if (result.error || !result.data) throw new Error("INCIDENT_STORE_WRITE_FAILED");
    return rowToIncident(result.data as Record<string, unknown>);
  },
  async list(limit) {
    const client = getSupabaseClient();
    if (!client) throw new Error("INCIDENT_STORE_NOT_CONFIGURED");
    const result = await client.from("legal_sathi_incidents").select("*").order("last_seen_at", { ascending: false }).limit(Math.max(1, Math.min(200, limit)));
    if (result.error) throw new Error("INCIDENT_STORE_READ_FAILED");
    return (result.data ?? []).map((row) => rowToIncident(row as Record<string, unknown>));
  },
  async updateStatus(id, status) {
    const client = getSupabaseClient();
    if (!client) throw new Error("INCIDENT_STORE_NOT_CONFIGURED");
    const result = await client.from("legal_sathi_incidents").update({ status }).eq("id", id).select("*").maybeSingle();
    if (result.error) throw new Error("INCIDENT_STORE_WRITE_FAILED");
    return result.data ? rowToIncident(result.data as Record<string, unknown>) : null;
  },
};

let localStore: IncidentStoreAdapter | null = null;
export function getIncidentStore() {
  if (env.incidentStoreBackend === "local" && env.nodeEnv !== "production") {
    localStore ??= createLocalIncidentStore(path.resolve(process.cwd(), env.incidentStorePath));
    return localStore;
  }
  if (env.incidentStoreBackend === "supabase") return supabaseIncidentStore;
  throw new Error("INCIDENT_STORE_NOT_CONFIGURED");
}
