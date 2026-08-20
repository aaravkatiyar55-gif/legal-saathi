export type ChatCitation = {
  title: string;
  url?: string;
  excerpt?: string;
  authority?: string;
  retrievedAt?: string;
};
export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  citations?: ChatCitation[];
  groundingStatus?: "grounded" | "insufficient" | "disabled" | "unavailable";
  agent?: { state: string; publicStatus: string; toolSummaries: string[]; requiresConfirmation?: boolean };
  isSuperseded?: boolean;
};

export type SubscriptionPlan = "free" | "plus" | "pro" | "max";

export type LegalAiModel = "auto" | "fast" | "flash" | "pro" | "ultra";

export type ThinkingMode = "default" | "standard" | "extended";

export type RequestSpeed = "normal" | "1.5x" | "2x";

export type RequestConfiguration = {
  model: LegalAiModel;
  thinkingMode: ThinkingMode;
  speed: RequestSpeed;
};

export type UsageData = {
  plan: SubscriptionPlan;
  creditsTotal: number;
  creditsRemaining: number;
  nextResetAt: number;
  dailyResetAt?: number;
  weeklyResetAt?: number;
  autoUsesRemaining: number;
};

export type DocumentPreviewKind = "image" | "pdf" | "text" | "office" | "spreadsheet" | "video" | "unknown";

export type DocumentCategory =
  | "Pleadings"
  | "Affidavits"
  | "Notices"
  | "Evidence"
  | "Orders"
  | "Contracts"
  | "Correspondence"
  | "Other";

export type DocumentCategorySource = "none" | "rule" | "manual" | "ai";

export type DocumentExtractionStatus = "pending" | "complete" | "unavailable" | "failed";

export type DocumentQuestionStatus = "awaiting_integration" | "processing" | "answered" | "error";

export type DocumentQuestionScope = "document" | "case";

export type ChatPersistenceStatus = "saving" | "saved" | "unavailable";

export type DocumentAnnotation = {
  id: string;
  documentId: string;
  selectedText: string;
  comment: string;
  createdAt: number;
};

export type DocumentQuestion = {
  id: string;
  text: string;
  createdAt: number;
  status: DocumentQuestionStatus;
  scope?: DocumentQuestionScope;
  sourceDocumentIds?: string[];
  retrievedDocumentIds?: string[];
  response?: string;
  errorMessage?: string;
};

export type DocumentData = {
  id: string;           // crypto.randomUUID()
  name: string;         // filename
  uploadedAt: number;   // Date.now()
  chatHistory: ChatMessage[];
  caseId?: string;      // optional link to a case
  mimeType?: string;
  size?: number;
  storageKey?: string;
  previewKind?: DocumentPreviewKind;
  caseCategory?: DocumentCategory;
  categorySource?: DocumentCategorySource;
  extractedText?: string;
  serverStorageKey?: string;
  /** True when the authenticated backend can serve the file without exposing its storage path. */
  serverBacked?: boolean;
  extractionStatus?: DocumentExtractionStatus;
  extractionMessage?: string;
  documentQuestions?: DocumentQuestion[];
  annotations?: DocumentAnnotation[];
  requestConfiguration?: RequestConfiguration;
  webEnabled?: boolean;
  contextSummary?: string;
  chatPersistenceStatus?: ChatPersistenceStatus;
  pinned?: boolean;
  archived?: boolean;
};

export type CaseData = {
  id: string;           // crypto.randomUUID()
  name: string;
  clientName?: string;
  description?: string;
  typeTag?: "Litigation" | "Corporate" | "Real Estate" | "Intellectual Property" | "Other";
  createdAt: number;
  updatedAt?: number;
  documentIds: string[];
  documentLoadStatus?: "loading" | "empty" | "available" | "failed";
  caseQuestions?: DocumentQuestion[];
  conversationId?: string;
  conversationHistory?: ChatMessage[];
  conversationContextSummary?: string;
  conversationRequestConfiguration?: RequestConfiguration;
  conversationWebEnabled?: boolean;
  /** Set to true when AI analysis is still running in the background after case creation */
  aiAnalysisPending?: boolean;
  preparation?: {
    summary: string;
    facts: string[];
    timeline: string[];
    parties: string[];
    relief: string[];
    missingInformation: string[];
    risks: string[];
    questionsForUser: string[];
  };
};

export type AppView = "dashboard" | "case_hub" | "case_workspace" | "admin_dashboard";

export type CustomModel = {
  id: string;           // crypto.randomUUID()
  name: string;
  cost: number;         // cost per 1k tokens
};

export type UserProfile = {
  displayName: string;
  nickname: string;
  email: string;
  avatarColor: string;  // hex color from AVATAR_COLORS array
};

export type AppSettings = {
  theme: "dark" | "light";
  fontSize: number;     // 12–20
  accentColor: string;  // hex from ACCENT_COLORS
  notifications: {
    caseUpdates: boolean;
    analysisComplete: boolean;
    weeklyDigest: boolean;
    securityAlerts: boolean;
  };
  legal: {
    jurisdiction: string;  // from JURISDICTIONS array
    lawAreas: string[];    // from LAW_AREAS array
  };
};
