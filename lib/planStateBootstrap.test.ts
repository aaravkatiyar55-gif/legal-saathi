import assert from "node:assert/strict";
import { loadPlanStateBootstrap } from "./planStateBootstrap";

async function run() {
  let catalogStarted = false;
  let restoreStarted = false;
  let usageCalls = 0;
  let releaseCatalog!: (value: string) => void;
  let releaseSession!: (value: string | null) => void;
  const catalogGate = new Promise<string>((resolve) => { releaseCatalog = resolve; });
  const sessionGate = new Promise<string | null>((resolve) => { releaseSession = resolve; });

  const pending = loadPlanStateBootstrap({
    getExistingSession: () => null,
    loadCatalog: async () => { catalogStarted = true; return catalogGate; },
    restoreSession: async () => { restoreStarted = true; return sessionGate; },
    loadUsage: async () => { usageCalls += 1; return "usage"; },
  });
  await Promise.resolve();
  assert.equal(catalogStarted, true, "catalog loading starts immediately");
  assert.equal(restoreStarted, true, "session restoration starts in parallel");
  releaseCatalog("catalog");
  releaseSession("session");
  assert.deepEqual(await pending, { catalog: "catalog", session: "session", usage: "usage" });
  assert.equal(usageCalls, 1, "usage loads only after an authenticated session exists");

  let restoreCalls = 0;
  const unsigned = await loadPlanStateBootstrap({
    getExistingSession: () => null,
    loadCatalog: async () => "catalog",
    restoreSession: async () => { restoreCalls += 1; return null; },
    loadUsage: async () => { throw new Error("usage must not load without a session"); },
  });
  assert.deepEqual(unsigned, { catalog: "catalog", session: null, usage: null });
  assert.equal(restoreCalls, 1);

  const existing = await loadPlanStateBootstrap({
    getExistingSession: () => "existing-session",
    loadCatalog: async () => "catalog",
    restoreSession: async () => { throw new Error("restore must not run when a session already exists"); },
    loadUsage: async () => "usage",
  });
  assert.deepEqual(existing, { catalog: "catalog", session: "existing-session", usage: "usage" });

  console.info("Plan-state bootstrap: PASS 8/8");
}

void run();
