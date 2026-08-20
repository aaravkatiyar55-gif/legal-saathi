import assert from "node:assert/strict";

import { translateUiText } from ".";
import { GUIDED_WORKSPACE_FLOWS } from "../guidedWorkspaceFlows";

const publicWorkspaceStrings = [
  "Type a legal question, upload a document, or do both.",
  "Professional legal AI workspace",
  "Legal help, grounded in context",
  "What legal matter should we work through?",
  "Upload a document for grounded analysis, ask a question directly, or combine both in one request.",
  "Guided legal workflows",
  "Upload legal document",
  "Attach a legal document",
  "Attached to this prompt",
  "Optional, but recommended for document-specific analysis",
  "Remove selected document",
  "Browse document",
  "Ask a legal question or instruction",
  "Ask a legal question, for example: What should I check before signing a rental agreement?",
  "View upgrade plans",
  "Checking plan...",
  "Check previous response",
  "Start a new request",
  "Refresh status",
  "Share only what is necessary for your question. Do not include passwords, bank or card details, or government identity numbers.",
  "Legal Saathi provides AI-assisted legal information and may make mistakes. Verify important decisions, documents, and deadlines.",
  ...GUIDED_WORKSPACE_FLOWS.flatMap((flow) => [flow.label, flow.description]),
];

let assertions = 0;
const missing: string[] = [];
for (const language of ["hi", "hinglish"] as const) {
  for (const source of publicWorkspaceStrings) {
    const translated = translateUiText(source, language);
    if (translated === source) missing.push(`${language}: ${source}`);
    assertions += 1;
  }
}

assert.deepEqual(missing, [], `Public-workspace copy must be localized:\n${missing.join("\n")}`);
console.info(`Public workspace localization coverage: PASS ${assertions}/${assertions}`);
