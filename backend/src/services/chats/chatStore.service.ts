import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "../../config/env";
import type { VerifiedUserIdentity } from "../../middleware/identity.middleware";
import { getSupabaseClient } from "../supabase/supabaseClient";
import {
  deriveConversationMemory,
  normalizeConversationMemory,
  type ConversationMemoryState,
} from "./conversationMemory.service";

const citationSchema = z.object({
  title: z.string().trim().min(1).max(240),
  url: z.string().url().max(2_048).optional(),
  excerpt: z.string().trim().max(600).optional(),
  authority: z.string().trim().max(160).optional(),
  retrievedAt: z.string().datetime().optional(),
}).strict();

const agentSchema = z.object({
  state: z.string().trim().min(1).max(80),
  publicStatus: z.string().trim().min(1).max(240),
  toolSummaries: z.array(z.string().trim().min(1).max(80)).max(12),
  requiresConfirmation: z.boolean().optional(),
}).strict();

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(8_000),
  citations: z.array(citationSchema).max(12).optional(),
  groundingStatus: z.enum(["grounded", "insufficient", "disabled", "unavailable"]).optional(),
  agent: agentSchema.optional(),
  isSuperseded: z.boolean().optional(),
}).strict();

const requestConfigurationSchema = z.object({
  model: z.enum(["auto", "fast", "flash", "pro", "ultra"]),
  thinkingMode: z.enum(["default", "standard", "extended", "complex"]).transform((value) => value === "complex" ? "extended" as const : value),
  speed: z.enum(["normal", "1.5x", "2x"]),
}).strict();

const attachmentSchema = z.object({
  documentId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(240).regex(/^[^\\/\u0000-\u001f]+$/),
  mimeType: z.string().trim().max(120),
  size: z.number().int().min(0).max(25 * 1024 * 1024),
}).strict();

export const chatUpsertSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  messages: z.array(messageSchema).max(80),
  caseId: z.string().uuid().optional(),
  requestConfiguration: requestConfigurationSchema,
  webEnabled: z.boolean().default(false),
  attachments: z.array(attachmentSchema).max(20).default([]),
  contextSummary: z.string().trim().max(4_000).default(""),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
}).strict().superRefine((input, context) => {
  const totalCharacters = input.messages.reduce((total, message) => total + message.text.length, 0) + input.contextSummary.length;
  if (totalCharacters > 160_000) context.addIssue({ code: z.ZodIssueCode.custom, message: "Chat content is too large." });
});

export const chatUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
}).strict().refine((input) => Object.keys(input).length > 0, "No chat changes supplied.");

export type ChatUpsertInput = z.infer<typeof chatUpsertSchema>;
export type ChatUpdateInput = z.infer<typeof chatUpdateSchema>;
export type ChatRecord = ChatUpsertInput & {
  ownerKey: string;
  memoryState: ConversationMemoryState;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type ChatStoreFile = { version: 1; chats: Record<string, ChatRecord> };
type ListOptions = { query?: string; includeArchived?: boolean; includeDeleted?: boolean; offset: number; limit: number };

export interface ChatStoreAdapter {
  list(ownerKey: string, options: ListOptions): Promise<{ chats: ChatRecord[]; nextOffset: number | null }>;
  get(ownerKey: string, id: string): Promise<ChatRecord | null>;
  upsert(ownerKey: string, input: ChatUpsertInput): Promise<ChatRecord>;
  update(ownerKey: string, id: string, input: ChatUpdateInput): Promise<ChatRecord | null>;
  softDelete(ownerKey: string, id: string): Promise<ChatRecord | null>;
  softDeleteAll(ownerKey: string): Promise<number>;
  restore(ownerKey: string, id: string): Promise<ChatRecord | null>;
}

export function chatOwnerKey(identity: Pick<VerifiedUserIdentity, "email" | "subject">) {
  const stableIdentity = identity.subject ? `subject:${identity.subject}` : `email:${identity.email.trim().toLowerCase()}`;
  return createHash("sha256").update(stableIdentity, "utf8").digest("hex");
}

function createLocalChatStore(filePath: string): ChatStoreAdapter {
  let queue: Promise<void> = Promise.resolve();
  const locked = <T>(task: () => Promise<T>) => {
    const run = queue.then(task, task);
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
  const read = async (): Promise<ChatStoreFile> => {
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as ChatStoreFile;
      return parsed.version === 1 && parsed.chats ? parsed : { version: 1, chats: {} };
    } catch {
      return { version: 1, chats: {} };
    }
  };
  const write = async (store: ChatStoreFile) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, filePath);
  };
  const owned = (store: ChatStoreFile, ownerKey: string, id: string) => {
    const chat = store.chats[id];
    return chat?.ownerKey === ownerKey ? chat : null;
  };
  return {
    list: (ownerKey, options) => locked(async () => {
      const store = await read();
      const query = options.query?.trim().toLowerCase() ?? "";
      const matching = Object.values(store.chats)
        .filter((chat) => chat.ownerKey === ownerKey)
        .filter((chat) => options.includeDeleted || !chat.deletedAt)
        .filter((chat) => options.includeArchived || !chat.archived)
        .filter((chat) => !query || chat.title.toLowerCase().includes(query))
        .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt));
      const chats = matching.slice(options.offset, options.offset + options.limit);
      const nextOffset = options.offset + chats.length < matching.length ? options.offset + chats.length : null;
      return { chats, nextOffset };
    }),
    get: (ownerKey, id) => locked(async () => {
      const store = await read();
      const chat = owned(store, ownerKey, id);
      if (!chat || chat.deletedAt) return null;
      return { ...chat, memoryState: normalizeConversationMemory(chat.memoryState) };
    }),
    upsert: (ownerKey, input) => locked(async () => {
      const store = await read();
      const existing = store.chats[input.id];
      if (existing && existing.ownerKey !== ownerKey) throw new Error("CHAT_OWNERSHIP_MISMATCH");
      const now = new Date().toISOString();
      const record: ChatRecord = {
        ...input,
        ownerKey,
        memoryState: deriveConversationMemory({
          existing: existing?.memoryState,
          messages: input.messages,
          clientSummary: input.contextSummary,
        }),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: existing?.deletedAt ?? null,
      };
      store.chats[input.id] = record;
      await write(store);
      return record;
    }),
    update: (ownerKey, id, input) => locked(async () => {
      const store = await read();
      const existing = owned(store, ownerKey, id);
      if (!existing || existing.deletedAt) return null;
      const record = { ...existing, ...input, updatedAt: new Date().toISOString() };
      store.chats[id] = record;
      await write(store);
      return record;
    }),
    softDelete: (ownerKey, id) => locked(async () => {
      const store = await read();
      const existing = owned(store, ownerKey, id);
      if (!existing || existing.deletedAt) return null;
      const now = new Date().toISOString();
      const record = { ...existing, deletedAt: now, updatedAt: now };
      store.chats[id] = record;
      await write(store);
      return record;
    }),
    softDeleteAll: (ownerKey) => locked(async () => {
      const store = await read();
      const now = new Date().toISOString();
      let changed = 0;
      for (const [id, existing] of Object.entries(store.chats)) {
        if (existing.ownerKey !== ownerKey || existing.deletedAt) continue;
        store.chats[id] = { ...existing, deletedAt: now, updatedAt: now };
        changed += 1;
      }
      if (changed > 0) await write(store);
      return changed;
    }),
    restore: (ownerKey, id) => locked(async () => {
      const store = await read();
      const existing = owned(store, ownerKey, id);
      if (!existing?.deletedAt) return null;
      const record = { ...existing, deletedAt: null, archived: false, updatedAt: new Date().toISOString() };
      store.chats[id] = record;
      await write(store);
      return record;
    }),
  };
}

function parseSupabaseRow(row: Record<string, unknown>): ChatRecord {
  const parsed = chatUpsertSchema.parse({
    id: row.id, title: row.title, messages: row.messages, caseId: row.case_id || undefined,
    requestConfiguration: row.request_configuration, webEnabled: row.web_enabled,
    attachments: row.attachments ?? [], contextSummary: row.context_summary ?? "",
    pinned: row.pinned, archived: row.archived,
  });
  return {
    ...parsed,
    ownerKey: String(row.owner_key),
    memoryState: normalizeConversationMemory(row.memory_state),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  };
}

const supabaseChatStore: ChatStoreAdapter = {
  async list(ownerKey, options) {
    const client = getSupabaseClient();
    if (!client) throw new Error("CHAT_STORE_NOT_CONFIGURED");
    let query = client.from("legal_sathi_chats").select("*").eq("owner_key", ownerKey);
    if (!options.includeDeleted) query = query.is("deleted_at", null);
    if (!options.includeArchived) query = query.eq("archived", false);
    if (options.query) query = query.ilike("title", `%${options.query.replace(/[%_]/g, "")}%`);
    const result = await query.order("pinned", { ascending: false }).order("updated_at", { ascending: false }).range(options.offset, options.offset + options.limit);
    if (result.error) throw new Error("CHAT_STORE_READ_FAILED");
    const rows = result.data ?? [];
    return { chats: rows.slice(0, options.limit).map((row) => parseSupabaseRow(row as Record<string, unknown>)), nextOffset: rows.length > options.limit ? options.offset + options.limit : null };
  },
  async get(ownerKey, id) {
    const client = getSupabaseClient();
    if (!client) throw new Error("CHAT_STORE_NOT_CONFIGURED");
    const result = await client.from("legal_sathi_chats")
      .select("*")
      .eq("id", id)
      .eq("owner_key", ownerKey)
      .is("deleted_at", null)
      .maybeSingle();
    if (result.error) throw new Error("CHAT_STORE_READ_FAILED");
    return result.data ? parseSupabaseRow(result.data as Record<string, unknown>) : null;
  },
  async upsert(ownerKey, input) {
    const client = getSupabaseClient();
    if (!client) throw new Error("CHAT_STORE_NOT_CONFIGURED");
    const existing = await client.from("legal_sathi_chats").select("owner_key,created_at,deleted_at,memory_state").eq("id", input.id).maybeSingle();
    if (existing.error) throw new Error("CHAT_STORE_READ_FAILED");
    if (existing.data && existing.data.owner_key !== ownerKey) throw new Error("CHAT_OWNERSHIP_MISMATCH");
    const now = new Date().toISOString();
    const row = {
      id: input.id, owner_key: ownerKey, title: input.title, messages: input.messages,
      case_id: input.caseId ?? null, request_configuration: input.requestConfiguration,
      web_enabled: input.webEnabled, attachments: input.attachments, context_summary: input.contextSummary,
      memory_state: deriveConversationMemory({
        existing: existing.data?.memory_state,
        messages: input.messages,
        clientSummary: input.contextSummary,
      }),
      pinned: input.pinned, archived: input.archived, deleted_at: existing.data?.deleted_at ?? null,
      created_at: existing.data?.created_at ?? now, updated_at: now,
    };
    const result = await client.from("legal_sathi_chats").upsert(row, { onConflict: "id" }).select("*").single();
    if (result.error || !result.data) throw new Error("CHAT_STORE_WRITE_FAILED");
    return parseSupabaseRow(result.data as Record<string, unknown>);
  },
  async update(ownerKey, id, input) {
    const result = await getSupabaseClient()?.from("legal_sathi_chats").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_key", ownerKey).is("deleted_at", null).select("*").maybeSingle();
    if (!result || result.error) throw new Error("CHAT_STORE_WRITE_FAILED");
    return result.data ? parseSupabaseRow(result.data as Record<string, unknown>) : null;
  },
  async softDelete(ownerKey, id) {
    const now = new Date().toISOString();
    const result = await getSupabaseClient()?.from("legal_sathi_chats").update({ deleted_at: now, updated_at: now }).eq("id", id).eq("owner_key", ownerKey).is("deleted_at", null).select("*").maybeSingle();
    if (!result || result.error) throw new Error("CHAT_STORE_WRITE_FAILED");
    return result.data ? parseSupabaseRow(result.data as Record<string, unknown>) : null;
  },
  async softDeleteAll(ownerKey) {
    const now = new Date().toISOString();
    const result = await getSupabaseClient()?.from("legal_sathi_chats")
      .update({ deleted_at: now, updated_at: now })
      .eq("owner_key", ownerKey)
      .is("deleted_at", null)
      .select("id");
    if (!result || result.error) throw new Error("CHAT_STORE_WRITE_FAILED");
    return result.data?.length ?? 0;
  },
  async restore(ownerKey, id) {
    const result = await getSupabaseClient()?.from("legal_sathi_chats").update({ deleted_at: null, archived: false, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_key", ownerKey).not("deleted_at", "is", null).select("*").maybeSingle();
    if (!result || result.error) throw new Error("CHAT_STORE_WRITE_FAILED");
    return result.data ? parseSupabaseRow(result.data as Record<string, unknown>) : null;
  },
};

let localStore: ChatStoreAdapter | null = null;
export function getChatStore() {
  if (env.chatStoreBackend === "local" && env.nodeEnv !== "production") {
    localStore ??= createLocalChatStore(path.resolve(process.cwd(), env.chatStorePath));
    return localStore;
  }
  if (env.chatStoreBackend === "supabase") return supabaseChatStore;
  throw new Error("CHAT_STORE_NOT_CONFIGURED");
}

export { createLocalChatStore };
