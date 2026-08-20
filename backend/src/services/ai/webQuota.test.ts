import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const originalCwd = process.cwd();
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "legal-saathi-web-quota-"));
  process.chdir(testRoot);
  try {
    const { PRODUCT_PLANS } = await import("../../config/productPolicy");
    const { consumePreviewUsage, getPreviewUsage, releasePreviewUsage } = await import("../local/previewAccess.service");

    assert.equal(PRODUCT_PLANS.free.usageWindows.webSearches.limit, 10);
    assert.equal(PRODUCT_PLANS.plus.usageWindows.webSearches.limit, 20);
    assert.equal(PRODUCT_PLANS.pro.usageWindows.webSearches.limit, 50);

    const freeEmail = "synthetic-web-free@example.test";
    const freeAttempts = await Promise.all(
      Array.from({ length: 14 }, () => consumePreviewUsage(freeEmail, "free", "webSearches")),
    );
    assert.equal(freeAttempts.filter((item) => item.allowed).length, 10);
    assert.equal(freeAttempts.filter((item) => !item.allowed).length, 4);
    await releasePreviewUsage(freeEmail, "webSearches");
    const freeAfterRefund = await getPreviewUsage(freeEmail, "free");
    assert.equal(freeAfterRefund.features.find((item) => item.feature === "webSearches")?.remaining, 1);

    const plusAttempts = await Promise.all(
      Array.from({ length: 25 }, () => consumePreviewUsage("synthetic-web-plus@example.test", "plus", "webSearches")),
    );
    assert.equal(plusAttempts.filter((item) => item.allowed).length, 20);
    const otherOwner = await consumePreviewUsage("synthetic-web-other@example.test", "free", "webSearches");
    assert.equal(otherOwner.allowed, true);

    console.log("Manual Web quotas, serialized concurrency, refund, and owner isolation: PASS");
  } finally {
    process.chdir(originalCwd);
await fs.rm(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Web quota test failed");
  process.exitCode = 1;
});
