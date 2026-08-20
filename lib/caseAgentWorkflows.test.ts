import assert from "node:assert/strict";
import { buildCaseAgentRequest, CASE_AGENT_WORKFLOWS, getCaseAgentWorkflow, type CaseAgentActionId } from "./caseAgentWorkflows";

const caseId = "case-123";

assert.equal(CASE_AGENT_WORKFLOWS.length, 7);
assert.equal(getCaseAgentWorkflow("weak_points")?.minimumPlan, "plus");
assert.equal(getCaseAgentWorkflow("research")?.composerPrefill?.("Synthetic case").includes("Synthetic case"), true);
assert.equal(getCaseAgentWorkflow("review_document")?.composerPrefill?.("Synthetic case").includes("Synthetic case"), true);
assert.deepEqual(buildCaseAgentRequest({ action: "weak_points", caseId, language: "en" }), {
  path: "/cases/case-123/weak-points/generate",
  method: "POST",
  body: { language: "en" },
});
assert.deepEqual(buildCaseAgentRequest({ action: "draft", caseId, language: "hi" }), {
  path: "/cases/case-123/drafts/generate",
  method: "POST",
  body: { language: "hi", draftType: "message_to_lawyer" },
});
assert.equal(buildCaseAgentRequest({ action: "research", caseId, language: "en" }), null);
assert.equal(buildCaseAgentRequest({ action: "review_document", caseId, language: "en" }), null);
assert.deepEqual(buildCaseAgentRequest({ action: "analyse", caseId, language: "en" }), {
  path: "/cases/case-123/prepare",
  method: "POST",
  body: { language: "en" },
});
assert.deepEqual(buildCaseAgentRequest({ action: "opponent_arguments", caseId, language: "en" }), {
  path: "/cases/case-123/opponent-arguments/generate",
  method: "POST",
  body: { language: "en" },
});
assert.deepEqual(buildCaseAgentRequest({ action: "advocate_brief", caseId, language: "en" }), {
  path: "/cases/case-123/lawyer-brief/generate",
  method: "POST",
  body: { language: "en" },
});
assert.equal(getCaseAgentWorkflow("unsupported" as CaseAgentActionId), undefined);
assert.equal(buildCaseAgentRequest({ action: "unsupported" as CaseAgentActionId, caseId, language: "en" }), null);
process.stdout.write("Case Agent workflow tests passed: 12/12\n");
