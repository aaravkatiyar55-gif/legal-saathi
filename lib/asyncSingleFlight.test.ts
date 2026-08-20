import assert from "node:assert/strict";
import { createSingleFlight } from "./asyncSingleFlight";

async function run() {
  const singleFlight = createSingleFlight<string>();
  let calls = 0;
  let release!: (value: string) => void;
  const gate = new Promise<string>((resolve) => { release = resolve; });

  const first = singleFlight(async () => { calls += 1; return gate; });
  const second = singleFlight(async () => { calls += 1; return "second"; });
  assert.strictEqual(first, second, "concurrent callers share one in-flight operation");
  assert.equal(calls, 0, "work starts asynchronously through the shared promise");
  await Promise.resolve();
  assert.equal(calls, 1, "only the first operation executes");
  release("first");
  assert.equal(await first, "first");

  const afterSuccess = await singleFlight(async () => { calls += 1; return "after-success"; });
  assert.equal(afterSuccess, "after-success");
  assert.equal(calls, 2, "a completed operation can be retried later");

  await assert.rejects(singleFlight(async () => { calls += 1; throw new Error("synthetic failure"); }));
  const afterFailure = await singleFlight(async () => { calls += 1; return "after-failure"; });
  assert.equal(afterFailure, "after-failure");
  assert.equal(calls, 4, "a failed operation does not block a later retry");

  console.info("Async single-flight: PASS 7/7");
}

void run();
