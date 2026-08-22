import {
  getBackendCaseDocuments,
  getBackendCases,
  getBackendChats,
  type BackendCase,
  type BackendCaseDocument,
  type BackendChat,
} from "@/lib/backendApi";
import { hydrateCaseDocuments, type CaseDocumentLoadResult } from "@/lib/caseDocumentHydration";
import { compactChatMemory } from "@/lib/chatMemory";
import { getPreviewKind } from "@/lib/fileStorage";
import { DEFAULT_REQUEST_CONFIGURATION } from "@/lib/requestSettings";
import type { CaseData, DocumentData } from "@/lib/types";

export const backendCaseToClient = (caseItem: BackendCase): CaseData => ({
  id: caseItem.id,
  name: caseItem.title,
  clientName: caseItem.user_role,
  description: caseItem.short_summary,
  typeTag: "Litigation",
  createdAt: new Date(caseItem.created_at).getTime(),
  updatedAt: new Date(caseItem.updated_at).getTime(),
  documentIds: [],
  documentLoadStatus: "loading",
  caseQuestions: [],
  aiAnalysisPending: caseItem.analysis_status === "pending" || caseItem.analysis_status === "failed",
  preparation: {
    summary: caseItem.short_summary,
    facts: caseItem.important_facts || [],
    timeline: caseItem.important_dates || [],
    parties: caseItem.parties || [],
    relief: caseItem.relief_wanted || [],
    missingInformation: caseItem.missing_information || [],
    risks: caseItem.risk_flags || [],
    questionsForUser: caseItem.questions_for_user || [],
  },
});

export const backendChatToDocument = (chat: BackendChat): DocumentData => {
  const memory = compactChatMemory(chat.messages, chat.contextSummary);
  return {
    id: chat.id,
    name: chat.title,
    uploadedAt: new Date(chat.updatedAt).getTime(),
    chatHistory: memory.recentMessages,
    contextSummary: memory.contextSummary,
    caseId: chat.caseId,
    requestConfiguration: chat.requestConfiguration,
    webEnabled: chat.webEnabled,
    pinned: chat.pinned,
    archived: chat.archived,
  };
};

export const backendCaseDocumentToClient = (document: BackendCaseDocument): DocumentData => ({
  id: document.id,
  name: document.name,
  uploadedAt: document.uploadedAt,
  chatHistory: [],
  caseId: document.caseId,
  mimeType: document.mimeType,
  size: document.size,
  previewKind: getPreviewKind({ name: document.name, type: document.mimeType }),
  extractedText: document.extractedText,
  extractionStatus: document.extractionStatus,
  extractionMessage: document.extractionMessage,
  caseCategory: document.category,
  categorySource: document.categorySource,
  serverBacked: document.contentAvailable,
  documentQuestions: [],
  annotations: document.annotations ?? [],
});

export const documentToBackendChat = (document: DocumentData) => {
  const memory = compactChatMemory(document.chatHistory, document.contextSummary);
  return {
    id: document.id,
    title: document.name,
    messages: memory.recentMessages,
    caseId: document.caseId,
    requestConfiguration: document.requestConfiguration ?? DEFAULT_REQUEST_CONFIGURATION,
    webEnabled: document.webEnabled ?? false,
    attachments: document.mimeType ? [{ documentId: document.id, name: document.name, mimeType: document.mimeType, size: document.size ?? 0 }] : [],
    contextSummary: memory.contextSummary,
    pinned: document.pinned ?? false,
    archived: document.archived ?? false,
  };
};

export function mergeBackendWorkspaceData(
  backendCases: BackendCase[],
  chats: BackendChat[],
  documentResults: CaseDocumentLoadResult[],
) {
  const hydrated = hydrateCaseDocuments(backendCases.map(backendCaseToClient), documentResults);
  const caseChatByCaseId = new Map<string, BackendChat>();

  for (const chat of chats) {
    if (!chat.caseId) continue;
    const current = caseChatByCaseId.get(chat.caseId);
    if (!current || new Date(chat.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
      caseChatByCaseId.set(chat.caseId, chat);
    }
  }

  const cases = hydrated.cases.map((caseItem) => {
    const chat = caseChatByCaseId.get(caseItem.id);
    if (!chat) return caseItem;
    const memory = compactChatMemory(chat.messages, chat.contextSummary);
    return {
      ...caseItem,
      conversationId: chat.id,
      conversationHistory: memory.recentMessages,
      conversationContextSummary: memory.contextSummary,
      conversationRequestConfiguration: chat.requestConfiguration,
      conversationWebEnabled: chat.webEnabled,
    };
  });

  const mergedDocuments = new Map<string, DocumentData>();
  for (const chat of chats.map(backendChatToDocument)) mergedDocuments.set(chat.id, chat);
  for (const caseDocument of hydrated.documents.map(backendCaseDocumentToClient)) {
    const chat = mergedDocuments.get(caseDocument.id);
    mergedDocuments.set(caseDocument.id, chat ? {
      ...caseDocument,
      chatHistory: chat.chatHistory,
      contextSummary: chat.contextSummary,
      requestConfiguration: chat.requestConfiguration,
      webEnabled: chat.webEnabled,
      pinned: chat.pinned,
      archived: chat.archived,
    } : caseDocument);
  }

  return { cases, documents: [...mergedDocuments.values()] };
}

export async function loadBackendWorkspaceData() {
  const caseResult = await getBackendCases();
  const baseCases = caseResult.cases.map(backendCaseToClient);
  const [chatResult, documentResults] = await Promise.all([
    getBackendChats({ limit: 50 }).catch(() => ({ chats: [], nextCursor: null })),
    Promise.all(baseCases.map(async (caseItem): Promise<CaseDocumentLoadResult> => {
      try {
        const result = await getBackendCaseDocuments(caseItem.id);
        return { caseId: caseItem.id, documents: result.documents, failed: false };
      } catch {
        return { caseId: caseItem.id, documents: [], failed: true };
      }
    })),
  ]);
  return mergeBackendWorkspaceData(caseResult.cases, chatResult.chats, documentResults);
}
