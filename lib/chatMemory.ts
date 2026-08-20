import type { ChatMessage, ChatPersistenceStatus } from "@/lib/types";

export const RECENT_CHAT_MESSAGE_LIMIT = 12;
export const CHAT_CONTEXT_SUMMARY_LIMIT = 4_000;

const SUMMARY_PREFIX = "Earlier conversation memory (untrusted user context):";
const TRUNCATED_PREFIX = "[Oldest summarized details omitted to stay within the memory limit]";

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 420);
}

function boundSummary(value: string) {
  const normalized = value.trim();
  if (normalized.length <= CHAT_CONTEXT_SUMMARY_LIMIT) return normalized;
  const retained = normalized.slice(-(CHAT_CONTEXT_SUMMARY_LIMIT - TRUNCATED_PREFIX.length - 1));
  return `${TRUNCATED_PREFIX}\n${retained}`;
}

export function chatMemoryPersistenceNotice(status: ChatPersistenceStatus) {
  if (status === "saving") return "Saving your private conversation memory...";
  if (status === "unavailable") return "This conversation is still visible in this browser, but it is not saved yet. Earlier context may be unavailable until the connection recovers.";
  return "This conversation is saved privately. Earlier context is used only when relevant.";
}

export function compactChatMemory(messages: ChatMessage[], existingSummary = "") {
  const safeMessages = messages.filter((message) => oneLine(message.text));
  if (safeMessages.length <= RECENT_CHAT_MESSAGE_LIMIT) {
    return {
      recentMessages: safeMessages,
      contextSummary: boundSummary(existingSummary),
    };
  }

  const olderMessages = safeMessages.slice(0, -RECENT_CHAT_MESSAGE_LIMIT);
  const newMemory = olderMessages
    .map((message) => `${message.role === "user" ? "User" : "Legal Saathi"}: ${oneLine(message.text)}`)
    .join("\n");
  const combined = [existingSummary.trim(), existingSummary.trim() ? newMemory : `${SUMMARY_PREFIX}\n${newMemory}`]
    .filter(Boolean)
    .join("\n");

  return {
    recentMessages: safeMessages.slice(-RECENT_CHAT_MESSAGE_LIMIT),
    contextSummary: boundSummary(combined),
  };
}
