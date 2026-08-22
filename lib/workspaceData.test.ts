import assert from "node:assert/strict";

import type { BackendCase, BackendCaseDocument, BackendChat } from "./backendApi";
import type { CaseDocumentLoadResult } from "./caseDocumentHydration";
import { DEFAULT_REQUEST_CONFIGURATION } from "./requestSettings";
import {
  backendCaseToClient,
  documentToBackendChat,
  mergeBackendWorkspaceData,
} from "./workspaceData";

const caseRecord: BackendCase = {
  id: "case-1",
  title: "Consumer purchase preparation",
  case_type: "consumer",
  user_role: "normal",
  short_summary: "A fictional defective-product dispute.",
  important_facts: ["Order delivered late"],
  important_dates: ["2026-08-01"],
  parties: ["Buyer", "Seller"],
  relief_wanted: ["Prepare questions"],
  missing_information: ["Invoice date"],
  risk_flags: [],
  questions_for_user: ["What written record exists?"],
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-02T00:00:00.000Z",
  analysis_status: "pending",
};

const chat = (id: string, updatedAt: string, text: string): BackendChat => ({
  id,
  title: "Consumer preparation",
  messages: [{ role: "user", text }],
  caseId: "case-1",
  requestConfiguration: DEFAULT_REQUEST_CONFIGURATION,
  webEnabled: false,
  attachments: [],
  contextSummary: "Synthetic test summary",
  pinned: false,
  archived: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt,
  deletedAt: null,
});

const caseDocument: BackendCaseDocument = {
  id: "chat-new",
  caseId: "case-1",
  name: "fictional-invoice.txt",
  mimeType: "text/plain",
  size: 24,
  uploadedAt: 100,
  extractedText: "Synthetic invoice text",
  extractionStatus: "complete",
  category: "Other",
  categorySource: "none",
  annotations: [],
  contentAvailable: true,
};

const documentResults: CaseDocumentLoadResult[] = [{
  caseId: "case-1",
  documents: [caseDocument],
  failed: false,
}];

const merged = mergeBackendWorkspaceData(
  [caseRecord],
  [chat("chat-old", "2026-08-02T01:00:00.000Z", "Older question"), chat("chat-new", "2026-08-02T02:00:00.000Z", "Latest question")],
  documentResults,
);

assert.equal(merged.cases.length, 1);
assert.equal(merged.cases[0].aiAnalysisPending, true);
assert.equal(merged.cases[0].documentLoadStatus, "available");
assert.deepEqual(merged.cases[0].documentIds, ["chat-new"]);
assert.equal(merged.cases[0].conversationId, "chat-new", "The newest linked chat should restore as the case conversation.");
assert.equal(merged.cases[0].conversationHistory?.[0].text, "Latest question");

const linkedDocument = merged.documents.find((document) => document.id === "chat-new");
assert.ok(linkedDocument, "The linked document should remain visible after chat hydration.");
assert.equal(linkedDocument.extractedText, "Synthetic invoice text");
assert.equal(linkedDocument.chatHistory[0].text, "Latest question", "Chat history should be retained when a document also owns the chat id.");

const clientCase = backendCaseToClient(caseRecord);
assert.equal(clientCase.preparation?.summary, "A fictional defective-product dispute.");

const backendInput = documentToBackendChat({
  id: "draft-1",
  name: "Draft question",
  uploadedAt: 1,
  chatHistory: [{ role: "user", text: "What should I ask first?" }],
});
assert.equal(backendInput.requestConfiguration, DEFAULT_REQUEST_CONFIGURATION);
assert.equal(backendInput.webEnabled, false);
assert.deepEqual(backendInput.attachments, []);

process.stdout.write("Workspace data projection contract passed: 14/14\n");
