import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  decideAiRequestDisconnectAction,
  resolveAiRequestRecovery,
} from "./aiRequestRecovery.service";

const receipt = {
  ownerKey: "a".repeat(64),
  requestId: "request-id-123",
  requestFingerprint: "b".repeat(64),
  payload: { ok: true, requestId: "request-id-123", reply: "Recovered legal information." },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

assert.deepEqual(
  resolveAiRequestRecovery({ isActive: true, completedReceipt: null }),
  { status: "pending" },
  "an active request remains pending instead of being resubmitted",
);
assert.deepEqual(
  resolveAiRequestRecovery({ isActive: false, completedReceipt: receipt }),
  { status: "completed", payload: receipt.payload },
  "a receipt returns only the completed payload for the same owner/request ID",
);
assert.deepEqual(
  resolveAiRequestRecovery({ isActive: false, completedReceipt: null }),
  { status: "missing" },
  "an absent receipt is explicit so the UI can offer a fresh request",
);

assert.equal(
  decideAiRequestDisconnectAction({ responseFinished: false, receiptRecoveryEnabled: true }),
  "continue_for_recovery",
  "a recoverable request must keep processing after a browser/network disconnect so its completed receipt is not lost",
);
assert.equal(
  decideAiRequestDisconnectAction({ responseFinished: false, receiptRecoveryEnabled: false }),
  "abort",
  "without durable recovery, a disconnected request must stop instead of consuming provider work with nowhere to return it",
);
assert.equal(
  decideAiRequestDisconnectAction({ responseFinished: true, receiptRecoveryEnabled: true }),
  "ignore",
  "a normally completed response must not trigger any disconnect action",
);

const aiRouteSource = readFileSync(path.join(process.cwd(), "src", "routes", "ai.routes.ts"), "utf8");
assert.match(
  aiRouteSource,
  /decideAiRequestDisconnectAction\(\{[\s\S]*receiptRecoveryEnabled:\s*env\.aiRequestReceiptEnabled/,
  "the HTTP route must apply the tested disconnect policy using the actual receipt-recovery feature flag",
);

console.info("AI request recovery contract: PASS 7/7");
