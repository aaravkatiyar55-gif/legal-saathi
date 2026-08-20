import assert from "node:assert/strict";
import { CHAT_CONTEXT_SUMMARY_LIMIT, chatMemoryPersistenceNotice, compactChatMemory, RECENT_CHAT_MESSAGE_LIMIT } from "./chatMemory";
import type { ChatMessage } from "./types";

const messages: ChatMessage[] = Array.from({ length: 15 }, (_, index) => ({
  role: index % 2 === 0 ? "user" : "assistant",
  text: `message ${index + 1}`,
}));

const first = compactChatMemory(messages);
assert.equal(first.recentMessages.length, RECENT_CHAT_MESSAGE_LIMIT);
assert.equal(first.recentMessages[0]?.text, "message 4");
assert.match(first.contextSummary, /User: message 1/);
assert.match(first.contextSummary, /Legal Saathi: message 2/);

const second = compactChatMemory([...first.recentMessages, { role: "assistant", text: "message 16" }], first.contextSummary);
assert.equal(second.recentMessages.length, RECENT_CHAT_MESSAGE_LIMIT);
assert.equal(second.recentMessages.at(-1)?.text, "message 16");
assert.equal((second.contextSummary.match(/User: message 1/g) ?? []).length, 1);
assert.match(second.contextSummary, /Legal Saathi: message 4/);

const bounded = compactChatMemory(
  Array.from({ length: 40 }, (_, index) => ({ role: "user" as const, text: `fact ${index} ${"x".repeat(500)}` })),
  "existing ".repeat(700),
);
assert.ok(bounded.contextSummary.length <= CHAT_CONTEXT_SUMMARY_LIMIT);
assert.equal(bounded.recentMessages.length, RECENT_CHAT_MESSAGE_LIMIT);

assert.equal(chatMemoryPersistenceNotice("saving"), "Saving your private conversation memory...");
assert.equal(chatMemoryPersistenceNotice("saved"), "This conversation is saved privately. Earlier context is used only when relevant.");
assert.equal(chatMemoryPersistenceNotice("unavailable"), "This conversation is still visible in this browser, but it is not saved yet. Earlier context may be unavailable until the connection recovers.");

console.log("Chat memory tests passed: recent turns stay verbatim and older context is bounded.");
