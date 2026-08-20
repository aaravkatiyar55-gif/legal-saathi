import assert from "node:assert/strict";
import { getGuidedWorkspaceFlow, getGuidedWorkspacePrompt, GUIDED_WORKSPACE_FLOWS, type GuidedWorkspaceFlowId } from "./guidedWorkspaceFlows";

assert.equal(GUIDED_WORKSPACE_FLOWS.length, 7);
assert.equal(getGuidedWorkspaceFlow("analyse_document")?.requestUpload, true);
assert.equal(getGuidedWorkspaceFlow("research_current_law")?.requestWeb, true);
assert.equal(getGuidedWorkspaceFlow("prepare_case")?.openCaseForm, true);
assert.equal(getGuidedWorkspaceFlow("compare_documents")?.requestUpload, true);
assert.equal(getGuidedWorkspaceFlow("compare_documents")?.prompt?.includes("Case Workspace"), true);
for (const flow of GUIDED_WORKSPACE_FLOWS.filter((item) => item.prompt)) {
  assert.equal(getGuidedWorkspacePrompt(flow, "en"), flow.prompt, `${flow.id} preserves the English starter prompt`);
  assert.notEqual(getGuidedWorkspacePrompt(flow, "hi"), flow.prompt, `${flow.id} has a Hindi starter prompt`);
  assert.notEqual(getGuidedWorkspacePrompt(flow, "hinglish"), flow.prompt, `${flow.id} has a Hinglish starter prompt`);
}
assert.equal(getGuidedWorkspaceFlow("missing" as GuidedWorkspaceFlowId), undefined);
process.stdout.write("Guided workspace flow tests passed: 25/25\n");
