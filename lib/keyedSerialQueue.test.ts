import assert from "node:assert/strict";
import { KeyedSerialQueue } from "./keyedSerialQueue";

async function run() {
  const queue = new KeyedSerialQueue();
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

  const first = queue.run("chat-a", async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
    return 1;
  });
  const second = queue.run("chat-a", async () => {
    events.push("second:start");
    return 2;
  });
  const independent = queue.run("chat-b", async () => {
    events.push("independent");
    return 3;
  });

  assert.equal(await independent, 3);
  assert.deepEqual(events, ["first:start", "independent"]);
  releaseFirst();
  assert.equal(await first, 1);
  assert.equal(await second, 2);
  assert.deepEqual(events, ["first:start", "independent", "first:end", "second:start"]);

  await assert.rejects(() => queue.run("chat-a", async () => { throw new Error("synthetic failure"); }), /synthetic failure/);
  assert.equal(await queue.run("chat-a", async () => 4), 4, "a failed write must not block the next write");
  await queue.drain();
  console.log("Keyed chat persistence serialization and recovery: PASS");
}

void run();
