export type GuidedWorkspaceFlowId =
  | "legal_question"
  | "analyse_document"
  | "research_current_law"
  | "review_agreement"
  | "draft_legal_document"
  | "prepare_case"
  | "compare_documents";

export type GuidedWorkspaceFlow = {
  id: GuidedWorkspaceFlowId;
  label: string;
  description: string;
  prompt?: string;
  requestUpload?: boolean;
  requestWeb?: boolean;
  openCaseForm?: boolean;
};

export const GUIDED_WORKSPACE_FLOWS: readonly GuidedWorkspaceFlow[] = [
  {
    id: "legal_question",
    label: "Ask a legal question",
    description: "Start with the facts, jurisdiction, and outcome you need.",
    prompt: "I need help understanding this legal situation: ",
  },
  {
    id: "analyse_document",
    label: "Analyse a document",
    description: "Attach one document and ask what it means for your situation.",
    prompt: "Analyse the document I am attaching. Explain the important points, risks, and questions I should clarify.",
    requestUpload: true,
  },
  {
    id: "research_current_law",
    label: "Research current law",
    description: "Prepare a current-law question for review before it is sent.",
    prompt: "Research the current law on this issue. Prefer official sources, distinguish source-backed facts from analysis, and identify anything that needs verification: ",
    requestWeb: true,
  },
  {
    id: "review_agreement",
    label: "Review an agreement",
    description: "Attach an agreement for a focused clause and risk review.",
    prompt: "Review the agreement I am attaching. Identify obligations, risks, missing protections, and questions for a qualified advocate.",
    requestUpload: true,
  },
  {
    id: "draft_legal_document",
    label: "Draft a legal document",
    description: "Prepare an editable draft from your facts; nothing is sent or filed automatically.",
    prompt: "Help me prepare an editable legal draft. First identify the document type, known facts, missing facts, and assumptions: ",
  },
  {
    id: "prepare_case",
    label: "Prepare a case",
    description: "Open the existing protected Case Workspace intake.",
    openCaseForm: true,
  },
  {
    id: "compare_documents",
    label: "Compare documents",
    description: "Attach the first document, then add the second in Case Workspace before asking for a comparison.",
    prompt: "I need to compare two documents. I will attach the first document now, then add the second in Case Workspace before asking for the comparison.",
    requestUpload: true,
  },
] as const;

export function getGuidedWorkspaceFlow(id: GuidedWorkspaceFlowId) {
  return GUIDED_WORKSPACE_FLOWS.find((flow) => flow.id === id);
}
