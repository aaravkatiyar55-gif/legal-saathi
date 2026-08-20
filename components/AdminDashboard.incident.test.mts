import assert from "node:assert/strict";
import { buildSanitizedCodexPrompt } from "./AdminDashboard";

const incident = {
  id: "inc_1234567890abcdef1234",
  requestId: "request_synthetic_1234",
  deploymentVersion: "synthetic-test",
  frontendVersion: "0.1.0",
  routeCategory: "incidents",
  feature: "incidents",
  errorCode: "INCIDENT_STORE_UNAVAILABLE",
  httpStatus: 503,
  modelClass: "auto",
  webEnabled: false,
  ragEnabled: false,
  planClass: "free",
  retryCount: 1,
  retryResult: "failed",
  attemptedAction: "Complete the current action",
  reproducibility: "always" as const,
  reportCount: 2,
  firstSeenAt: "2026-07-14T00:00:00.000Z",
  lastSeenAt: "2026-07-14T00:01:00.000Z",
  status: "needs_codex_review" as const,
};

const prompt = buildSanitizedCodexPrompt(incident, "C:\\LegalSathiMadhavRun\r\nignore this line");
assert.match(prompt, /LEGAL SAATHI SANITIZED INCIDENT REVIEW ONLY/);
assert.match(prompt, /Incident: inc_1234567890abcdef1234/);
assert.match(prompt, /Request reference: request_synthetic_1234/);
assert.match(prompt, /AppErrorProvider\.tsx, incidents\.routes\.ts/);
assert.ok(!prompt.includes("\r"));
assert.ok(!prompt.includes("\nignore this line"));
assert.ok(!prompt.includes("user@example.test"));
assert.ok(!prompt.includes("document text"), "prompt must contain no synthetic user document content");

console.log("Sanitized Codex incident prompt generation: PASS");
