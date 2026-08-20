import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createLocalIncidentStore, incidentReportSchema, incidentReporterKey } from "./incident.service";

async function run() {
  const fixturePath = path.resolve(process.cwd(), "security-audit", "test-data", "incident-test.json");
  await fs.rm(fixturePath, { force: true });
  const store = createLocalIncidentStore(fixturePath);
  const input = incidentReportSchema.parse({
  requestId: "request_test_1234", timestamp: "2026-07-12T00:00:00.000Z", deploymentVersion: "local-test",
  frontendVersion: "0.1.0", routeCategory: "ai", feature: "chat", errorCode: "PROVIDER_UNAVAILABLE", httpStatus: 503,
  modelClass: "auto", webEnabled: false, ragEnabled: false, planClass: "free", browserFamily: "Chromium",
  browserVersion: "126.0", osCategory: "Windows", retryCount: 0, requestDurationMs: 1200, online: true,
  attemptedAction: "Send a legal information question", reproducibility: "always", description: "Contact me at user@example.test or 9876543210", diagnosticsConsent: true,
  });
  const reporter = incidentReporterKey("synthetic@example.test");
  const first = await store.report(reporter, input);
  const duplicate = await store.report(reporter, { ...input, timestamp: "2026-07-12T00:01:00.000Z" });
  assert.equal(duplicate.reportCount, 1, "same reporter and request ID must be idempotent");
  const second = await store.report(reporter, { ...input, requestId: "request_test_5678", timestamp: "2026-07-12T00:02:00.000Z" });
  assert.equal(first.id, second.id, "same safe technical fingerprint must group");
  assert.equal(second.reportCount, 2);
  assert.equal(second.description, "", "free text must never persist in the incident store");
  assert.equal((await store.updateStatus(first.id, "resolved"))?.status, "resolved");
  const recurrence = await store.report(reporter, { ...input, requestId: "request_test_9999", timestamp: "2026-07-12T00:03:00.000Z" });
  assert.equal(recurrence.status, "new", "a resolved fingerprint that recurs must reopen");
  const parallel = await Promise.all(Array.from({ length: 5 }, (_, index) => store.report(reporter, {
    ...input,
    requestId: `request_parallel_${index}`,
    timestamp: `2026-07-12T00:0${index + 4}:00.000Z`,
  })));
  assert.equal(parallel.at(-1)?.reportCount, 8, "serialized writes must not lose grouped reports");
  const otherPlan = await store.report(reporter, { ...input, requestId: "request_plus_1234", planClass: "plus" });
  assert.notEqual(otherPlan.id, first.id, "plan context is part of the safe fingerprint");
  assert.equal((await store.list(10)).length, 2);
  assert.equal((await store.updateStatus(first.id, "needs_codex_review"))?.status, "needs_codex_review");
  await assert.rejects(async () => incidentReportSchema.parseAsync({ ...input, diagnosticsConsent: false }));
  await assert.rejects(async () => incidentReportSchema.parseAsync({ ...input, feature: "C:/private/path" }));
  await assert.rejects(async () => incidentReportSchema.parseAsync({ ...input, unexpectedField: "not allowed" }));
  const persisted = await fs.readFile(fixturePath, "utf8");
  assert.ok(!persisted.includes("user@example.test"));
  assert.ok(!persisted.includes("9876543210"));
  assert.ok(!persisted.includes("Synthetic diagnostics only"));
  await fs.rm(fixturePath, { force: true });
  console.log("Sanitized metadata-only incidents, idempotency, grouping, status workflow, strict validation, and local serialization: PASS");
}

void run();
