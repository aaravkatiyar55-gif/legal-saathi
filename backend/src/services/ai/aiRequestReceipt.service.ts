import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/env";
import { getSupabaseClient } from "../supabase/supabaseClient";

const receiptTable = "legal_sathi_ai_request_receipts";
const ownerKeyPattern = /^[a-f0-9]{64}$/;
const requestIdPattern = /^[A-Za-z0-9_-]{8,120}$/;
const requestFingerprintPattern = /^[a-f0-9]{64}$/;
const maximumPayloadBytes = 120_000;

export type CompletedAiRequestReceipt = {
  ownerKey: string;
  requestId: string;
  requestFingerprint: string;
  payload: Record<string, unknown>;
  expiresAt: string;
};

type LocalReceiptFile = {
  version: 1;
  receipts: Record<string, CompletedAiRequestReceipt>;
};

export type AiRequestReceiptStore = {
  read(ownerKey: string, requestId: string): Promise<CompletedAiRequestReceipt | null>;
  save(input: { ownerKey: string; requestId: string; requestFingerprint: string; payload: Record<string, unknown>; ttlSeconds: number }): Promise<void>;
};

export class AiRequestReceiptUnavailableError extends Error {
  constructor() {
    super("AI request recovery storage is unavailable.");
  }
}

export function isAiRequestReceiptPrimaryKeyConflict(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "23505";
}

function receiptKey(ownerKey: string, requestId: string) {
  return `${ownerKey}:${requestId}`;
}

function requireOwnerKey(value: string) {
  if (!ownerKeyPattern.test(value)) throw new AiRequestReceiptUnavailableError();
  return value;
}

function requireRequestId(value: string) {
  if (!requestIdPattern.test(value)) throw new AiRequestReceiptUnavailableError();
  return value;
}

function requireRequestFingerprint(value: string) {
  if (!requestFingerprintPattern.test(value)) throw new AiRequestReceiptUnavailableError();
  return value;
}

function clonePayload(value: Record<string, unknown>) {
  const serialized = JSON.stringify(value);
  if (!serialized || Buffer.byteLength(serialized, "utf8") > maximumPayloadBytes) throw new AiRequestReceiptUnavailableError();
  const parsed = JSON.parse(serialized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new AiRequestReceiptUnavailableError();
  return parsed as Record<string, unknown>;
}

function validateTtl(value: number) {
  if (!Number.isInteger(value) || value < 60 || value > 3_600) throw new AiRequestReceiptUnavailableError();
  return value;
}

function defaultLocalFile(): LocalReceiptFile {
  return { version: 1, receipts: {} };
}

async function readLocalFile(filePath: string): Promise<LocalReceiptFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as Partial<LocalReceiptFile>;
    return { version: 1, receipts: parsed.receipts && typeof parsed.receipts === "object" ? parsed.receipts : {} };
  } catch {
    return defaultLocalFile();
  }
}

async function writeLocalFile(filePath: string, value: LocalReceiptFile) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, filePath);
}

function cloneReceipt(value: CompletedAiRequestReceipt): CompletedAiRequestReceipt {
  return {
    ownerKey: requireOwnerKey(value.ownerKey),
    requestId: requireRequestId(value.requestId),
    requestFingerprint: requireRequestFingerprint(value.requestFingerprint),
    payload: clonePayload(value.payload),
    expiresAt: String(value.expiresAt),
  };
}

function pruneExpired(receipts: Record<string, CompletedAiRequestReceipt>, now = Date.now()) {
  for (const [key, receipt] of Object.entries(receipts)) {
    if (!receipt || new Date(receipt.expiresAt).getTime() <= now) delete receipts[key];
  }
}

export function createLocalAiRequestReceiptStore(filePath: string): AiRequestReceiptStore {
  let queue: Promise<void> = Promise.resolve();
  const locked = <T>(task: () => Promise<T>) => {
    const run = queue.then(task, task);
    queue = run.then(() => undefined, () => undefined);
    return run;
  };

  return {
    read(ownerKeyValue, requestIdValue) {
      const ownerKey = requireOwnerKey(ownerKeyValue);
      const requestId = requireRequestId(requestIdValue);
      return locked(async () => {
        const state = await readLocalFile(filePath);
        pruneExpired(state.receipts);
        const receipt = state.receipts[receiptKey(ownerKey, requestId)];
        await writeLocalFile(filePath, state);
        return receipt ? cloneReceipt(receipt) : null;
      });
    },
    save(input) {
      const ownerKey = requireOwnerKey(input.ownerKey);
      const requestId = requireRequestId(input.requestId);
      const requestFingerprint = requireRequestFingerprint(input.requestFingerprint);
      const payload = clonePayload(input.payload);
      const ttlSeconds = validateTtl(input.ttlSeconds);
      return locked(async () => {
        const state = await readLocalFile(filePath);
        pruneExpired(state.receipts);
        const existing = state.receipts[receiptKey(ownerKey, requestId)];
        if (existing && existing.requestFingerprint !== requestFingerprint) {
          throw new AiRequestReceiptUnavailableError();
        }
        if (existing) return;
        state.receipts[receiptKey(ownerKey, requestId)] = {
          ownerKey,
          requestId,
          requestFingerprint,
          payload,
          expiresAt: new Date(Date.now() + ttlSeconds * 1_000).toISOString(),
        };
        await writeLocalFile(filePath, state);
      });
    },
  };
}

function createSupabaseAiRequestReceiptStore(): AiRequestReceiptStore {
  const client = getSupabaseClient();
  if (!client) throw new AiRequestReceiptUnavailableError();

  return {
    async read(ownerKeyValue, requestIdValue) {
      const ownerKey = requireOwnerKey(ownerKeyValue);
      const requestId = requireRequestId(requestIdValue);
      const now = new Date().toISOString();
      const cleanup = await client.from(receiptTable).delete().lt("expires_at", now);
      if (cleanup.error) throw new AiRequestReceiptUnavailableError();
      const result = await client
        .from(receiptTable)
        .select("owner_key,request_id,request_fingerprint,response_payload,expires_at")
        .eq("owner_key", ownerKey)
        .eq("request_id", requestId)
        .gt("expires_at", now)
        .maybeSingle();
      if (result.error) throw new AiRequestReceiptUnavailableError();
      if (!result.data?.response_payload || typeof result.data.response_payload !== "object" || Array.isArray(result.data.response_payload)) return null;
      return cloneReceipt({
        ownerKey: String(result.data.owner_key),
        requestId: String(result.data.request_id),
        requestFingerprint: String(result.data.request_fingerprint),
        payload: result.data.response_payload as Record<string, unknown>,
        expiresAt: String(result.data.expires_at),
      });
    },
    async save(input) {
      const ownerKey = requireOwnerKey(input.ownerKey);
      const requestId = requireRequestId(input.requestId);
      const requestFingerprint = requireRequestFingerprint(input.requestFingerprint);
      const payload = clonePayload(input.payload);
      const ttlSeconds = validateTtl(input.ttlSeconds);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1_000).toISOString();
      const cleanup = await client.from(receiptTable).delete().lt("expires_at", now.toISOString());
      if (cleanup.error) throw new AiRequestReceiptUnavailableError();
      const existing = await client
        .from(receiptTable)
        .select("request_fingerprint")
        .eq("owner_key", ownerKey)
        .eq("request_id", requestId)
        .maybeSingle();
      if (existing.error) throw new AiRequestReceiptUnavailableError();
      if (existing.data) {
        if (String(existing.data.request_fingerprint) !== requestFingerprint) throw new AiRequestReceiptUnavailableError();
        return;
      }
      const result = await client.from(receiptTable).insert({
        owner_key: ownerKey,
        request_id: requestId,
        request_fingerprint: requestFingerprint,
        response_payload: payload,
        created_at: now.toISOString(),
        expires_at: expiresAt,
      });
      if (!result.error) return;
      if (!isAiRequestReceiptPrimaryKeyConflict(result.error)) {
        throw new AiRequestReceiptUnavailableError();
      }

      // Separate backend instances can complete the same idempotent request
      // at nearly the same time. The primary key is authoritative: re-read
      // its receipt and accept only the identical request fingerprint.
      const raced = await client
        .from(receiptTable)
        .select("request_fingerprint")
        .eq("owner_key", ownerKey)
        .eq("request_id", requestId)
        .maybeSingle();
      if (raced.error || !raced.data || String(raced.data.request_fingerprint) !== requestFingerprint) {
        throw new AiRequestReceiptUnavailableError();
      }
    },
  };
}

let localStore: AiRequestReceiptStore | null = null;

function getStore() {
  if (env.aiRequestReceiptBackend === "local" && env.nodeEnv !== "production") {
    localStore ??= createLocalAiRequestReceiptStore(path.resolve(process.cwd(), env.aiRequestReceiptPath));
    return localStore;
  }
  if (env.aiRequestReceiptBackend === "supabase") return createSupabaseAiRequestReceiptStore();
  throw new AiRequestReceiptUnavailableError();
}

export async function readCompletedAiRequestReceipt(ownerKey: string, requestId: string) {
  if (!env.aiRequestReceiptEnabled) return null;
  return getStore().read(ownerKey, requestId);
}

export async function saveCompletedAiRequestReceipt(input: { ownerKey: string; requestId: string; requestFingerprint: string; payload: Record<string, unknown> }) {
  if (!env.aiRequestReceiptEnabled) return;
  await getStore().save({ ...input, ttlSeconds: env.aiRequestReceiptTtlSeconds });
}
