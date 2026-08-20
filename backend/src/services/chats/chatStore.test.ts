import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { chatOwnerKey, chatUpsertSchema, createLocalChatStore } from "./chatStore.service";

async function run() {
  const filePath = path.resolve(process.cwd(), "security-audit", "test-data", "chat-store-test.json");
  await fs.rm(filePath, { force: true });
  const store = createLocalChatStore(filePath);
  const ownerA = chatOwnerKey({ email: "first@example.test", subject: "subject-a" });
  const ownerB = chatOwnerKey({ email: "second@example.test", subject: "subject-b" });
  const input = chatUpsertSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    title: "Synthetic tenancy question",
    messages: [{ role: "user", text: "Synthetic question" }, { role: "assistant", text: "Synthetic answer" }],
    requestConfiguration: { model: "auto", thinkingMode: "standard", speed: "normal" },
    webEnabled: false,
    attachments: [],
    contextSummary: "Earlier conversation memory: synthetic tenancy facts.",
    pinned: false,
    archived: false,
  });

  const created = await store.upsert(ownerA, input);
  assert.equal(created.ownerKey, ownerA);
  assert.equal(created.contextSummary, input.contextSummary);
  assert.match(created.memoryState.rollingSummary, /synthetic tenancy facts/i);
  assert.equal((await store.list(ownerA, { offset: 0, limit: 10 })).chats.length, 1);
  assert.equal((await store.list(ownerB, { offset: 0, limit: 10 })).chats.length, 0, "second user must not see first user's chat");
  assert.equal(await store.get(ownerB, input.id), null, "second user must not load first user's chat memory");
  await assert.rejects(() => store.upsert(ownerB, input), /CHAT_OWNERSHIP_MISMATCH/);

  const corrected = await store.upsert(ownerA, {
    ...input,
    messages: [...input.messages, { role: "user", text: "Correction: the property is in Lucknow, not Kanpur." }],
  });
  assert.match(corrected.memoryState.corrections.join(" "), /property is in Lucknow/i);
  assert.match((await store.get(ownerA, input.id))?.memoryState.corrections.join(" ") ?? "", /property is in Lucknow/i);

  const updated = await store.update(ownerA, input.id, { title: "Renamed synthetic chat", pinned: true });
  assert.equal(updated?.title, "Renamed synthetic chat");
  assert.equal(updated?.pinned, true);
  assert.equal((await store.list(ownerA, { query: "renamed", offset: 0, limit: 10 })).chats.length, 1);

  await store.update(ownerA, input.id, { archived: true });
  assert.equal((await store.list(ownerA, { offset: 0, limit: 10 })).chats.length, 0);
  assert.equal((await store.list(ownerA, { includeArchived: true, offset: 0, limit: 10 })).chats.length, 1);

  await store.softDelete(ownerA, input.id);
  assert.equal((await store.list(ownerA, { includeArchived: true, offset: 0, limit: 10 })).chats.length, 0);
  assert.equal((await store.list(ownerA, { includeArchived: true, includeDeleted: true, offset: 0, limit: 10 })).chats.length, 1);
  assert.ok(await store.restore(ownerA, input.id));
  assert.equal((await store.list(ownerA, { offset: 0, limit: 10 })).chats.length, 1);

  const secondInput = { ...input, id: "22222222-2222-4222-8222-222222222222", title: "Second owner A chat" };
  const outsiderInput = { ...input, id: "33333333-3333-4333-8333-333333333333", title: "Owner B chat" };
  await store.upsert(ownerA, secondInput);
  await store.upsert(ownerB, outsiderInput);
  assert.equal(await store.softDeleteAll(ownerA), 2);
  assert.equal((await store.list(ownerA, { includeArchived: true, offset: 0, limit: 10 })).chats.length, 0);
  assert.equal((await store.list(ownerA, { includeArchived: true, includeDeleted: true, offset: 0, limit: 10 })).chats.length, 2);
  assert.equal((await store.list(ownerB, { offset: 0, limit: 10 })).chats.length, 1, "bulk deletion must remain owner scoped");

  await assert.rejects(() => chatUpsertSchema.parseAsync({ ...input, messages: [{ role: "user", text: "x".repeat(8_001) }] }));
  await assert.rejects(() => chatUpsertSchema.parseAsync({ ...input, unexpected: "unsafe" }));
  const persisted = await fs.readFile(filePath, "utf8");
  assert.ok(!persisted.includes("first@example.test"));
  assert.ok(!persisted.includes("second@example.test"));
  await fs.rm(filePath, { force: true });
  console.log("Owner-scoped chat persistence, rename/search/pin/archive/delete/restore, bounds, and local serialization: PASS");
}

void run();
