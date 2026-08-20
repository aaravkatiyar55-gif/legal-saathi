import assert from "node:assert/strict";
import { hydrateCaseDocuments } from "./caseDocumentHydration";
import type { BackendCaseDocument } from "./backendApi";
import type { CaseData } from "./types";

const baseCase = (id: string): CaseData => ({
  id,
  name: `Case ${id}`,
  createdAt: 1,
  documentIds: [],
});

const document = (id: string, caseId: string): BackendCaseDocument => ({
  id,
  caseId,
  name: `${id}.txt`,
  mimeType: "text/plain",
  size: 8,
  uploadedAt: 2,
  extractedText: "Persisted document text",
  extractionStatus: "complete",
  category: "Other",
  categorySource: "none",
  annotations: [{
    id: "annotation-0001",
    documentId: id,
    selectedText: "Persisted document text",
    comment: "Persisted annotation",
    createdAt: 3,
  }],
  contentAvailable: true,
});

const restored = hydrateCaseDocuments(
  [baseCase("case-one"), baseCase("case-two")],
  [
    { caseId: "case-one", documents: [document("doc-one", "case-one"), document("doc-one", "case-one"), document("foreign", "case-two")], failed: false },
    { caseId: "case-two", documents: [], failed: true },
  ],
);

assert.deepEqual(restored.cases[0].documentIds, ["doc-one"]);
assert.equal(restored.cases[0].documentLoadStatus, "available");
assert.deepEqual(restored.cases[1].documentIds, []);
assert.equal(restored.cases[1].documentLoadStatus, "failed");
assert.deepEqual(restored.documents.map((item) => item.id), ["doc-one"]);
assert.equal(restored.documents[0].extractedText, "Persisted document text");
assert.equal(restored.documents[0].annotations?.[0].comment, "Persisted annotation");

const empty = hydrateCaseDocuments(
  [baseCase("case-empty")],
  [{ caseId: "case-empty", documents: [], failed: false }],
);
assert.equal(empty.cases[0].documentLoadStatus, "empty");

console.log("Case document hydration checks passed (10/10).");
