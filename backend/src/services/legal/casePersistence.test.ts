import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

async function run() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "legal-saathi-case-persistence-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    MOCK_MODE: "false",
    LOCAL_CASES_FALLBACK: "true",
    LOCAL_CASES_STORE_PATH: path.join(temporaryRoot, "cases.json"),
  });

  let passed = 0;
  const check = (condition: unknown, label: string) => {
    assert.ok(condition, label);
    passed += 1;
  };
  const summary = (label: string) => ({
    caseType: "Synthetic consumer matter",
    userRole: "Synthetic complainant",
    shortSummary: `Prepared ${label}`,
    importantFacts: [`Prepared fact for ${label}`],
    importantDates: ["1 January 2026"],
    parties: ["Synthetic party"],
    reliefWanted: ["Synthetic relief"],
    missingInformation: [],
    riskFlags: [],
    questionsForUser: ["Synthetic follow-up?"],
  });

  try {
    const {
      createCaseFromIntake,
      getCaseWithMemory,
      prepareCaseAnalysis,
    } = await import("./casePersistence.service");
    const { getLocalActiveCaseCount } = await import("../local/localDevStore.service");

    const owner = "persistence-owner@example.test";
    const created = await createCaseFromIntake("Synthetic user-provided intake story.", "Saved first", owner, "en", 5);
    check(created.case.short_summary === "Case saved. AI preparation pending.", "create returns an explicit pending case without AI");
    check(created.aiAnalysisPending === true, "intake case reports pending analysis");
    check(await getLocalActiveCaseCount(owner) === 1, "pending analysis consumes exactly one case slot");

    let successfulCalls = 0;
    const prepared = await prepareCaseAnalysis(created.case.id, owner, "en", async () => {
      successfulCalls += 1;
      return summary("first case");
    });
    check(prepared.status === "completed" && prepared.case?.short_summary === "Prepared first case", "separate preparation enriches the saved case");
    check(successfulCalls === 1, "preparation calls the summarizer once");

    const repeated = await prepareCaseAnalysis(created.case.id, owner, "en", async () => {
      successfulCalls += 1;
      return summary("should not run");
    });
    check(repeated.alreadyPrepared === true && successfulCalls === 1, "completed preparation is idempotent");
    check((await prepareCaseAnalysis(created.case.id, "other-owner@example.test", "en", async () => summary("wrong owner"))).status === "not_found", "another owner cannot prepare the case");

    const concurrent = await createCaseFromIntake("Synthetic concurrent intake.", "Concurrent", owner, "en", 5);
    let concurrentCalls = 0;
    const delayedSummary = async () => {
      concurrentCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return summary("concurrent case");
    };
    const [firstConcurrent, secondConcurrent] = await Promise.all([
      prepareCaseAnalysis(concurrent.case.id, owner, "en", delayedSummary),
      prepareCaseAnalysis(concurrent.case.id, owner, "en", delayedSummary),
    ]);
    check(firstConcurrent.status === "completed" && secondConcurrent.status === "completed", "parallel retries share one successful result");
    check(concurrentCalls === 1, "parallel retries invoke the provider once");

    const failing = await createCaseFromIntake("Synthetic provider-outage intake.", "Provider outage", owner, "en", 5);
    let failureObserved = false;
    try {
      await prepareCaseAnalysis(failing.case.id, owner, "en", async () => {
        throw new Error("synthetic provider outage");
      });
    } catch {
      failureObserved = true;
    }
    check(failureObserved, "provider failure is returned to the retry caller");
    const afterFailure = await getCaseWithMemory(failing.case.id, owner, false);
    check(afterFailure.case?.short_summary === "Analysis temporarily unavailable", "provider failure leaves a retryable saved case");
    check(afterFailure.memory?.facts_json?.userProvidedIntakeText === "Synthetic provider-outage intake.", "provider failure preserves the original user intake");
    check(await getLocalActiveCaseCount(owner) === 3, "provider failure does not create or delete a case slot");
    let retriedIntake = "";
    const retry = await prepareCaseAnalysis(failing.case.id, owner, "en", async (caseText) => {
      retriedIntake = caseText;
      return summary("retry");
    });
    check(retry.status === "completed" && retry.case?.short_summary === "Prepared retry", "failed analysis can be retried successfully");
    check(retriedIntake === "Synthetic provider-outage intake.", "retry analyzes the preserved original intake");

    const empty = await createCaseFromIntake("", "Empty case", owner, "en", 5);
    check(empty.analysisStatus === "not_requested" && empty.aiAnalysisPending === false, "empty case saves without pretending analysis is pending");
    const emptyPreparation = await prepareCaseAnalysis(empty.case.id, owner, "en", async () => summary("empty"));
    check(emptyPreparation.status === "input_required", "empty case requires user intake before preparation");

    process.stdout.write(`Case persistence and idempotent preparation tests passed: ${passed}/17\n`);
  } finally {
await fs.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

void run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Case persistence test failed"}\n`);
  process.exitCode = 1;
});
