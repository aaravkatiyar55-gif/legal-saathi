"use client";
import { useState, useEffect, useRef } from "react";
import { PanelLeft } from "lucide-react";
import {
  AppView,
  DocumentData,
  CaseData,
  ChatMessage,
  ChatCitation,
  DocumentCategory,
  DocumentCategorySource,
  DocumentExtractionStatus,
  DocumentQuestion,
  DocumentQuestionScope,
  DocumentAnnotation,
  RequestConfiguration
} from "@/lib/types";
import { getPreviewKind, readTextIfSupported } from "@/lib/fileStorage";
import { hydrateCaseDocuments } from "@/lib/caseDocumentHydration";
import { suggestDocumentCategory } from "@/lib/documentCategories";
import { createBackendCase, deleteAllBackendChats, deleteBackendCase, deleteBackendChat, destroyBackendSession, getBackendCaseDocuments, getBackendCases, getBackendChats, getBackendSession, linkDocumentToCaseOnServer, prepareBackendCaseAnalysis, prepareCaseQuestionOnServer, processDocumentOnServer, restoreBackendCase, restoreBackendChat, restoreBackendSession, safeConsentRequiredEvent, safeInlineBackendMessage, saveBackendLanguage, saveDocumentAnnotationOnServer, submitLegalChat, updateBackendChat, updateDocumentCategoryOnServer, upsertBackendChat, type BackendCase, type BackendCaseDocument, type BackendChat, type ConsentRequirements, type LegalChatResult, type SessionPayload } from "@/lib/backendApi";
import { DEFAULT_REQUEST_CONFIGURATION } from "@/lib/requestSettings";
import { createCaseQuestionChatContext } from "@/lib/caseQuestionContext";
import RoleSelection from "@/components/RoleSelection";
import LegalAiWorkspace, { WorkspaceSubmission } from "@/components/LegalAiWorkspace";
import AnalysisPage from "@/components/AnalysisPage";
import CaseHub from "@/components/CaseHub";
import CaseWorkspace from "@/components/CaseWorkspace";
import CreateCaseModal from "@/components/CreateCaseModal";
import Sidebar from "@/components/Sidebar";
import AdminAuthModal from "@/components/AdminAuthModal";
import AdminDashboard from "@/components/AdminDashboard";
import SettingsModal from "@/components/SettingsModal";
import AuthModal from "@/components/AuthModal";
import UserProfileButton from "@/components/UserProfileButton";
import PricingModal from "@/components/ProductPricingModal";
import InterfaceTranslator from "@/components/InterfaceTranslator";
import HelpModal from "@/components/HelpModal";
import PlanHeaderControl from "@/components/PlanHeaderControl";
import { requestPlanStateRefresh } from "@/components/PlanStateProvider";
import { isAppLanguage, type AppLanguage } from "@/lib/i18n";
import { appCopy, appLanguageFromSearch, formatAppCopy, type AppCopyKey } from "@/lib/i18n/appCopy";
import ConsentModal from "@/components/ConsentModal";
import { compactChatMemory } from "@/lib/chatMemory";
import { KeyedSerialQueue } from "@/lib/keyedSerialQueue";
import { decideProtectedAction } from "@/lib/protectedActionGuard";
import { dispatchSafeAppError } from "@/lib/safeIncident";
import { completeAuthenticatedHandoff, deriveCompletedAuthState } from "@/lib/authCompletion";
import { runVerifiedLogout } from "@/lib/authLifecycle";

function requirementsFromSession(session: SessionPayload): ConsentRequirements {
  return {
    termsVersion: session.requiredTermsVersion,
    privacyVersion: session.requiredPrivacyVersion,
    consentVersion: session.requiredConsentVersion,
  };
}

function assistantMessageFromChat(chat: LegalChatResult): ChatMessage {
  const citations: ChatCitation[] = [
    ...(chat.web?.sources ?? []).map((source) => ({
      title: source.title,
      url: source.url,
      excerpt: source.excerpt,
      authority: source.authority,
      retrievedAt: source.retrievedAt,
    })),
    ...(chat.grounding?.citations ?? []).map((citation) => ({
      title: `${citation.label} (${citation.authority})`,
      url: citation.url,
      excerpt: citation.page ? `Page ${citation.page}` : citation.jurisdiction,
      authority: citation.authority,
    })),
  ];
  const unique = Array.from(new Map(citations.map((citation) => [`${citation.url ?? "private"}:${citation.title}`, citation])).values());
  return {
    role: "assistant",
    text: chat.reply,
    citations: unique,
    groundingStatus: chat.grounding?.status,
    agent: chat.agent ? {
      state: chat.agent.state,
      publicStatus: chat.agent.publicStatus,
      toolSummaries: chat.agent.toolSummaries,
      requiresConfirmation: chat.agent.requiresConfirmation,
    } : undefined,
  };
}

const backendCaseToClient = (caseItem: BackendCase): CaseData => ({
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

const backendChatToDocument = (chat: BackendChat): DocumentData => {
  const memory = compactChatMemory(chat.messages, chat.contextSummary);
  return {
    id: chat.id,
    name: chat.title,
    uploadedAt: new Date(chat.updatedAt).getTime(),
    chatHistory: memory.recentMessages,
    contextSummary: memory.contextSummary,
    chatPersistenceStatus: "saved",
    caseId: chat.caseId,
    requestConfiguration: chat.requestConfiguration,
    webEnabled: chat.webEnabled,
    pinned: chat.pinned,
    archived: chat.archived,
  };
};

const backendCaseDocumentToClient = (document: BackendCaseDocument): DocumentData => ({
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

async function loadBackendWorkspaceData() {
  const caseResult = await getBackendCases();
  const baseCases = caseResult.cases.map(backendCaseToClient);
  const [chatResult, documentResults] = await Promise.all([
    getBackendChats({ limit: 50 }).catch(() => ({ chats: [], nextCursor: null })),
    Promise.all(baseCases.map(async (caseItem) => {
      try {
        const result = await getBackendCaseDocuments(caseItem.id);
        return { caseId: caseItem.id, documents: result.documents, failed: false };
      } catch {
        return { caseId: caseItem.id, documents: [], failed: true };
      }
    })),
  ]);
  const hydrated = hydrateCaseDocuments(baseCases, documentResults);
  const caseChatByCaseId = new Map<string, BackendChat>();
  for (const chat of chatResult.chats) {
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
  for (const chat of chatResult.chats.map(backendChatToDocument)) {
    mergedDocuments.set(chat.id, chat);
  }
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
  return {
    cases,
    documents: [...mergedDocuments.values()],
  };
}

const documentToBackendChat = (document: DocumentData) => {
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

type ProtectedAction = () => void | Promise<void>;

export default function Home() {
  const [role, setRole] = useState<"normal" | "lawyer" | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const chatPersistenceQueue = useRef(new KeyedSerialQueue());
  const [lastDeletedChat, setLastDeletedChat] = useState<DocumentData | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [newlyUploadedDocId, setNewlyUploadedDocId] = useState<string | null>(null);
  
  const [cases, setCases] = useState<CaseData[]>([]);
  const [lastDeletedCase, setLastDeletedCase] = useState<CaseData | null>(null);
  const [caseActionError, setCaseActionError] = useState<string | null>(null);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  
  const [activeView, setActiveView] = useState<AppView>("dashboard");
  
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [isCreateCaseModalOpen, setIsCreateCaseModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"profile" | "usage">("profile");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState("");
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [pricingMode, setPricingMode] = useState<"plans" | "topup">("plans");
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [authUser, setAuthUser] = useState<{ displayName: string; email: string; avatarColor: string } | null>(null);
  const [isAdminEligible, setIsAdminEligible] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isConsentReviewOpen, setIsConsentReviewOpen] = useState(false);
  const [consentRequirements, setConsentRequirements] = useState<ConsentRequirements | null>(null);
  const [language, setLanguage] = useState<AppLanguage>("en");
  const copy = (key: AppCopyKey) => appCopy(language, key);
  const formatCopy = (key: AppCopyKey, values: Readonly<Record<string, string | number>>) => formatAppCopy(language, key, values);
  const pendingProtectedActionRef = useRef<ProtectedAction | null>(null);

  const closeTransientModals = () => {
    setIsPricingOpen(false);
    setIsSettingsOpen(false);
    setIsHelpOpen(false);
    setIsAdminAuthOpen(false);
    setIsCreateCaseModalOpen(false);
    setIsConsentReviewOpen(false);
  };

  const authorizeProtectedAction = (action: ProtectedAction) => {
    const decision = decideProtectedAction(Boolean(authUser), termsAccepted);
    if (decision === "run") return true;

    pendingProtectedActionRef.current = action;
    closeTransientModals();
    if (decision === "sign_in") {
      setAuthModalReason("Sign in first to continue.");
      setIsAuthModalOpen(true);
    } else {
      setIsAuthModalOpen(false);
    }
    return false;
  };

  const resumePendingProtectedAction = async () => {
    const pendingAction = pendingProtectedActionRef.current;
    pendingProtectedActionRef.current = null;
    setAuthModalReason("");
    if (pendingAction) await pendingAction();
  };

  const clearPendingProtectedAction = () => {
    pendingProtectedActionRef.current = null;
    setAuthModalReason("");
  };

  useEffect(() => {
    const languageFromUrl = appLanguageFromSearch(window.location.search);
    if (languageFromUrl) setLanguage(languageFromUrl);
    if (window.matchMedia("(max-width: 820px)").matches) {
      setIsSidebarOpen(false);
    }
    
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    void restoreBackendSession()
      .then(async (result) => {
        if (!active || !result) return;
        const profile = result.profile;
        const session = result.session;
        if (!profile || !session) return;
        setAuthUser({
          displayName: profile.displayName || profile.email,
          email: profile.email,
          avatarColor: "#6366f1",
        });
        setRole((current) => current ?? "normal");
        const acceptedCurrent = session.acceptedCurrent === true;
        setConsentRequirements(requirementsFromSession(session));
        setTermsAccepted(acceptedCurrent);
        setIsAdminEligible(session.adminEligible === true);
        if (isAppLanguage(session.language)) setLanguage(session.language);
        if (!acceptedCurrent) {
          setCases([]);
          setDocuments([]);
          requestPlanStateRefresh();
          return;
        }
        const workspace = await loadBackendWorkspaceData();
        if (!active) return;
        setCases(workspace.cases);
        setDocuments(workspace.documents);
        requestPlanStateRefresh();
      })
      .catch(() => {
        // No current cookie session is an expected signed-out state.
        setIsAdminEligible(false);
      });
    return () => { active = false; };
  }, []);

  const handleLanguageChange = (nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage);
    if (getBackendSession()) {
      void saveBackendLanguage(nextLanguage).catch(() => {
        // A temporary persistence error must not prevent an immediate language change.
      });
    }
  };

  const refreshCasesFromBackend = async () => {
    const workspace = await loadBackendWorkspaceData();
    setCases(workspace.cases);
    setDocuments(workspace.documents);
  };

  const handleRetryCaseAnalysis = async (caseId: string) => {
    const result = await prepareBackendCaseAnalysis(caseId, language);
    const preparedCase = backendCaseToClient(result.case);
    setCases((current) => current.map((caseData) => caseData.id === caseId ? {
      ...preparedCase,
      clientName: caseData.clientName,
      typeTag: caseData.typeTag,
      documentIds: caseData.documentIds,
      caseQuestions: caseData.caseQuestions,
      aiAnalysisPending: false,
    } : caseData));
  };

  const handleDeleteCase = async (caseItem: CaseData) => {
    const confirmed = window.confirm(formatCopy("case.moveToTrashConfirm", { caseName: caseItem.name }));
    if (!confirmed) return;
    setCaseActionError(null);
    try {
      await deleteBackendCase(caseItem.id);
      setLastDeletedCase(caseItem);
      setCases((current) => current.filter((item) => item.id !== caseItem.id));
      if (activeCaseId === caseItem.id) {
        setActiveCaseId(null);
        setActiveView("case_hub");
      }
    } catch (error) {
      setCaseActionError(safeInlineBackendMessage(error, "The case could not be moved to trash. Please try again."));
    }
  };

  const handleRestoreLastDeletedCase = async () => {
    if (!lastDeletedCase) return;
    setCaseActionError(null);
    try {
      await restoreBackendCase(lastDeletedCase.id);
      await refreshCasesFromBackend();
      setLastDeletedCase(null);
    } catch (error) {
      setCaseActionError(safeInlineBackendMessage(error, "The case could not be restored. Please try again."));
    }
  };

  useEffect(() => {
    const handleConsentRequired = () => {
      setTermsAccepted(false);
    };
    window.addEventListener(safeConsentRequiredEvent, handleConsentRequired);
    return () => window.removeEventListener(safeConsentRequiredEvent, handleConsentRequired);
  }, []);

  if (!isLoaded) return null;

  if (!role) {
    return <RoleSelection onSelectRole={setRole} language={language} onLanguageChange={handleLanguageChange} />;
  }

  if (authUser && !termsAccepted && consentRequirements) {
    return (
      <ConsentModal
        isOpen
        requirements={consentRequirements}
        language={language}
        onConsentAccepted={handleConsentAccepted}
        onRefuse={handleConsentRefusal}
      />
    );
  }

  if (activeView === "admin_dashboard") {
    return <AdminDashboard onClose={() => setActiveView("dashboard")} currentUserEmail={authUser?.email} />;
  }

  const createDocumentSession = async (
    file?: File,
    message?: string,
    caseId?: string,
    categoryOverride?: DocumentCategory,
    requestConfiguration: RequestConfiguration = DEFAULT_REQUEST_CONFIGURATION,
    webEnabled = false,
    acceptedTerms = true,
    selectedLanguage: "en" | "hinglish" | "hi" = language,
    requestId?: string,
  ): Promise<DocumentData> => {
    const documentId = crypto.randomUUID();
    const trimmedMessage = message?.trim() || "";
    const sessionName = file?.name || (trimmedMessage ? "Legal AI Conversation" : "Untitled Legal Session");
    const userText = trimmedMessage || (file ? `Uploaded "${file.name}" for legal analysis.` : "Started a legal AI analysis.");
    const previewKind = file ? getPreviewKind(file) : undefined;
    const localExtractedText = file ? await readTextIfSupported(file, previewKind ?? "unknown") : undefined;
    const suggestedCategory = file ? suggestDocumentCategory(file.name, file.type) : "Other";
    let caseCategory = caseId ? categoryOverride ?? suggestedCategory : undefined;
    let categorySource: DocumentCategorySource | undefined = caseId
      ? categoryOverride
        ? "manual"
        : suggestedCategory === "Other"
          ? "none"
          : "rule"
      : undefined;
    let serverBacked = false;
    let extractedText = localExtractedText;
    let extractionStatus: DocumentExtractionStatus | undefined = localExtractedText ? "complete" : undefined;
    let extractionMessage: string | undefined;

    if (file) {
      try {
        const processingResult = await processDocumentOnServer({
          documentId,
          caseId,
          file,
          category: caseId ? categoryOverride : undefined,
        });
        serverBacked = processingResult.contentAvailable;
        extractedText = processingResult.extractedText ?? extractedText;
        extractionStatus = processingResult.extractionStatus;
        extractionMessage = processingResult.extractionMessage;
        if (caseId) {
          caseCategory = processingResult.category;
          categorySource = processingResult.categorySource;
        }
      } catch (error) {
        console.warn("[Document upload] server processing unavailable", { category: "server_document_processing_failure" });
        extractionMessage = safeInlineBackendMessage(error, "The server copy could not be created. The browser copy remains available.");
        if (!extractionStatus) extractionStatus = "failed";
      }
    }

    let chatHistory: ChatMessage[] = [];
    if (!caseId) {
      const userMessage: ChatMessage = { role: "user", text: userText };
      const chat = await submitLegalChat({
        requestId,
        messages: [userMessage],
        requestConfiguration,
        context: {
          chatId: documentId,
          role,
          documentName: file?.name,
          documentMimeType: file?.type,
          documentText: extractedText?.slice(0, 30_000),
          webEnabled,
          language: selectedLanguage,
          termsAccepted: acceptedTerms,
        }
      });
      chatHistory = [userMessage, assistantMessageFromChat(chat)];
    }

    return {
      id: documentId,
      name: sessionName,
      uploadedAt: Date.now(),
      chatHistory,
      caseId,
      mimeType: file?.type || undefined,
      size: file?.size,
      previewKind,
      caseCategory,
      categorySource,
      extractedText,
      serverBacked,
      extractionStatus,
      extractionMessage,
      documentQuestions: [],
      requestConfiguration
    };
  };

  const performUpload = async (file: File, caseId?: string, categoryOverride?: DocumentCategory) => {
    const newDoc = await createDocumentSession(file, "", caseId, categoryOverride);
    setDocuments((current) => [newDoc, ...current.filter((document) => document.id !== newDoc.id)]);
    
    if (caseId) {
      setCases((current) => current.map((caseData) => caseData.id === caseId ? {
        ...caseData,
        updatedAt: Date.now(),
        documentIds: Array.from(new Set([...caseData.documentIds, newDoc.id])),
        documentLoadStatus: "available",
      } : caseData));
      setActiveDocId(null);
      setActiveCaseId(caseId);
      setActiveView("case_workspace");
      return newDoc;
    }
    
    setActiveDocId(newDoc.id);
    setNewlyUploadedDocId(newDoc.id);
    setActiveView("dashboard");
    return newDoc;
  };

  const handleUpload = async (file: File, caseId?: string, categoryOverride?: DocumentCategory) => {
    if (!authorizeProtectedAction(() => performUpload(file, caseId, categoryOverride).then(() => undefined))) {
      return;
    }
    return performUpload(file, caseId, categoryOverride);
  };

  const performWorkspaceStart = async ({ requestId, file, message, requestConfiguration, webEnabled, termsAccepted: acceptedTerms, language: selectedLanguage }: WorkspaceSubmission) => {
    const newDoc = await createDocumentSession(file, message, undefined, undefined, requestConfiguration, webEnabled, acceptedTerms, selectedLanguage, requestId);
    newDoc.webEnabled = webEnabled;
    newDoc.chatPersistenceStatus = "saving";
    const updatedDocs = [newDoc, ...documents];

    setDocuments(updatedDocs);
    setActiveDocId(newDoc.id);
    setNewlyUploadedDocId(newDoc.id);
    setActiveView("dashboard");
    setIsSidebarOpen(!window.matchMedia("(max-width: 820px)").matches);
    const persistChat = () => chatPersistenceQueue.current.run(newDoc.id, async () => {
      await upsertBackendChat(documentToBackendChat(newDoc));
    });
    try {
      await persistChat();
      setDocuments((current) => current.map((document) => document.id === newDoc.id
        ? { ...document, chatPersistenceStatus: "saved" }
        : document));
    } catch {
      // The answer is already present in the active workspace. Keep the
      // warning in the conversation instead of replacing it with a generic
      // modal, and never resubmit the completed AI request automatically.
      setDocuments((current) => current.map((document) => document.id === newDoc.id
        ? { ...document, chatPersistenceStatus: "unavailable" }
        : document));
    }
  };

  const handleWorkspaceStart = async (submission: WorkspaceSubmission) => {
    if (!authorizeProtectedAction(() => performWorkspaceStart(submission))) return;
    await performWorkspaceStart(submission);
  };

  const performNewChat = () => {
    setActiveDocId(null);
    setActiveCaseId(null);
    setActiveView("dashboard");
    setIsSidebarOpen(!window.matchMedia("(max-width: 820px)").matches);
  };

  const handleNewChat = () => {
    if (!authorizeProtectedAction(performNewChat)) return;
    performNewChat();
  };

  const handleRenameChat = async (chatId: string) => {
    const current = documents.find((document) => document.id === chatId);
    if (!current) return;
    const title = window.prompt(copy("chat.renamePrompt"), current.name)?.trim();
    if (!title || title === current.name) return;
    const result = await updateBackendChat(chatId, { title });
    setDocuments((items) => items.map((document) => document.id === chatId ? backendChatToDocument(result.chat) : document));
  };

  const handlePinChat = async (chatId: string, pinned: boolean) => {
    const result = await updateBackendChat(chatId, { pinned });
    setDocuments((items) => items.map((document) => document.id === chatId ? backendChatToDocument(result.chat) : document));
  };

  const handleArchiveChat = async (chatId: string, archived: boolean) => {
    const result = await updateBackendChat(chatId, { archived });
    setDocuments((items) => items.map((document) => document.id === chatId ? backendChatToDocument(result.chat) : document));
    if (archived && activeDocId === chatId) handleNewChat();
  };

  const handleDeleteChat = async (chatId: string) => {
    const current = documents.find((document) => document.id === chatId);
    if (!current || !window.confirm(formatCopy("chat.moveToTrashConfirm", { conversation: current.name }))) return;
    await deleteBackendChat(chatId);
    setLastDeletedChat(current);
    setDocuments((items) => items.filter((document) => document.id !== chatId));
    if (activeDocId === chatId) handleNewChat();
  };

  const handleRestoreLastDeletedChat = async () => {
    if (!lastDeletedChat) return;
    const result = await restoreBackendChat(lastDeletedChat.id);
    setDocuments((items) => [backendChatToDocument(result.chat), ...items.filter((document) => document.id !== result.chat.id)]);
    setLastDeletedChat(null);
  };

  const performOpenSettings = (initialTab: "profile" | "usage" = "profile") => {
    setSettingsInitialTab(initialTab);
    setIsSettingsOpen(true);
    if (window.matchMedia("(max-width: 820px)").matches) setIsSidebarOpen(false);
  };

  const handleOpenSettings = (initialTab: "profile" | "usage" = "profile") => {
    if (!authorizeProtectedAction(() => performOpenSettings(initialTab))) return;
    performOpenSettings(initialTab);
  };

  const performOpenCaseHub = () => {
    setActiveDocId(null);
    setActiveCaseId(null);
    setActiveView("case_hub");
    setIsSidebarOpen(!window.matchMedia("(max-width: 820px)").matches);
  };

  const handleOpenCaseHub = () => {
    if (!authorizeProtectedAction(performOpenCaseHub)) return;
    performOpenCaseHub();
  };

  const performOpenCase = (id: string) => {
    setActiveDocId(null);
    setActiveCaseId(id);
    setActiveView("case_workspace");
    setIsSidebarOpen(true);
  };

  const handleOpenCase = (id: string) => {
    if (!authorizeProtectedAction(() => performOpenCase(id))) return;
    performOpenCase(id);
  };

  const handleCreateCase = async (name: string, clientName: string, description: string, typeTag: string, file?: File) => {
    if (!authUser) {
      setIsAuthModalOpen(true);
      return false;
    }
    // Build the intake text from the form fields. Empty string is valid (empty case).
    const caseText = [description, clientName && `Client / party: ${clientName}`, `Case type: ${typeTag}`]
      .filter(Boolean)
      .join("\n");
    const result = await createBackendCase(name, caseText, language);
    const newCase: CaseData = {
      ...backendCaseToClient(result.case),
      clientName,
      typeTag: typeTag as CaseData["typeTag"],
      description: result.case.short_summary,
      // Surface AI-pending flag so CaseWorkspace can show the retry banner
      aiAnalysisPending: Boolean(result.aiAnalysisPending),
    };

    let caseToSave = newCase;

    if (file) {
      try {
        const newDoc = await createDocumentSession(file, "", newCase.id);
        const updatedDocs = [newDoc, ...documents];
        setDocuments(updatedDocs);
        caseToSave = { ...newCase, documentIds: [newDoc.id] };
      } catch {
        // Document upload failure must not roll back the already-persisted case
        caseToSave = newCase;
      }
    }
    
    const updatedCases = [caseToSave, ...cases];
    setCases(updatedCases);
    
    setActiveCaseId(newCase.id);
    setActiveDocId(null);
    setActiveView("case_workspace");
    return true;
  };

  const handleGenerateCaseFromChat = async (document: DocumentData) => {
    if (!authUser) {
      setIsAuthModalOpen(true);
      throw new Error("Sign in before creating a case workspace.");
    }
    const caseText = [
      document.contextSummary,
      document.chatHistory
        .map((message) => `${message.role === "assistant" ? "Legal Saathi" : "User"}: ${message.text}`)
        .join("\n\n"),
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 20_000);
    if (!caseText.trim()) throw new Error("Add case details or a legal chat message before generating a workspace.");
    const result = await createBackendCase(document.name || "Legal preparation case", caseText, language);
    let linkedDocument = {
      ...document,
      caseId: result.case.id,
      uploadedAt: Date.now(),
    };
    let linkedDocumentIds: string[] = [];
    if (document.serverBacked && document.mimeType) {
      const linked = await linkDocumentToCaseOnServer(document.id, result.case.id);
      linkedDocument = {
        ...linkedDocument,
        caseCategory: linked.document.category,
        categorySource: linked.document.categorySource,
      };
      linkedDocumentIds = [document.id];
    }
    const persistedChat = await upsertBackendChat(documentToBackendChat(linkedDocument));
    linkedDocument = {
      ...linkedDocument,
      ...backendChatToDocument(persistedChat.chat),
      mimeType: document.mimeType,
      size: document.size,
      previewKind: document.previewKind,
      extractedText: document.extractedText,
      serverBacked: document.serverBacked,
      extractionStatus: document.extractionStatus,
      extractionMessage: document.extractionMessage,
      caseCategory: linkedDocument.caseCategory,
      categorySource: linkedDocument.categorySource,
    };
    const memory = compactChatMemory(persistedChat.chat.messages, persistedChat.chat.contextSummary);
    const newCase: CaseData = {
      ...backendCaseToClient(result.case),
      aiAnalysisPending: Boolean(result.aiAnalysisPending),
      documentIds: linkedDocumentIds,
      documentLoadStatus: linkedDocumentIds.length > 0 ? "available" : "empty",
      conversationId: persistedChat.chat.id,
      conversationHistory: memory.recentMessages,
      conversationContextSummary: memory.contextSummary,
      conversationRequestConfiguration: persistedChat.chat.requestConfiguration,
      conversationWebEnabled: persistedChat.chat.webEnabled,
    };
    setDocuments((current) => [linkedDocument, ...current.filter((item) => item.id !== linkedDocument.id)]);
    setCases((current) => [newCase, ...current.filter((caseData) => caseData.id !== newCase.id)]);
    setActiveCaseId(newCase.id);
    setActiveDocId(null);
    setActiveView("case_workspace");
  };

  const updateDocumentChat = async (docId: string, history: ChatMessage[]) => {
    const currentDocument = documents.find((document) => document.id === docId);
    const memory = compactChatMemory(history, currentDocument?.contextSummary);
    const updated = documents.map(d => d.id === docId ? {
      ...d,
      chatHistory: memory.recentMessages,
      contextSummary: memory.contextSummary,
      chatPersistenceStatus: d.caseId ? d.chatPersistenceStatus : "saving",
      uploadedAt: Date.now(),
    } : d);
    setDocuments(updated);
    const changed = updated.find((document) => document.id === docId);
    if (changed && !changed.caseId) {
      try {
        await chatPersistenceQueue.current.run(changed.id, async () => {
          await upsertBackendChat(documentToBackendChat(changed));
        });
        setDocuments((current) => current.map((document) => document.id === changed.id
          ? { ...document, chatPersistenceStatus: "saved" }
          : document));
      } catch (error) {
        setDocuments((current) => current.map((document) => document.id === changed.id
          ? { ...document, chatPersistenceStatus: "unavailable" }
          : document));
        throw error;
      }
    }
  };

  const updateDocumentRequestConfiguration = (docId: string, requestConfiguration: RequestConfiguration) => {
    const updated = documents.map(document =>
      document.id === docId ? { ...document, requestConfiguration } : document
    );
    setDocuments(updated);
    const changed = updated.find((document) => document.id === docId);
    if (changed && !changed.caseId) {
      void chatPersistenceQueue.current.run(changed.id, async () => {
        await upsertBackendChat(documentToBackendChat(changed));
      }).catch(() => undefined);
    }
  };

  const updateDocumentWebEnabled = (docId: string, webEnabled: boolean) => {
    const updated = documents.map(document =>
      document.id === docId ? { ...document, webEnabled } : document
    );
    setDocuments(updated);
    const changed = updated.find((document) => document.id === docId);
    if (changed && !changed.caseId) {
      void chatPersistenceQueue.current.run(changed.id, async () => {
        await upsertBackendChat(documentToBackendChat(changed));
      }).catch(() => undefined);
    }
  };

  const handleUpdateDocumentCategory = async (documentId: string, caseCategory: DocumentCategory) => {
    const result = await updateDocumentCategoryOnServer(documentId, caseCategory);
    const updatedAt = Date.now();
    setDocuments((current) => current.map((document) => document.id === documentId
      ? {
          ...document,
          caseCategory: result.document.category,
          categorySource: result.document.categorySource,
        }
      : document));
    setCases((current) => current.map((caseData) =>
      caseData.documentIds.includes(documentId) ? { ...caseData, updatedAt } : caseData
    ));
  };

  const handleAddDocumentAnnotation = async (documentId: string, annotation: DocumentAnnotation) => {
    await saveDocumentAnnotationOnServer(documentId, annotation);
    const updatedDocuments = documents.map(document =>
      document.id === documentId
        ? { ...document, annotations: [...(document.annotations ?? []), annotation] }
        : document
    );
    setDocuments(updatedDocuments);
  };

  const handlePrepareDocumentText = async (documentId: string, file: File) => {
    const document = documents.find(item => item.id === documentId);
    if (!document) throw new Error("The selected document could not be found.");

    const processingResult = await processDocumentOnServer({
      documentId,
      caseId: document.caseId,
      file
    });
    const updatedDocuments = documents.map(item =>
      item.id === documentId
        ? {
            ...item,
            serverBacked: processingResult.contentAvailable,
            extractedText: processingResult.extractedText,
            extractionStatus: processingResult.extractionStatus,
            extractionMessage: processingResult.extractionMessage
          }
        : item
    );
    setDocuments(updatedDocuments);
    return processingResult.extractedText ?? "";
  };

  const handleSubmitCaseQuestion = async (
    caseId: string,
    scope: DocumentQuestionScope,
    text: string,
    documentId?: string
  ): Promise<DocumentQuestion> => {
    const trimmedText = text.trim();
    if (!termsAccepted) {
      throw new Error("Accept the Terms & Safety notice before asking a document question.");
    }
    const activeCaseData = cases.find(caseData => caseData.id === caseId);
    const caseDocuments = documents.filter(document => activeCaseData?.documentIds.includes(document.id));
    const selectedDocument = documentId ? caseDocuments.find(document => document.id === documentId) : undefined;
    const caseConversationDocument = activeCaseData?.conversationId
      ? documents.find((document) => document.id === activeCaseData.conversationId)
      : documents.find((document) => document.caseId === caseId && document.chatHistory.length > 0);

    if (!activeCaseData || !trimmedText || (scope === "document" && !selectedDocument)) {
      throw new Error("A saved case and valid question are required.");
    }

    const sourceDocuments = scope === "document" && selectedDocument ? [selectedDocument] : caseDocuments;
    const questionId = crypto.randomUUID();
    const userMessage: ChatMessage = { role: "user", text: trimmedText };
    const priorConversation = activeCaseData.conversationHistory ?? caseConversationDocument?.chatHistory ?? [];
    const priorContextSummary = activeCaseData.conversationContextSummary ?? caseConversationDocument?.contextSummary ?? "";
    const requestConfiguration = activeCaseData.conversationRequestConfiguration
      ?? caseConversationDocument?.requestConfiguration
      ?? DEFAULT_REQUEST_CONFIGURATION;
    const conversationId = activeCaseData.conversationId ?? caseConversationDocument?.id ?? crypto.randomUUID();
    let status: DocumentQuestion["status"] = "processing";
    let errorMessage: string | undefined;
    let retrievedDocumentIds: string[] = [];
    let responseText: string | undefined;
    let assistantMessage: ChatMessage | undefined;

    try {
      const preparedQuestion = await prepareCaseQuestionOnServer({
        questionId,
        caseId,
        scope,
        documentId: scope === "document" ? documentId : undefined,
        text: trimmedText,
      });
      retrievedDocumentIds = preparedQuestion.retrievedDocumentIds;
      const groundedDocuments = sourceDocuments
        .filter(document => retrievedDocumentIds.length === 0 || retrievedDocumentIds.includes(document.id))
        .slice(0, 5)
        .map(document => ({
          id: document.id,
          name: document.name,
          category: document.caseCategory,
          text: document.extractedText?.slice(0, 12_000) ?? ""
        }));
      const caseMemory = [
        priorContextSummary,
        `Case summary: ${activeCaseData.preparation?.summary ?? activeCaseData.description ?? activeCaseData.name}`,
        activeCaseData.preparation?.facts?.length ? `Important facts: ${activeCaseData.preparation.facts.join(" | ")}` : "",
      ].filter(Boolean).join("\n").slice(-4_000);
      const memory = compactChatMemory([...priorConversation, userMessage], caseMemory);
      const chat = await submitLegalChat({
        messages: memory.recentMessages,
        requestConfiguration,
        context: createCaseQuestionChatContext({
          chatId: conversationId,
          caseId,
          caseName: activeCaseData.name,
          scope,
          selectedDocumentId: scope === "document" ? documentId : undefined,
          documents: groundedDocuments,
          contextSummary: memory.contextSummary,
          language,
        })
      });
      requestPlanStateRefresh();
      responseText = chat.reply;
      assistantMessage = assistantMessageFromChat(chat);
      status = "answered";
    } catch (error) {
      console.warn("[Case question] backend preparation unavailable", { category: "case_question_backend_failure" });
      status = "error";
      errorMessage = safeInlineBackendMessage(error, "The question is saved locally, but the server copy could not be prepared.");
    }

    const conversationMemory = compactChatMemory(
      [...priorConversation, userMessage, ...(assistantMessage ? [assistantMessage] : [])],
      priorContextSummary,
    );
    let persistedConversationDocument: DocumentData = {
      id: conversationId,
      name: caseConversationDocument?.name ?? `${activeCaseData.name} case agent`,
      uploadedAt: Date.now(),
      chatHistory: conversationMemory.recentMessages,
      contextSummary: conversationMemory.contextSummary,
      caseId,
      requestConfiguration,
      webEnabled: activeCaseData.conversationWebEnabled ?? caseConversationDocument?.webEnabled ?? false,
      pinned: caseConversationDocument?.pinned ?? false,
      archived: false,
    };
    try {
      const persisted = await chatPersistenceQueue.current.run(conversationId, () => upsertBackendChat({
        id: conversationId,
        title: persistedConversationDocument.name.slice(0, 120),
        messages: conversationMemory.recentMessages,
        caseId,
        requestConfiguration,
        webEnabled: persistedConversationDocument.webEnabled ?? false,
        attachments: caseDocuments.slice(0, 20).map((document) => ({
          documentId: document.id,
          name: document.name,
          mimeType: document.mimeType ?? "application/octet-stream",
          size: document.size ?? 0,
        })),
        contextSummary: conversationMemory.contextSummary,
        pinned: persistedConversationDocument.pinned ?? false,
        archived: false,
      }));
      persistedConversationDocument = backendChatToDocument(persisted.chat);
    } catch {
      console.warn("[Case question] conversation persistence unavailable", { category: "case_conversation_persistence_failure" });
      errorMessage = errorMessage ?? "The answer is available now, but the case conversation could not be saved for refresh.";
    }

    const documentQuestion: DocumentQuestion = {
      id: questionId,
      text: trimmedText,
      createdAt: Date.now(),
      status,
      scope,
      sourceDocumentIds: sourceDocuments.map(document => document.id),
      retrievedDocumentIds,
      response: responseText,
      errorMessage
    };
    setCases((current) => current.map((caseData) => caseData.id === caseId
      ? {
          ...caseData,
          updatedAt: documentQuestion.createdAt,
          conversationId,
          conversationHistory: persistedConversationDocument.chatHistory,
          conversationContextSummary: persistedConversationDocument.contextSummary,
          conversationRequestConfiguration: persistedConversationDocument.requestConfiguration,
          conversationWebEnabled: persistedConversationDocument.webEnabled,
          caseQuestions: scope === "case"
            ? [...(caseData.caseQuestions ?? []), documentQuestion]
            : caseData.caseQuestions ?? [],
        }
      : caseData));
    setDocuments((current) => {
      const withQuestion = scope === "document"
        ? current.map((document) => document.id === documentId
            ? { ...document, documentQuestions: [...(document.documentQuestions ?? []), documentQuestion] }
            : document)
        : current;
      const existing = withQuestion.find((document) => document.id === conversationId);
      const mergedConversation = existing ? {
        ...existing,
        ...persistedConversationDocument,
        mimeType: existing.mimeType,
        size: existing.size,
        previewKind: existing.previewKind,
        extractedText: existing.extractedText,
        serverBacked: existing.serverBacked,
        extractionStatus: existing.extractionStatus,
        extractionMessage: existing.extractionMessage,
        caseCategory: existing.caseCategory,
        categorySource: existing.categorySource,
        documentQuestions: existing.documentQuestions,
        annotations: existing.annotations,
      } : persistedConversationDocument;
      return [mergedConversation, ...withQuestion.filter((document) => document.id !== conversationId)];
    });

    return documentQuestion;
  };

  const handleClearHistory = async () => {
    await chatPersistenceQueue.current.drain();
    await deleteAllBackendChats();
    setDocuments((current) => current.filter((document) => Boolean(document.caseId)));
    setLastDeletedChat(null);
    setActiveDocId(null);
    setActiveView("dashboard");
  };

  const handleLoginSuccess = async (
    user: { displayName: string; email: string; avatarColor: string },
    session: SessionPayload,
  ) => {
    setAuthUser(user);
    setIsAuthModalOpen(false);
    const completedAuth = deriveCompletedAuthState(session);
    const acceptedCurrent = completedAuth.acceptedCurrent;
    setConsentRequirements(completedAuth.requirements);
    setTermsAccepted(acceptedCurrent);
    setIsAdminEligible(completedAuth.adminEligible);
    if (isAppLanguage(session.language)) setLanguage(session.language);
    if (acceptedCurrent) {
      await completeAuthenticatedHandoff({
        loadWorkspace: loadBackendWorkspaceData,
        applyWorkspace: (workspace) => {
          setCases(workspace.cases);
          setDocuments(workspace.documents);
        },
        clearWorkspace: () => {
          setCases([]);
          setDocuments([]);
        },
        resumeAction: resumePendingProtectedAction,
      });
    } else {
      setCases([]);
      setDocuments([]);
    }
    requestPlanStateRefresh();
  };

  async function handleConsentAccepted() {
    setTermsAccepted(true);
    await completeAuthenticatedHandoff({
      loadWorkspace: loadBackendWorkspaceData,
      applyWorkspace: (workspace) => {
        setCases(workspace.cases);
        setDocuments(workspace.documents);
      },
      clearWorkspace: () => {
        setCases([]);
        setDocuments([]);
      },
      resumeAction: resumePendingProtectedAction,
    });
    requestPlanStateRefresh();
  }

  function commitSignedOutState() {
    setAuthUser(null);
    setIsAdminEligible(false);
    setTermsAccepted(false);
    setConsentRequirements(null);
    setDocuments([]);
    setCases([]);
    setActiveDocId(null);
    setActiveCaseId(null);
    setActiveView("dashboard");
    clearPendingProtectedAction();
  }

  async function handleConsentRefusal() {
    await runVerifiedLogout({
      destroySession: destroyBackendSession,
      commitSignedOut: commitSignedOutState,
    });
    requestPlanStateRefresh();
  }

  async function handleLogout() {
    try {
      await runVerifiedLogout({
        destroySession: destroyBackendSession,
        commitSignedOut: commitSignedOutState,
      });
    } catch {
      dispatchSafeAppError({
        referenceId: `logout_${crypto.randomUUID()}`,
        errorCode: "LOGOUT_NOT_CONFIRMED",
        httpStatus: 503,
        routeCategory: "auth",
        feature: "auth",
        presentation: "product",
        message: "We couldn't sign you out. You remain signed in. Please try again.",
      });
    } finally {
      requestPlanStateRefresh();
    }
  }

  const activeDoc = activeDocId ? documents.find(d => d.id === activeDocId) : null;
  const activeCase = activeCaseId ? cases.find(c => c.id === activeCaseId) : null;
  const isCaseWorkspaceOpen = activeView === "case_workspace" && !!activeCase;

  return (
    <div className="app-layout">
      <InterfaceTranslator language={language} />
      {!isCaseWorkspaceOpen && (
        <Sidebar 
          isOpen={isSidebarOpen} 
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          documents={documents}
          cases={cases}
          activeDocId={activeDocId}
          activeView={activeView}
          onSelectDoc={(id) => {
            setActiveDocId(id);
            setActiveCaseId(null);
            setActiveView("dashboard");
            if (window.matchMedia("(max-width: 820px)").matches) setIsSidebarOpen(false);
          }}
          onNewChat={handleNewChat}
          onRenameChat={(id) => void handleRenameChat(id)}
          onPinChat={(id, pinned) => void handlePinChat(id, pinned)}
          onArchiveChat={(id, archived) => void handleArchiveChat(id, archived)}
          onDeleteChat={(id) => void handleDeleteChat(id)}
          lastDeletedChatName={lastDeletedChat?.name}
          onRestoreLastDeletedChat={() => void handleRestoreLastDeletedChat()}
          onOpenCaseHub={handleOpenCaseHub}
            onOpenSettings={handleOpenSettings}
            onOpenPlans={() => { setPricingMode("plans"); setIsPricingOpen(true); }}
            onOpenTopUp={() => {
              const openTopUp = () => { setPricingMode("topup"); setIsPricingOpen(true); };
              if (authorizeProtectedAction(openTopUp)) openTopUp();
            }}
          onOpenHelp={() => setIsHelpOpen(true)}
          language={language}
        />
      )}
      {!isCaseWorkspaceOpen && isSidebarOpen && (
        <button
          className="sidebar-mobile-backdrop"
          type="button"
          aria-label={copy("shell.closeNavigation")}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      <main className="main-content" style={{ position: "relative" }}>
        {/* Language stays on the left; account and plan state stay compact on the right. */}
        {!isCaseWorkspaceOpen && (
          <div className="app-topbar">
            <div className="app-language-control">
              <label htmlFor="app-language">{copy("shell.language")}</label>
              <select id="app-language" value={language} onChange={(event) => handleLanguageChange(event.target.value as AppLanguage)}>
                <option value="en">English</option>
                <option value="hinglish">Hinglish</option>
                <option value="hi">हिन्दी</option>
              </select>
            </div>
            <div className="app-profile-control app-account-stack">
              <UserProfileButton
                user={authUser}
                onLoginClick={() => {
                  clearPendingProtectedAction();
                  setIsAuthModalOpen(true);
                }}
                onLogout={() => void handleLogout()}
                onAdminClick={() => {
                  if (!isAdminEligible) return;
                  const openAdmin = () => setIsAdminAuthOpen(true);
                  if (authorizeProtectedAction(openAdmin)) openAdmin();
                }}
                isAdminEligible={isAdminEligible}
              />
              <PlanHeaderControl language={language} onOpenPlans={() => { setPricingMode("plans"); setIsPricingOpen(true); }} />
            </div>
          </div>
        )}

        {!isCaseWorkspaceOpen && !isSidebarOpen && (
          <button
            className="btn mobile-sidebar-open"
            type="button"
            aria-label={copy("shell.openNavigation")}
            title={copy("shell.openNavigation")}
            onClick={() => setIsSidebarOpen(true)}
            style={{ position: "absolute", top: "1.5rem", left: "1.5rem", zIndex: 50, padding: "0.5rem" }}
          >
            <PanelLeft size={20} />
          </button>
        )}
        
        {activeDoc ? (
          <AnalysisPage 
            document={activeDoc} 
            isNew={activeDoc.id === newlyUploadedDocId} 
            onClearNew={() => setNewlyUploadedDocId(null)} 
            onUpdateChat={updateDocumentChat}
            onUpdateRequestConfiguration={updateDocumentRequestConfiguration}
            onUpdateWebEnabled={updateDocumentWebEnabled}
            termsAccepted={termsAccepted}
            onGenerateCase={handleGenerateCaseFromChat}
            language={language}
          />
        ) : activeView === "case_hub" ? (
          <CaseHub
            cases={cases}
            documents={documents}
            onCreateCase={() => {
              const openCreateCase = () => setIsCreateCaseModalOpen(true);
              if (authorizeProtectedAction(openCreateCase)) openCreateCase();
            }}
            onOpenCase={handleOpenCase}
            onDeleteCase={(caseItem) => void handleDeleteCase(caseItem)}
            lastDeletedCase={lastDeletedCase}
            onRestoreLastDeleted={() => void handleRestoreLastDeletedCase()}
            actionError={caseActionError}
            language={language}
          />
        ) : activeView === "case_workspace" && activeCase ? (
          <CaseWorkspace 
            caseData={activeCase}
            documents={documents}
            onUpload={(file, category) => handleUpload(file, activeCase.id, category)}
            onUpdateDocumentCategory={handleUpdateDocumentCategory}
            onAddAnnotation={handleAddDocumentAnnotation}
            onPrepareDocumentText={handlePrepareDocumentText}
            onSubmitQuestion={handleSubmitCaseQuestion}
            onRetryAnalysis={() => handleRetryCaseAnalysis(activeCase.id)}
            onBackToCases={handleOpenCaseHub}
            onRefreshCase={refreshCasesFromBackend}
            language={language}
          />
        ) : (
          <LegalAiWorkspace
            role={role}
            isAuthenticated={Boolean(authUser)}
            onStartSession={handleWorkspaceStart}
            termsAccepted={termsAccepted}
            language={language}
            onOpenCreateCase={() => {
              const openCreateCase = () => setIsCreateCaseModalOpen(true);
              if (authorizeProtectedAction(openCreateCase)) openCreateCase();
            }}
          />
        )}
      </main>

      <CreateCaseModal 
        isOpen={isCreateCaseModalOpen} 
        onClose={() => setIsCreateCaseModalOpen(false)} 
        onCreateCase={handleCreateCase}
        onViewExistingCases={() => { setIsCreateCaseModalOpen(false); handleOpenCaseHub(); }}
        onUpgrade={() => { setIsCreateCaseModalOpen(false); setPricingMode("plans"); setIsPricingOpen(true); }}
        language={language}
      />
      <AdminAuthModal 
        isOpen={isAdminAuthOpen} 
        onClose={() => setIsAdminAuthOpen(false)} 
        onSuccess={() => { setIsAdminAuthOpen(false); setActiveView("admin_dashboard"); }}
      />
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        onClearHistory={handleClearHistory}
        initialTab={settingsInitialTab}
        onOpenPlans={() => { setIsSettingsOpen(false); setPricingMode("plans"); setIsPricingOpen(true); }}
        onReviewConsent={() => { setIsSettingsOpen(false); setIsConsentReviewOpen(true); }}
        authUser={authUser}
        language={language}
      />
      <AuthModal
        isOpen={isAuthModalOpen}
        language={language}
        onClose={() => {
          setIsAuthModalOpen(false);
          clearPendingProtectedAction();
        }}
        onLoginSuccess={handleLoginSuccess}
        reason={authModalReason}
      />
      <PricingModal
        isOpen={isPricingOpen}
        mode={pricingMode}
        language={language}
        onClose={() => setIsPricingOpen(false)}
        onRequireSignIn={() => {
          const reopenPlans = () => { setPricingMode("plans"); setIsPricingOpen(true); };
          setIsPricingOpen(false);
          if (authorizeProtectedAction(reopenPlans)) reopenPlans();
        }}
      />
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} language={language} />
      {consentRequirements && (
        <ConsentModal
          isOpen={isConsentReviewOpen}
          requirements={consentRequirements}
          language={language}
          reviewOnly
          onClose={() => setIsConsentReviewOpen(false)}
        />
      )}
    </div>
  );
}
