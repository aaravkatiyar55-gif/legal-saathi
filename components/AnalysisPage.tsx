"use client";
import { Copy, Download, ExternalLink, FileText, Loader2, Pencil, RefreshCw, Send, Sparkles, Square, X } from "lucide-react";
import { DocumentData, ChatMessage, RequestConfiguration } from "@/lib/types";
import { autoResizeTextarea } from "@/lib/autoResizeTextarea";
import {
  DEFAULT_REQUEST_CONFIGURATION
} from "@/lib/requestSettings";
import { BackendApiError, cancelLegalChat, chatFailureMessage, getWebSearchStatus, safeInlineBackendMessage, submitLegalChat } from "@/lib/backendApi";
import { useEffect, useRef, useState } from "react";
import ProgressOverlay from "./ProgressOverlay";
import RequestControls from "./RequestControls";
import { usePlanState } from "./PlanStateProvider";
import DictationControl from "./DictationControl";
import { useSafeAppError } from "./AppErrorProvider";
import AttachmentMenu from "./AttachmentMenu";
import { translateUiText } from "@/lib/i18n";
import { appCopy } from "@/lib/i18n/appCopy";
import { canRefreshAiRequestStatus, getAiRequestAvailability } from "@/lib/aiRequestAvailability";
import { getWebResearchAvailability, getWebResearchAvailabilityMessage } from "@/lib/webResearchAvailability";
import { chatMemoryPersistenceNotice } from "@/lib/chatMemory";

type PendingChatRequest = {
  requestId: string;
  documentId: string;
  userHistory: ChatMessage[];
  requestConfiguration: RequestConfiguration;
  context: Record<string, unknown>;
  displayHistory?: ChatMessage[];
};

export function getAnalysisPageWebPresentation(
  configured: boolean | null,
  includedInPlan: boolean | null | undefined,
) {
  const availability = getWebResearchAvailability(configured, includedInPlan);
  return {
    availability,
    available: availability === "available",
    unavailableMessage: availability === "available"
      ? undefined
      : getWebResearchAvailabilityMessage(availability),
  };
}

interface AnalysisPageProps {
  document: DocumentData;
  isNew: boolean;
  onClearNew: () => void;
  onUpdateChat: (docId: string, history: ChatMessage[]) => Promise<void>;
  onUpdateRequestConfiguration: (docId: string, requestConfiguration: RequestConfiguration) => void;
  onUpdateWebEnabled: (docId: string, webEnabled: boolean) => void;
  termsAccepted: boolean;
  onGenerateCase: (document: DocumentData) => Promise<void>;
  language: "en" | "hinglish" | "hi";
}

function renderFormattedText(text: string) {
  return text.split("\n").map((line, index) => {
    if (!line.trim()) {
      return <div key={index} className="legal-response-gap" data-no-i18n />;
    }

    if (line.startsWith("## ")) {
      return <h3 key={index} data-no-i18n>{line.replace("## ", "")}</h3>;
    }

    if (line.startsWith("### ")) {
      return <h4 key={index} data-no-i18n>{line.replace("### ", "")}</h4>;
    }

    if (line.startsWith("- ")) {
      return <p key={index} className="legal-response-bullet" data-no-i18n>{line.replace("- ", "")}</p>;
    }

    return <p key={index} data-no-i18n>{line}</p>;
  });
}

function citationDomain(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function citationRetrievedAt(value?: string, language: AnalysisPageProps["language"] = "en") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = language === "hi" ? "hi-IN" : "en-IN";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AnalysisPage({
  document,
  isNew,
  onClearNew,
  onUpdateChat,
  onUpdateRequestConfiguration,
  onUpdateWebEnabled,
  termsAccepted,
  onGenerateCase,
  language
}: AnalysisPageProps) {
  const hasUploadedFile = Boolean(document.mimeType || document.storageKey);
  const [showOverlay, setShowOverlay] = useState(isNew && hasUploadedFile);
  const [inputText, setInputText] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | undefined>();
  const [isThinking, setIsThinking] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<"idle" | "ready">("idle");
  const [requestConfiguration, setRequestConfiguration] = useState<RequestConfiguration>(
    document.requestConfiguration ?? DEFAULT_REQUEST_CONFIGURATION
  );
  const [webEnabled, setWebEnabled] = useState(document.webEnabled ?? false);
  const [webConfigured, setWebConfigured] = useState<boolean | null>(null);
  const [requestError, setRequestError] = useState("");
  const [failedRequest, setFailedRequest] = useState<PendingChatRequest | null>(null);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const followUpTextareaRef = useRef<HTMLTextAreaElement>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const { planState, estimateUnits, refresh, loading: isPlanStateLoading, error: planStateError } = usePlanState();
  const { clearSafeError } = useSafeAppError();
  const t = (text: string) => translateUiText(text, language);
  const copy = (key: Parameters<typeof appCopy>[1]) => appCopy(language, key);
  const webPresentation = getAnalysisPageWebPresentation(webConfigured, planState?.entitlements.web);
  const aiRequestAvailability = getAiRequestAvailability(planState?.entitlements.providerAvailability, requestConfiguration.model);
  const aiAvailabilityMessage = planStateError
    ? "We couldn't confirm the AI service status. Refresh and try again."
    : aiRequestAvailability.message;
  const isAiRequestBlocked = Boolean(planStateError) || !aiRequestAvailability.available;
  const canRefreshAiStatus = canRefreshAiRequestStatus({
    availability: aiRequestAvailability,
    planStateError,
    planStateLoading: isPlanStateLoading,
  });
  const memoryNotice = document.chatPersistenceStatus
    ? chatMemoryPersistenceNotice(document.chatPersistenceStatus)
    : document.contextSummary
      ? "Earlier messages are retained as a private conversation memory summary."
      : "";

  useEffect(() => {
    if (isNew && hasUploadedFile) setShowOverlay(true);
    else if (isNew) onClearNew();
  }, [isNew, hasUploadedFile, onClearNew]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [document.chatHistory, isThinking]);

  useEffect(() => {
    autoResizeTextarea(followUpTextareaRef.current, 184);
  }, [inputText]);

  useEffect(() => {
    setRequestConfiguration(document.requestConfiguration ?? DEFAULT_REQUEST_CONFIGURATION);
    setWebEnabled(document.webEnabled ?? false);
    setRequestError("");
    setFailedRequest(null);
  }, [document.id, document.requestConfiguration, document.webEnabled]);

  useEffect(() => {
    void getWebSearchStatus()
      .then((status) => setWebConfigured(status.configured))
      .catch(() => setWebConfigured(false));
  }, []);

  const handleComplete = () => {
    setShowOverlay(false);
    onClearNew();
  };

  const executeChatRequest = async (pending: PendingChatRequest) => {
    if (isThinking) return;
    setIsThinking(true);
    activeRequestIdRef.current = pending.requestId;
    setRequestError("");
    try {
      const chat = await submitLegalChat({
        requestId: pending.requestId,
        messages: pending.userHistory,
        requestConfiguration: pending.requestConfiguration,
        context: pending.context,
      });
      await refresh();
      clearSafeError(pending.requestId);
      setFailedRequest(null);
      const completedHistory: ChatMessage[] = [
        ...(pending.displayHistory ?? pending.userHistory),
        {
          role: "assistant",
          text: chat.reply,
          citations: [
            ...(chat.web?.sources ?? []).map((source) => ({
              title: source.title,
              url: source.url,
              excerpt: source.excerpt,
              authority: source.authority,
              retrievedAt: source.retrievedAt,
            })),
            ...(chat.grounding?.citations ?? []).map((citation) => ({
              title: citation.label,
              url: citation.url,
              excerpt: citation.page ? `Page ${citation.page}` : citation.jurisdiction,
              authority: citation.authority,
            })),
          ],
          groundingStatus: chat.grounding?.status,
          agent: chat.agent ? {
            state: chat.agent.state,
            publicStatus: chat.agent.publicStatus,
            toolSummaries: chat.agent.toolSummaries,
            requiresConfirmation: chat.agent.requiresConfirmation,
          } : undefined,
        },
      ];
      try {
        await onUpdateChat(pending.documentId, completedHistory);
      } catch {
        setRequestError(t("The answer was received, but this conversation could not be saved. Try again after checking the connection."));
      }
    } catch (error) {
      if (error instanceof BackendApiError && error.code === "REQUEST_CANCELLED") {
        setFailedRequest(null);
        setRequestError(error.message);
        await refresh();
        return;
      }
      setFailedRequest(pending);
      if (error instanceof BackendApiError) {
        setRequestError(`${t(chatFailureMessage(error))} ${t("Reference")}: ${error.requestId.slice(0, 18)}`);
      } else {
        setRequestError(`${t(chatFailureMessage(error))} ${t("Reference")}: ${pending.requestId.slice(0, 18)}`);
      }
      await refresh();
    } finally {
      if (activeRequestIdRef.current === pending.requestId) activeRequestIdRef.current = null;
      setIsThinking(false);
    }
  };

  const retryFailedRequest = (mode: "recover" | "restart") => {
    if (!failedRequest || isThinking) return;
    const pending = mode === "restart"
      ? { ...failedRequest, requestId: crypto.randomUUID() }
      : failedRequest;
    void executeChatRequest(pending);
  };

  const handleSend = async () => {
    const trimmedInput = inputText.trim();
    if ((!trimmedInput && !attachedFile) || isThinking) return;

    if (!termsAccepted) {
      setRequestError(language === "hi" ? "आगे का संदेश भेजने से पहले नियम और सुरक्षा सूचना स्वीकार करें।" : language === "hinglish" ? "Follow-up bhejne se pehle Terms aur Safety notice accept karein." : "Accept the Terms & Safety notice before sending a follow-up.");
      return;
    }

    if (planState && !planState.entitlements.allowedModels.includes(requestConfiguration.model)) {
      setRequestError(language === "hi"
        ? `${requestConfiguration.model} आपके मौजूदा प्लान या प्रदाता कॉन्फ़िगरेशन में उपलब्ध नहीं है।`
        : language === "hinglish"
          ? `${requestConfiguration.model} aapke current plan ya provider configuration mein available nahi hai.`
          : `${requestConfiguration.model} is not available on your current plan or provider configuration.`);
      return;
    }
    if (isAiRequestBlocked) {
      setRequestError(t(aiAvailabilityMessage ?? "The selected AI service could not complete this request right now."));
      return;
    }
    if (webEnabled && !webPresentation.available) {
      setRequestError(t(webPresentation.unavailableMessage ?? "Web research is unavailable in this environment. You can still ask a question without it."));
      return;
    }
    const contextCharacters = document.extractedText?.slice(0, 30_000).length ?? 0;
    const estimatedUnits = estimateUnits(requestConfiguration, { webEnabled, contextCharacters });
    if (planState && planState.balances.totalRemaining < estimatedUnits) {
      setRequestError(language === "hi"
        ? `इस अनुरोध के लिए लगभग ${estimatedUnits} यूनिट चाहिए, लेकिन ${planState.balances.totalRemaining} शेष हैं।`
        : language === "hinglish"
          ? `Is request ko lagbhag ${estimatedUnits} units chahiye, lekin ${planState.balances.totalRemaining} bache hain.`
          : `This request needs about ${estimatedUnits} units, but ${planState.balances.totalRemaining} remain.`);
      return;
    }

    const sentAttachmentName = attachedFile?.name;
    const userText = [
      trimmedInput || "Please review the attached document.",
      sentAttachmentName ? `Attached document: ${sentAttachmentName}` : ""
    ].filter(Boolean).join("\n\n");

    const baseHistory = editingMessageIndex === null
      ? document.chatHistory
      : document.chatHistory.slice(0, editingMessageIndex);
    const userHistory: ChatMessage[] = [...baseHistory, { role: "user", text: userText }];
    try {
      await onUpdateChat(document.id, userHistory);
    } catch {
      setRequestError(t("The conversation could not be saved. Your message is still in the composer."));
      return;
    }
    setInputText("");
    setAttachedFile(undefined);
    setRequestError("");
    setFailedRequest(null);
    setGenerationStatus("idle");
    setEditingMessageIndex(null);
    await executeChatRequest({
      requestId: crypto.randomUUID(),
      documentId: document.id,
      userHistory,
      requestConfiguration,
      context: {
        chatId: document.id,
        documentId: document.id,
        documentName: document.name,
        documentMimeType: document.mimeType,
        documentText: document.extractedText?.slice(0, 30_000),
        attachedFileName: sentAttachmentName,
        webEnabled,
        termsAccepted,
        language,
        contextSummary: document.contextSummary,
      },
    });
  };

  const requestContext = () => ({
    chatId: document.id,
    documentId: document.id,
    documentName: document.name,
    documentMimeType: document.mimeType,
    documentText: document.extractedText?.slice(0, 30_000),
    webEnabled,
    termsAccepted,
    language,
    contextSummary: document.contextSummary,
  });

  const handleStop = async () => {
    const requestId = activeRequestIdRef.current;
    if (!requestId) return;
    setActionMessage(language === "hi" ? "अनुरोध रोका जा रहा है..." : language === "hinglish" ? "Request rok raha hoon..." : "Stopping the request...");
    try {
      await cancelLegalChat(requestId);
    } catch (error) {
      if (error instanceof BackendApiError && error.code === "ACTIVE_REQUEST_NOT_FOUND") return;
      setRequestError(language === "hi" ? "अनुरोध अभी रोका नहीं जा सका।" : language === "hinglish" ? "Request abhi stop nahi ho saka." : "The request could not be stopped yet.");
    }
  };

  const handleRegenerate = async (assistantIndex: number) => {
    if (isThinking || assistantIndex !== document.chatHistory.length - 1) return;
    const userIndex = [...document.chatHistory.slice(0, assistantIndex)].map((message) => message.role).lastIndexOf("user");
    if (userIndex < 0) return;
    const providerHistory = document.chatHistory.slice(0, assistantIndex);
    const displayHistory = document.chatHistory.map((message, index) => index === assistantIndex ? { ...message, isSuperseded: true } : message);
    await executeChatRequest({
      requestId: crypto.randomUUID(),
      documentId: document.id,
      userHistory: providerHistory,
      displayHistory,
      requestConfiguration,
      context: requestContext(),
    });
  };

  const handleEdit = (messageIndex: number, text: string) => {
    if (isThinking) return;
    setEditingMessageIndex(messageIndex);
    setInputText(text);
    setActionMessage(language === "hi" ? "संपादन के बाद भेजें। बाद के संदेश नई शाखा से बदल जाएंगे।" : language === "hinglish" ? "Edit karke bhejein. Baad ke messages nayi branch se replace honge." : "Edit and resend. Later messages will be replaced by the new branch.");
    window.setTimeout(() => followUpTextareaRef.current?.focus(), 0);
  };

  const handleCopy = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setActionMessage(language === "hi" ? "उत्तर कॉपी हो गया।" : language === "hinglish" ? "Answer copy ho gaya." : "Answer copied.");
    } catch {
      setRequestError(language === "hi" ? "उत्तर कॉपी नहीं हो सका।" : language === "hinglish" ? "Answer copy nahi ho saka." : "The answer could not be copied.");
    }
  };

  const handleExport = () => {
    const lines = document.chatHistory.flatMap((message) => [
      `${message.role === "assistant" ? "Legal Saathi" : "User"}:`,
      message.text,
      ...(message.citations ?? []).flatMap((citation) => citation.url ? [`Source: ${citation.title} - ${citation.url}`] : [`Source: ${citation.title}`]),
      "",
    ]);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "legal-saathi-conversation.txt";
    anchor.click();
    URL.revokeObjectURL(url);
    setActionMessage(language === "hi" ? "निर्यात तैयार है। साझा करने से पहले संवेदनशील जानकारी जाँचें।" : language === "hinglish" ? "Export ready hai. Share karne se pehle sensitive information check karein." : "Export ready. Review sensitive information before sharing.");
  };

  const clearAttachedFile = () => {
    setAttachedFile(undefined);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.key !== "Enter" || event.shiftKey) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleGenerateDocument = async () => {
    setGenerationStatus("idle");
    setRequestError("");
    try {
      await onGenerateCase(document);
      setGenerationStatus("ready");
    } catch (error) {
      setRequestError(safeInlineBackendMessage(error, "The case preparation workspace could not be created."));
    }
  };

  const handleRequestConfigurationChange = (nextConfiguration: RequestConfiguration) => {
    setRequestConfiguration(nextConfiguration);
    onUpdateRequestConfiguration(document.id, nextConfiguration);
  };

  const handleWebToggle = () => {
    if (!webPresentation.available) {
      setRequestError(t(webPresentation.unavailableMessage ?? "Web research is unavailable in this environment. You can still ask a question without it."));
      return;
    }
    const nextValue = !webEnabled;
    setWebEnabled(nextValue);
    setRequestError("");
    onUpdateWebEnabled(document.id, nextValue);
  };

  if (showOverlay) {
    return (
      <ProgressOverlay
        language={language}
        stages={[
          copy("progress.readingInput"),
          copy("progress.identifyingLegalContext"),
          copy("progress.preparingAiResponse"),
          copy("progress.openingConversation"),
        ]}
        onComplete={handleComplete}
      />
    );
  }

  const hasAssistantResponse = document.chatHistory.some(message => message.role === "assistant");

  return (
    <div className="legal-conversation-shell fade-in">
      <header className="legal-conversation-header">
        <div>
          <span className="legal-conversation-kicker">{t("Legal Saathi AI workspace")}</span>
          <h1 data-no-i18n>{document.name}</h1>
        </div>
        <button type="button" className="legal-conversation-tool" onClick={handleExport} aria-label={language === "hi" ? "बातचीत निर्यात करें" : language === "hinglish" ? "Conversation export karein" : "Export conversation"}>
          <Download size={16} />
        </button>
        <div className="legal-conversation-file">
          <FileText size={18} />
          <span>{t(document.name === "Legal AI Conversation" ? "Chat-only session" : "Document context active")}</span>
        </div>
      </header>

      <section className="legal-thread" aria-label={copy("conversation.ariaLabel")}>
        {memoryNotice && (
          <div className="legal-memory-notice" role="note">
            {t(memoryNotice)}
          </div>
        )}
        {document.chatHistory.map((message, index) => (
          <article key={index} className={`legal-message ${message.role}`}>
            <div className="legal-message-avatar" aria-hidden="true">
              {message.role === "assistant" ? <Sparkles size={18} /> : "You"}
            </div>
            <div className="legal-message-content">
              {message.role === "assistant" ? renderFormattedText(message.text) : <p data-no-i18n>{message.text}</p>}
              {message.isSuperseded && <span className="legal-message-version">{language === "hi" ? "पिछला संस्करण" : language === "hinglish" ? "Pichhla version" : "Previous version"}</span>}
              {message.role === "assistant" && message.groundingStatus === "grounded" && (
                <div className="legal-grounding-status" role="status">{t("Grounded with retrieval, citations and abstention safeguards.")}</div>
              )}
              {message.role === "assistant" && message.agent && (
                <div className="legal-agent-summary" role="status">
                  <strong data-no-i18n>{message.agent.publicStatus}</strong>
                  {message.agent.toolSummaries.length > 0 && (
                    <span data-no-i18n>{message.agent.toolSummaries.map((tool) => tool.replaceAll("_", " ")).join(" · ")}</span>
                  )}
                </div>
              )}
              {message.role === "assistant" && message.citations && message.citations.length > 0 && (
                <aside className="legal-message-citations" aria-label={copy("conversation.citationsAriaLabel")}>
                  <strong>{language === "hi" ? "आधिकारिक स्रोत" : language === "hinglish" ? "Adhikarik sources" : "Official sources"}</strong>
                  {message.citations.map((citation) => (
                    citation.url ? (
                      <a className="legal-source-card" key={`${citation.url}:${citation.title}`} href={citation.url} target="_blank" rel="noreferrer noopener">
                        <span className="legal-source-card-meta">
                          <span data-no-i18n>{citation.authority || citationDomain(citation.url)}</span>
                          <ExternalLink size={14} aria-hidden="true" />
                        </span>
                        <span className="legal-source-card-title" data-no-i18n>{citation.title}</span>
                        {citation.excerpt && <small data-no-i18n>{citation.excerpt}</small>}
                        <span className="legal-source-card-foot">
                          <span data-no-i18n>{citationDomain(citation.url)}</span>
                          {citationRetrievedAt(citation.retrievedAt, language) && (
                            <span>{language === "hi" ? "प्राप्त" : language === "hinglish" ? "Mila" : "Retrieved"}: {citationRetrievedAt(citation.retrievedAt, language)}</span>
                          )}
                        </span>
                      </a>
                    ) : (
                      <div className="legal-private-citation" key={`private:${citation.title}`}>
                        {citation.authority && <span className="legal-source-card-meta" data-no-i18n>{citation.authority}</span>}
                        <span className="legal-source-card-title" data-no-i18n>{citation.title}</span>
                        {citation.excerpt && <small data-no-i18n>{citation.excerpt}</small>}
                      </div>
                    )
                  ))}
                </aside>
              )}
              <div className="legal-message-actions">
                {message.role === "assistant" && (
                  <button type="button" onClick={() => void handleCopy(message)} aria-label={copy("conversation.copyAnswer")} title={copy("conversation.copyAnswer")}>
                    <Copy size={14} />
                  </button>
                )}
                {message.role === "assistant" && index === document.chatHistory.length - 1 && (
                  <button type="button" disabled={isThinking} onClick={() => void handleRegenerate(index)} aria-label={copy("conversation.regenerateAnswer")} title={copy("conversation.regenerateAnswer")}>
                    <RefreshCw size={14} />
                  </button>
                )}
                {message.role === "user" && (
                  <button type="button" disabled={isThinking} onClick={() => handleEdit(index, message.text)} aria-label={copy("conversation.editMessage")} title={copy("conversation.editMessage")}>
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}

        {isThinking && (
          <article className="legal-message assistant">
            <div className="legal-message-avatar" aria-hidden="true">
              <Sparkles size={18} />
            </div>
            <div className="legal-message-content legal-thinking">
              <Loader2 size={18} className="spin" />
              {language === "hi" ? "आपके अनुरोध को समझा जा रहा है..." : language === "hinglish" ? "Aapki request samajh raha hoon..." : "Understanding your request..."}
            </div>
          </article>
        )}

        {hasAssistantResponse && !isThinking && (
          <div className="legal-generate-panel">
            <div>
              <strong>{t("Continue this matter in a Case Workspace")}</strong>
              <span>{t("Move this full conversation and its private memory into a document-aware Case Agent workspace.")}</span>
            </div>
            <button type="button" className="legal-generate-btn" onClick={handleGenerateDocument}>
              <Sparkles size={18} />
              {t("Open in Case Workspace")}
            </button>
          </div>
        )}

        {generationStatus === "ready" && (
          <div className="legal-generation-note" role="status">
            {t("Your structured case-preparation workspace is ready.")}
          </div>
        )}

        <div ref={messagesEndRef} />
      </section>

      <footer className="legal-chatbar">
        <AttachmentMenu
          buttonClassName="legal-attach-btn"
          selectedFile={attachedFile}
          onSelect={setAttachedFile}
          disabled={isThinking}
          webEnabled={webEnabled}
          webAvailable={webPresentation.available}
          webUnavailableMessage={webPresentation.unavailableMessage}
          onToggleWeb={handleWebToggle}
          language={language}
        />
        <div className="legal-chatbar-main">
          {attachedFile && (
            <div className="legal-chatbar-attachment" role="status">
              <FileText size={15} />
              <span data-no-i18n>{attachedFile.name}</span>
              <button type="button" onClick={clearAttachedFile} aria-label={t("Remove attached document")}>
                <X size={14} />
              </button>
            </div>
          )}
          {editingMessageIndex !== null && (
            <div className="legal-editing-banner" role="status">
              <span>{language === "hi" ? "संदेश संपादित किया जा रहा है" : language === "hinglish" ? "Message edit ho raha hai" : "Editing message"}</span>
              <button type="button" onClick={() => { setEditingMessageIndex(null); setInputText(""); setActionMessage(""); }} aria-label={language === "hi" ? "संपादन रद्द करें" : language === "hinglish" ? "Edit cancel karein" : "Cancel editing"}><X size={14} /></button>
            </div>
          )}
          <label className="sr-only" htmlFor="legal-follow-up">
            {t("Ask a follow-up legal question")}
          </label>
          <textarea
            ref={followUpTextareaRef}
            id="legal-follow-up"
            value={inputText}
            onChange={(event) => {
              setInputText(event.target.value);
              autoResizeTextarea(event.currentTarget, 184);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("Ask a follow-up, add facts, or request a draft direction...")}
            rows={1}
          />
          <RequestControls
            value={requestConfiguration}
            onChange={handleRequestConfigurationChange}
            disabled={isThinking}
            className="legal-chatbar-request-controls"
            webEnabled={webEnabled}
            contextCharacters={document.extractedText?.slice(0, 30_000).length ?? 0}
            language={language}
          />
          {requestError && (
            <div className="legal-chatbar-error" role="alert">
              <span>{requestError}</span>
              {failedRequest && (
                <div className="legal-chatbar-error-actions">
                  <button type="button" className="btn" disabled={isThinking} onClick={() => retryFailedRequest("recover")}>
                    {t("Check previous response")}
                  </button>
                  <button type="button" className="btn" disabled={isThinking} onClick={() => retryFailedRequest("restart")}>
                    {t("Start a new request")}
                  </button>
                </div>
              )}
            </div>
          )}
          {isAiRequestBlocked && aiAvailabilityMessage && (
            <div className="legal-chatbar-note" role="status" aria-live="polite">
              <span>{t(aiAvailabilityMessage)}</span>
              {canRefreshAiStatus && (
                <button type="button" className="btn" disabled={isPlanStateLoading || isThinking} onClick={() => void refresh()}>
                  {t("Refresh status")}
                </button>
              )}
            </div>
          )}
          {actionMessage && <div className="legal-chatbar-note" role="status">{actionMessage}</div>}
        </div>
        <div className="legal-chatbar-actions">
          <DictationControl
            value={inputText}
            onChange={(nextText) => {
              setInputText(nextText);
              if (requestError) setRequestError("");
            }}
            language={language}
            disabled={isThinking}
            onMessage={setRequestError}
          />
          {isThinking ? (
            <button type="button" className="legal-chatbar-send legal-stop-btn" onClick={() => void handleStop()} aria-label={language === "hi" ? "उत्तर बनाना रोकें" : language === "hinglish" ? "Answer banana rokein" : "Stop generation"}>
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              className="legal-chatbar-send"
              onClick={handleSend}
              disabled={isAiRequestBlocked || (!inputText.trim() && !attachedFile)}
              aria-label={t("Send follow-up message")}
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
