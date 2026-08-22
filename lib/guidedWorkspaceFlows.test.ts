import assert from "node:assert/strict";
import { getGuidedWorkspaceFlow, GUIDED_WORKSPACE_FLOWS, type GuidedWorkspaceFlowId } from "./guidedWorkspaceFlows";

assert.equal(GUIDED_WORKSPACE_FLOWS.length, 7);
assert.equal(getGuidedWorkspaceFlow("analyse_document")?.requestUpload, true);
assert.equal(getGuidedWorkspaceFlow("research_current_law")?.requestWeb, true);
assert.equal(getGuidedWorkspaceFlow("prepare_case")?.openCaseForm, true);
assert.equal(getGuidedWorkspaceFlow("compare_documents")?.requestUpload, true);
assert.equal(getGuidedWorkspaceFlow("compare_documents")?.prompt?.includes("Case Workspace"), true);
assert.equal(getGuidedWorkspaceFlow("missing" as GuidedWorkspaceFlowId), undefined);
process.stdout.write("Guided workspace flow tests passed: 7/7\n");
