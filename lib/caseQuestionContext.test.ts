import assert from "node:assert/strict";
import { createCaseQuestionChatContext } from "./caseQuestionContext";

const context = createCaseQuestionChatContext({
  chatId: "synthetic-chat",
  caseId: "synthetic-case",
  caseName: "Synthetic case",
  scope: "document",
  selectedDocumentId: "synthetic-document",
  documents: [{ id: "synthetic-document", name: "synthetic.txt", text: "Synthetic text" }],
  contextSummary: `Earlier conversation: ${"memory ".repeat(900)}`,
  language: "hinglish",
});

assert.equal(context.termsAccepted, true);
assert.equal(context.chatId, "synthetic-chat");
assert.equal(context.caseId, "synthetic-case");
assert.equal(context.selectedDocumentId, "synthetic-document");
assert.equal(context.language, "hinglish");
assert.ok(context.contextSummary?.startsWith("Earlier conversation:"));
assert.ok((context.contextSummary?.length ?? 0) <= 4_000);
console.log("Case-question chat memory context: PASS 6/6");
