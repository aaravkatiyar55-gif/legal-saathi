import { promises as fs } from "fs";
import os from "os";
import path from "path";

async function main() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "legal-saathi-case-capacity-"));
  process.env.LOCAL_CASES_STORE_PATH = path.join(temporaryRoot, "cases.json");

  const { PRODUCT_PLANS } = await import("../../config/productPolicy");
  const {
    createLocalCaseFromSummary,
    getLocalActiveCaseCount,
    restoreLocalCase,
    softDeleteLocalCase,
  } = await import("../local/localDevStore.service");
  const { CaseFolderLimitError } = await import("./caseCapacity.service");

  let passed = 0;
  const check = (condition: unknown, label: string) => {
    if (!condition) throw new Error(`FAIL: ${label}`);
    passed += 1;
  };
  const summary = (label: string) => ({
    caseType: "Synthetic test matter",
    userRole: "Synthetic test user",
    shortSummary: label,
    importantFacts: ["Synthetic fact"],
    importantDates: [],
    parties: ["Synthetic party"],
    reliefWanted: ["Synthetic relief"],
    missingInformation: [],
    riskFlags: [],
    questionsForUser: [],
  });
  const rejectsAtLimit = async (task: () => Promise<unknown>) => {
    try {
      await task();
      return false;
    } catch (error) {
      return error instanceof CaseFolderLimitError;
    }
  };

  try {
    for (const planId of ["free", "plus", "pro", "max"] as const) {
      const owner = `${planId}-capacity@example.test`;
      const limit = PRODUCT_PLANS[planId].usageWindows.caseFolders.limit;
      for (let index = 0; index < limit; index += 1) {
        await createLocalCaseFromSummary(summary(`${planId}-${index}`), undefined, owner, limit);
      }
      check(await getLocalActiveCaseCount(owner) === limit, `${planId} reaches its exact active-case allowance`);
      check(await rejectsAtLimit(() => createLocalCaseFromSummary(summary("over-limit"), undefined, owner, limit)), `${planId} rejects the next active case`);
    }

    const recycleOwner = "recycle@example.test";
    const first = await createLocalCaseFromSummary(summary("first"), undefined, recycleOwner, 1);
    await softDeleteLocalCase(first.case.id, recycleOwner);
    check(await getLocalActiveCaseCount(recycleOwner) === 0, "soft-deleted cases do not consume capacity");
    await createLocalCaseFromSummary(summary("replacement"), undefined, recycleOwner, 1);
    check(await rejectsAtLimit(() => restoreLocalCase(first.case.id, recycleOwner, 1)), "restore cannot bypass the active-case allowance");

    const parallelOwner = "parallel@example.test";
    const parallelResults = await Promise.allSettled([
      createLocalCaseFromSummary(summary("parallel-a"), undefined, parallelOwner, 1),
      createLocalCaseFromSummary(summary("parallel-b"), undefined, parallelOwner, 1),
    ]);
    check(parallelResults.filter((result) => result.status === "fulfilled").length === 1, "parallel creates produce one success at a one-case limit");
    check(parallelResults.filter((result) => result.status === "rejected" && result.reason instanceof CaseFolderLimitError).length === 1, "parallel overage is rejected with the product error");
    check(await getLocalActiveCaseCount(parallelOwner) === 1, "parallel creates cannot oversubscribe capacity");

    const ownerA = "owner-a@example.test";
    const ownerB = "owner-b@example.test";
    await createLocalCaseFromSummary(summary("owner-a"), undefined, ownerA, 1);
    await createLocalCaseFromSummary(summary("owner-b"), undefined, ownerB, 1);
    check(await getLocalActiveCaseCount(ownerA) === 1 && await getLocalActiveCaseCount(ownerB) === 1, "case capacity is isolated by owner");

    const failureOwner = "failure@example.test";
    const beforeSyntheticFailure = await getLocalActiveCaseCount(failureOwner);
    await Promise.reject(new Error("synthetic provider failure")).catch(() => undefined);
    check(await getLocalActiveCaseCount(failureOwner) === beforeSyntheticFailure, "a failure before persistence consumes no case slot");

    process.stdout.write(`Case capacity tests passed: ${passed}/15\n`);
  } finally {
await fs.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Case capacity test failed"}\n`);
  process.exitCode = 1;
});
