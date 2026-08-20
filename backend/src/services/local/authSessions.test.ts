import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function run() {
  const originalCwd = process.cwd();
  const runtime = await mkdtemp(path.join(os.tmpdir(), "legal-saathi-session-test-"));
  Object.assign(process.env, {
    NODE_ENV: "development",
    SESSION_STORE_BACKEND: "local",
    SESSION_SECRET: "synthetic-session-revocation-secret-0000000000000001",
  });
  process.chdir(runtime);
  try {
    const sessions = await import("./authSessions.service");
    const storeModule = await import("../sessions/sessionStore.service");
    const identity = {
      email: "synthetic-owner@example.test",
      displayName: "Synthetic Owner",
      avatarUrl: "",
      provider: "development" as const,
      subject: "synthetic-stable-subject",
    };
    const first = await sessions.createLocalSession(identity);
    const second = await sessions.createLocalSession(identity);
    await sessions.revokeSessionsForSubject(identity.subject, second.id);

    const store = storeModule.getSessionStore();
    const firstRecord = await store.get(storeModule.hashSessionToken(first.id));
    const secondRecord = await store.get(storeModule.hashSessionToken(second.id));
    assert.ok(firstRecord?.revokedAt);
    assert.equal(secondRecord?.revokedAt, null);
    console.log("Subject-wide app-session revocation with current-session preservation: PASS 2/2");
  } finally {
    process.chdir(originalCwd);
    await rm(runtime, { recursive: true, force: true });
  }
}

void run();
