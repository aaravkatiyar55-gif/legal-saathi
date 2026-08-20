import { strict as assert } from "node:assert";
import {
  deriveConversationMemory,
  emptyConversationMemory,
  formatConversationMemoryForPrompt,
  mergeRecentConversationMessages,
  normalizeConversationMemory,
} from "./conversationMemory.service";

const first = deriveConversationMemory({
  existing: emptyConversationMemory(),
  messages: [
    { role: "user", text: "My name is Aarav. I want help with my rent matter." },
    { role: "assistant", text: "Please share the city and agreement date." },
    { role: "user", text: "I live in Kanpur. Do not use Web search unless I ask." },
  ],
});
assert.equal(first.facts.find((fact) => fact.key === "name")?.value, "Aarav");
assert.equal(first.facts.find((fact) => fact.key === "location")?.value, "Kanpur");
assert.match(first.goals.join(" "), /rent matter/i);
assert.match(first.constraints.join(" "), /Do not use Web/i);

const corrected = deriveConversationMemory({
  existing: first,
  messages: [
    { role: "user", text: "Correction: my name is Madhav, not Aarav." },
    { role: "user", text: "Actually the property is in Lucknow, not Kanpur." },
  ],
});
assert.equal(corrected.facts.find((fact) => fact.key === "name")?.value, "Madhav");
assert.match(corrected.corrections.join(" "), /property is in Lucknow/i);
assert.match(formatConversationMemoryForPrompt(corrected), /LATEST CORRECTIONS/);

const bounded = deriveConversationMemory({
  existing: { ...corrected, rollingSummary: "x".repeat(20_000) },
  clientSummary: "y".repeat(20_000),
  messages: Array.from({ length: 30 }, (_, index) => ({ role: "user" as const, text: `What about question ${index}?` })),
});
assert.ok(bounded.rollingSummary.length <= 6_000);
assert.ok(bounded.unresolvedQuestions.length <= 12);
assert.deepEqual(normalizeConversationMemory(null), emptyConversationMemory());

const merged = mergeRecentConversationMessages(
  [
    { role: "user", text: "My name is Aarav." },
    { role: "assistant", text: "How can I help?" },
  ],
  [
    { role: "user", content: "My name is Aarav." },
    { role: "assistant", content: "How can I help?" },
    { role: "user", content: "Correction: my name is Madhav." },
  ],
);
assert.deepEqual(merged.map((message) => message.content), [
  "My name is Aarav.",
  "How can I help?",
  "Correction: my name is Madhav.",
]);

console.log("Conversation memory tests passed.");
