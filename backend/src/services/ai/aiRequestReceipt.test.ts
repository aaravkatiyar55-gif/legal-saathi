import assert from "node:assert/strict";
import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLocalAiRequestReceiptStore, isAiRequestReceiptPrimaryKeyConflict } from "./aiRequestReceipt.service";

assert.equal(
  isAiRequestReceiptPrimaryKeyConflict({ code: "23505" }),
  true,
  "a Supabase primary-key race must be recognized so the completed result can be safely re-read",
);
assert.equal(
  isAiRequestReceiptPrimaryKeyConflict({ code: "PGRST116" }),
  false,
  "non-conflict storage errors must remain unavailable instead of being silently accepted",
);

const receiptServiceSource = readFileSync(path.join(__dirname, "aiRequestReceipt.service.ts"), "utf8");
assert.ok(
  receiptServiceSource.includes('const cleanup = await client.from(receiptTable).delete().lt("expires_at", now);'),
  "a recovery read must also prune expired Supabase receipts instead of leaving completed legal-response payloads until another save occurs",
);

async function main() {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "legal-saathi-ai-receipt-"));
  try {
    const store = createLocalAiRequestReceiptStore(path.join(testRoot, "receipts.json"));
    const payload = {
      ok: true,
      requestId: "request-recovery-1",
      provider: "openrouter",
      reply: "Synthetic preparation answer",
    };
    await store.save({
      ownerKey: "a".repeat(64),
      requestId: "request-recovery-1",
      requestFingerprint: "c".repeat(64),
      payload,
      ttlSeconds: 900,
    });
    const recovered = await store.read("a".repeat(64), "request-recovery-1");
    assert.ok(recovered, "a completed receipt should be recoverable by its owner");
    assert.deepEqual(recovered, {
      ownerKey: "a".repeat(64),
      requestId: "request-recovery-1",
      requestFingerprint: "c".repeat(64),
      payload,
      expiresAt: recovered.expiresAt,
    });
    assert.equal(await store.read("b".repeat(64), "request-recovery-1"), null, "receipts must remain owner scoped");
    await assert.rejects(
      store.save({
        ownerKey: "a".repeat(64),
        requestId: "request-recovery-1",
        requestFingerprint: "d".repeat(64),
        payload,
        ttlSeconds: 900,
      }),
      "a request ID cannot be rebound to different request content",
    );
    const stored = await fs.readFile(path.join(testRoot, "receipts.json"), "utf8");
    assert.doesNotMatch(stored, /synthetic prompt|api[_-]?key|bearer/i);
    console.log("AI request receipts recover completed output, remain owner scoped, and avoid request-content storage: PASS");
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "AI request receipt test failed");
  process.exitCode = 1;
});
