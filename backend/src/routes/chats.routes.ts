import { Router } from "express";
import { requireActiveOnlineAccount } from "../middleware/accountAccess.middleware";
import { getVerifiedUser } from "../middleware/identity.middleware";
import { chatOwnerKey, chatUpdateSchema, chatUpsertSchema, getChatStore, type ChatRecord } from "../services/chats/chatStore.service";
import { requireCurrentTermsConsent } from "../middleware/consent.middleware";

export const chatRoutes = Router();
chatRoutes.use(requireActiveOnlineAccount, requireCurrentTermsConsent);

function safeChat(record: ChatRecord) {
  const { ownerKey: _ownerKey, memoryState: _memoryState, ...safe } = record;
  return safe;
}

function storeUnavailable(response: import("express").Response) {
  response.status(503).json({ ok: false, error: "CHAT_STORE_UNAVAILABLE", message: "Chat history is temporarily unavailable.", requestId: response.locals.requestId });
}

chatRoutes.get("/", async (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 120) : "";
  const offset = Math.max(0, Math.min(10_000, Number(request.query.cursor ?? 0) || 0));
  const limit = Math.max(1, Math.min(50, Number(request.query.limit ?? 25) || 25));
  try {
    const ownerKey = chatOwnerKey(getVerifiedUser(response));
    const result = await getChatStore().list(ownerKey, {
      query,
      includeArchived: request.query.archived === "true",
      includeDeleted: request.query.deleted === "true",
      offset,
      limit,
    });
    response.json({ ok: true, chats: result.chats.map(safeChat), nextCursor: result.nextOffset === null ? null : String(result.nextOffset), requestId: response.locals.requestId });
  } catch {
    storeUnavailable(response);
  }
});

chatRoutes.post("/", async (request, response) => {
  const parsed = chatUpsertSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ ok: false, error: "INVALID_CHAT_RECORD", message: "The chat history payload was invalid or too large.", requestId: response.locals.requestId });
    return;
  }
  try {
    const chat = await getChatStore().upsert(chatOwnerKey(getVerifiedUser(response)), parsed.data);
    response.status(201).json({ ok: true, chat: safeChat(chat), requestId: response.locals.requestId });
  } catch {
    storeUnavailable(response);
  }
});

chatRoutes.delete("/", async (_request, response) => {
  try {
    const deletedCount = await getChatStore().softDeleteAll(chatOwnerKey(getVerifiedUser(response)));
    response.json({ ok: true, deletedCount, requestId: response.locals.requestId });
  } catch {
    storeUnavailable(response);
  }
});

chatRoutes.patch("/:chatId", async (request, response) => {
  const id = String(request.params.chatId ?? "");
  const parsed = chatUpdateSchema.safeParse(request.body);
  if (!zUuid(id) || !parsed.success) {
    response.status(400).json({ ok: false, error: "INVALID_CHAT_UPDATE", message: "Choose a valid chat update.", requestId: response.locals.requestId });
    return;
  }
  try {
    const chat = await getChatStore().update(chatOwnerKey(getVerifiedUser(response)), id, parsed.data);
    if (!chat) {
      response.status(404).json({ ok: false, error: "CHAT_NOT_FOUND", message: "Chat not found.", requestId: response.locals.requestId });
      return;
    }
    response.json({ ok: true, chat: safeChat(chat), requestId: response.locals.requestId });
  } catch {
    storeUnavailable(response);
  }
});

chatRoutes.delete("/:chatId", async (request, response) => {
  const id = String(request.params.chatId ?? "");
  if (!zUuid(id)) {
    response.status(400).json({ ok: false, error: "INVALID_CHAT_ID", message: "Choose a valid chat.", requestId: response.locals.requestId });
    return;
  }
  try {
    const chat = await getChatStore().softDelete(chatOwnerKey(getVerifiedUser(response)), id);
    if (!chat) {
      response.status(404).json({ ok: false, error: "CHAT_NOT_FOUND", message: "Chat not found.", requestId: response.locals.requestId });
      return;
    }
    response.json({ ok: true, chat: safeChat(chat), requestId: response.locals.requestId });
  } catch {
    storeUnavailable(response);
  }
});

chatRoutes.post("/:chatId/restore", async (request, response) => {
  const id = String(request.params.chatId ?? "");
  if (!zUuid(id)) {
    response.status(400).json({ ok: false, error: "INVALID_CHAT_ID", message: "Choose a valid chat.", requestId: response.locals.requestId });
    return;
  }
  try {
    const chat = await getChatStore().restore(chatOwnerKey(getVerifiedUser(response)), id);
    if (!chat) {
      response.status(404).json({ ok: false, error: "CHAT_NOT_FOUND", message: "Chat not found.", requestId: response.locals.requestId });
      return;
    }
    response.json({ ok: true, chat: safeChat(chat), requestId: response.locals.requestId });
  } catch {
    storeUnavailable(response);
  }
});

function zUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
