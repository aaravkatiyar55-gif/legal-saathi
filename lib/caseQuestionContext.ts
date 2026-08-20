import type { DocumentQuestionScope } from "./types";

type GroundedCaseDocument = {
  id: string;
  name: string;
  category?: string;
  text: string;
};

export function createCaseQuestionChatContext(args: {
  chatId: string;
  caseId: string;
  caseName: string;
  scope: DocumentQuestionScope;
  selectedDocumentId?: string;
  documents: GroundedCaseDocument[];
  contextSummary?: string;
  language?: "en" | "hi" | "hinglish";
}) {
  return {
    chatId: args.chatId,
    caseId: args.caseId,
    caseName: args.caseName,
    scope: args.scope,
    selectedDocumentId: args.selectedDocumentId,
    documents: args.documents,
    contextSummary: args.contextSummary?.trim().slice(0, 4_000) || undefined,
    language: args.language ?? "en",
    termsAccepted: true as const,
  };
}
