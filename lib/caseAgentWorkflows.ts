import type { AppLanguage } from "@/lib/i18n";

export type CaseAgentActionId = "analyse" | "weak_points" | "opponent_arguments" | "advocate_brief" | "draft" | "research" | "review_document";

export type CaseAgentWorkflow = {
  id: CaseAgentActionId;
  label: string;
  description: string;
  minimumPlan: "free" | "plus" | "pro";
  /** Actions with a true request use an existing ownership-checked backend route. */
  route?: (caseId: string) => string;
  method?: "POST";
  draftType?: "legal_notice" | "reply_notice" | "complaint_summary" | "message_to_lawyer";
  /** These actions prepare an editable question instead of firing an AI call. */
  composerPrefill?: (caseTitle: string) => string;
};

export const CASE_AGENT_WORKFLOWS: readonly CaseAgentWorkflow[] = [
  {
    id: "analyse",
    label: "Analyse case",
    description: "Refresh the structured preparation snapshot from saved case facts.",
    minimumPlan: "free",
    route: caseId => `/cases/${encodeURIComponent(caseId)}/prepare`,
    method: "POST",
  },
  {
    id: "weak_points",
    label: "Weak points",
    description: "Identify possible gaps and the evidence worth checking.",
    minimumPlan: "plus",
    route: caseId => `/cases/${encodeURIComponent(caseId)}/weak-points/generate`,
    method: "POST",
  },
  {
    id: "opponent_arguments",
    label: "Opponent arguments",
    description: "Prepare for plausible arguments the other side may raise.",
    minimumPlan: "plus",
    route: caseId => `/cases/${encodeURIComponent(caseId)}/opponent-arguments/generate`,
    method: "POST",
  },
  {
    id: "advocate_brief",
    label: "Advocate brief",
    description: "Create a concise preparation brief using only saved case material.",
    minimumPlan: "pro",
    route: caseId => `/cases/${encodeURIComponent(caseId)}/lawyer-brief/generate`,
    method: "POST",
  },
  {
    id: "draft",
    label: "Draft",
    description: "Generate an editable preparation draft for advocate review.",
    minimumPlan: "pro",
    route: caseId => `/cases/${encodeURIComponent(caseId)}/drafts/generate`,
    method: "POST",
    draftType: "message_to_lawyer",
  },
  {
    id: "research",
    label: "Research",
    description: "Prepare an editable current-law research question before sending it.",
    minimumPlan: "free",
    composerPrefill: caseTitle => `Research the current law relevant to ${caseTitle}. Use official sources and identify anything that needs verification.`,
  },
  {
    id: "review_document",
    label: "Review document",
    description: "Prepare an editable request to review the selected document in this case.",
    minimumPlan: "free",
    composerPrefill: caseTitle => `Review the selected document in ${caseTitle}. Identify important clauses, gaps, risks, and questions to clarify.`,
  },
] as const;

export function getCaseAgentWorkflow(id: CaseAgentActionId) {
  return CASE_AGENT_WORKFLOWS.find(workflow => workflow.id === id);
}

export function buildCaseAgentRequest(input: {
  action: CaseAgentActionId;
  caseId: string;
  language: AppLanguage;
}) {
  const workflow = getCaseAgentWorkflow(input.action);
  if (!workflow?.route || !workflow.method) return null;

  return {
    path: workflow.route(input.caseId),
    method: workflow.method,
    body: {
      language: input.language,
      ...(workflow.draftType ? { draftType: workflow.draftType } : {}),
    },
  } as const;
}
