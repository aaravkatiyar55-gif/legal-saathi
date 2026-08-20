"use client";
import { FileText, FileUp, Loader2, Plus, X, ArrowUp } from "lucide-react";
import { autoResizeTextarea } from "@/lib/autoResizeTextarea";
import {
  DEFAULT_REQUEST_CONFIGURATION
} from "@/lib/requestSettings";
import { RequestConfiguration } from "@/lib/types";
import { useEffect, useRef, useState } from "react";
import RequestControls from "./RequestControls";
import { chatFailureMessage, getWebSearchStatus } from "@/lib/backendApi";
import { usePlanState } from "./PlanStateProvider";
import DictationControl from "./DictationControl";
import { useSafeAppError } from "./AppErrorProvider";
import AttachmentMenu from "./AttachmentMenu";
import { translateUiText } from "@/lib/i18n";
import { appCopy, publicLanguageHref } from "@/lib/i18n/appCopy";
import { canRefreshAiRequestStatus, getAiRequestAvailability, getAiSubmitAction } from "@/lib/aiRequestAvailability";
import { getGuidedWorkspaceFlow, getGuidedWorkspacePrompt, GUIDED_WORKSPACE_FLOWS, type GuidedWorkspaceFlowId } from "@/lib/guidedWorkspaceFlows";
import { getWebResearchAvailability, getWebResearchAvailabilityMessage } from "@/lib/webResearchAvailability";

export type WorkspaceSubmission = {
  requestId: string;
  file?: File;
  message: string;
  requestConfiguration: RequestConfiguration;
  webEnabled: boolean;
  termsAccepted: boolean;
  language: "en" | "hinglish" | "hi";
};

interface LegalAiWorkspaceProps {
  role: "normal" | "lawyer";
  onStartSession: (submission: WorkspaceSubmission) => void | Promise<void>;
  isAuthenticated: boolean;
  termsAccepted: boolean;
  language: "en" | "hinglish" | "hi";
  onOpenCreateCase: () => void;
}

export default function LegalAiWorkspace({ role, onStartSession, isAuthenticated, termsAccepted, language, onOpenCreateCase }: LegalAiWorkspaceProps) {
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | undefined>();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failedSubmission, setFailedSubmission] = useState<WorkspaceSubmission | null>(null);
  const [requestConfiguration, setRequestConfiguration] = useState<RequestConfiguration>(DEFAULT_REQUEST_CONFIGURATION);
  const [webEnabled, setWebEnabled] = useState(false);
  const [webConfigured, setWebConfigured] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const { planState, estimateUnits, refresh, loading: isPlanStateLoading, error: planStateError } = usePlanState();
  const { clearSafeError } = useSafeAppError();
  const t = (text: string) => translateUiText(text, language);
  const webAvailability = getWebResearchAvailability(webConfigured, planState?.entitlements.web);
  const aiRequestAvailability = isAuthenticated
    ? getAiRequestAvailability(planState?.entitlements.providerAvailability, requestConfiguration.model)
    : { available: true, state: "available" as const };
  const aiAvailabilityMessage = planStateError
    ? "We couldn't confirm the AI service status. Refresh and try again."
    : aiRequestAvailability.message;
  const isAiRequestBlocked = isAuthenticated && (Boolean(planStateError) || !aiRequestAvailability.available);
  const aiSubmitAction = getAiSubmitAction(isAuthenticated);
  const aiSubmitLabel = appCopy(language, aiSubmitAction === "sign_in" ? "workspace.continueSecureSignIn" : "workspace.sendLegalPrompt");
  const canRefreshAiStatus = isAuthenticated && canRefreshAiRequestStatus({
    availability: aiRequestAvailability,
    planStateError,
    planStateLoading: isPlanStateLoading,
  });
  const webUnavailableMessage = webAvailability === "available"
    ? undefined
    : getWebResearchAvailabilityMessage(webAvailability);

  const applyGuidedFlow = (flowId: GuidedWorkspaceFlowId) => {
    const flow = getGuidedWorkspaceFlow(flowId);
    if (!flow) return;
    setError("");

    if (flow.openCaseForm) {
      onOpenCreateCase();
      return;
    }

    const guidedPrompt = getGuidedWorkspacePrompt(flow, language);
    if (guidedPrompt) setMessage(guidedPrompt);
    if (flow.requestWeb) {
      if (webAvailability === "available") {
        setWebEnabled(true);
      } else {
        setError(t(webUnavailableMessage ?? "Web research is unavailable in this environment. You can still ask a question without it."));
      }
    }
    if (flow.requestUpload) fileInputRef.current?.click();
    window.requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  useEffect(() => {
    autoResizeTextarea(messageInputRef.current, 168);
  }, [message]);

  useEffect(() => { void getWebSearchStatus().then((status) => setWebConfigured(status.configured)).catch(() => setWebConfigured(false)); }, []);

  const handleFileSelect = (file?: File) => {
    if (!file) return;
    setSelectedFile(file);
    setError("");
  };

  const executeSubmission = async (submission: WorkspaceSubmission) => {
    if (isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    try {
      await onStartSession(submission);
      await refresh();
      clearSafeError(submission.requestId);
      setFailedSubmission(null);
    } catch (submissionError) {
      setFailedSubmission(submission);
      setError(t(chatFailureMessage(submissionError)));
      await refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedMessage = message.trim();

    if (!trimmedMessage && !selectedFile) {
      setError(t("Type a legal question, upload a document, or do both."));
      return;
    }

    const submission: WorkspaceSubmission = {
      requestId: crypto.randomUUID(),
      file: selectedFile,
      message: trimmedMessage,
      requestConfiguration,
      webEnabled,
      termsAccepted,
      language,
    };
    if (!isAuthenticated || !termsAccepted) {
      await onStartSession(submission);
      return;
    }

    if (planState && !planState.entitlements.allowedModels.includes(requestConfiguration.model)) {
      setError(language === "hi"
        ? `${requestConfiguration.model} आपके मौजूदा प्लान या प्रदाता कॉन्फ़िगरेशन में उपलब्ध नहीं है।`
        : language === "hinglish"
          ? `${requestConfiguration.model} aapke current plan ya provider configuration mein available nahi hai.`
          : `${requestConfiguration.model} is not available on your current plan or provider configuration.`);
      return;
    }
    if (isAiRequestBlocked) {
      setError(t(aiAvailabilityMessage ?? "The selected AI service could not complete this request right now."));
      return;
    }
    if (webEnabled && webAvailability !== "available") {
      setError(t(webUnavailableMessage ?? "Web research is unavailable in this environment. You can still ask a question without it."));
      return;
    }
    const estimatedUnits = estimateUnits(requestConfiguration, { webEnabled, contextCharacters: selectedFile?.size ? Math.min(selectedFile.size, 40_000) : 0 });
    if (planState && planState.balances.totalRemaining < estimatedUnits) {
      setError(language === "hi"
        ? `इस अनुरोध के लिए लगभग ${estimatedUnits} यूनिट चाहिए, लेकिन ${planState.balances.totalRemaining} शेष हैं।`
        : language === "hinglish"
          ? `Is request ko lagbhag ${estimatedUnits} units chahiye, lekin ${planState.balances.totalRemaining} bache hain.`
          : `This request needs about ${estimatedUnits} units, but ${planState.balances.totalRemaining} remain.`);
      return;
    }

    setFailedSubmission(null);
    await executeSubmission(submission);
  };

  const retryFailedSubmission = (mode: "recover" | "restart") => {
    if (!failedSubmission || isSubmitting) return;
    const submission = mode === "restart"
      ? { ...failedSubmission, requestId: crypto.randomUUID() }
      : failedSubmission;
    void executeSubmission(submission);
  };

  const handleMessageKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleSubmit(event as unknown as React.FormEvent);
  };

  return (
    <div className="legal-ai-start fade-in">
      <section className="legal-ai-hero" aria-labelledby="legal-ai-heading">
        <div className="legal-ai-kicker">
          {t(role === "lawyer" ? "Professional legal AI workspace" : "Legal help, grounded in context")}
        </div>
        <h1 id="legal-ai-heading">{t("What legal matter should we work through?")}</h1>
        <p>
          {t("Upload a document for grounded analysis, ask a question directly, or combine both in one request.")}
        </p>
      </section>

      <section className="guided-workspace-flows" aria-label={t("Guided legal workflows")}>
        {GUIDED_WORKSPACE_FLOWS.map((flow) => (
          <button
            key={flow.id}
            type="button"
            className="guided-workspace-flow"
            onClick={() => applyGuidedFlow(flow.id)}
          >
            <FileText size={17} aria-hidden="true" />
            <span>
              <strong>{t(flow.label)}</strong>
              <small>{t(flow.description)}</small>
            </span>
          </button>
        ))}
      </section>

      <form className="legal-ai-composer" onSubmit={handleSubmit}>
        {!isAuthenticated && (
          <div className="legal-ai-status" role="status">
            {appCopy(language, "workspace.guestSignInRequired")}
          </div>
        )}
        <div
          className={`legal-ai-upload ${isDragging ? "drag-over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFileSelect(event.dataTransfer.files?.[0]);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.jpg,.jpeg,.png,.webp"
            className="sr-only"
            aria-label={t("Upload legal document")}
            onChange={(event) => handleFileSelect(event.target.files?.[0])}
          />

          <div className="legal-ai-upload-copy">
            <span className="legal-ai-upload-icon" aria-hidden="true">
              <FileUp size={21} />
              <span className="legal-ai-upload-badge">
                <Plus size={11} />
              </span>
            </span>
            <div>
              <strong>{selectedFile ? selectedFile.name : t("Attach a legal document")}</strong>
              <span>{selectedFile ? t("Attached to this prompt") : t("Optional, but recommended for document-specific analysis")}</span>
            </div>
          </div>

          <div className="legal-ai-upload-actions">
            {selectedFile && (
              <button
                type="button"
                className="legal-ai-file-clear"
                aria-label={t("Remove selected document")}
                onClick={() => setSelectedFile(undefined)}
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              className="legal-ai-browse"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText size={18} />
              {t("Browse document")}
            </button>
          </div>
        </div>

        <div className="legal-ai-prompt-row">
          <AttachmentMenu
            buttonClassName="legal-ai-prompt-plus"
            selectedFile={selectedFile}
            onSelect={handleFileSelect}
            disabled={isSubmitting}
            webEnabled={webEnabled}
            webAvailable={webAvailability === "available"}
            webUnavailableMessage={webUnavailableMessage}
            onToggleWeb={() => {
              setWebEnabled((value) => !value);
              setError("");
            }}
            language={language}
          />
          <label className="sr-only" htmlFor="legal-ai-message">
            {t("Ask a legal question or instruction")}
          </label>
          <textarea
            ref={messageInputRef}
            id="legal-ai-message"
            className="legal-ai-textarea"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              autoResizeTextarea(event.currentTarget, 168);
              if (error) setError("");
            }}
            onKeyDown={handleMessageKeyDown}
            placeholder={t("Ask a legal question, for example: What should I check before signing a rental agreement?")}
            aria-describedby="legal-ai-privacy-note"
            rows={1}
          />
          <RequestControls
            value={requestConfiguration}
            onChange={setRequestConfiguration}
            disabled={isSubmitting}
            className="legal-ai-request-controls"
            webEnabled={webEnabled}
            contextCharacters={selectedFile?.size ? Math.min(selectedFile.size, 40_000) : 0}
            language={language}
          />
          <div className="legal-ai-submit-group" style={{ gridArea: "send", display: "flex", alignItems: "center", gap: "0.4rem", alignSelf: "end" }}>
            <DictationControl
              value={message}
              onChange={(nextMessage) => {
                setMessage(nextMessage);
                if (error) setError("");
              }}
              language={language}
              disabled={isSubmitting}
              onMessage={setError}
            />
            <button className="legal-ai-submit" type="submit" disabled={isSubmitting || isAiRequestBlocked} aria-label={aiSubmitLabel}>
              {isSubmitting ? <Loader2 size={18} className="spin" /> : <ArrowUp size={18} />}
              <span className="sr-only">{aiSubmitLabel}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="legal-ai-error" role="alert">
            <span>{error}</span>
            {failedSubmission && (
              <div className="legal-ai-error-actions">
                <button type="button" className="btn" disabled={isSubmitting} onClick={() => retryFailedSubmission("recover")}>
                  {t("Check previous response")}
                </button>
                <button type="button" className="btn" disabled={isSubmitting} onClick={() => retryFailedSubmission("restart")}>
                  {t("Start a new request")}
                </button>
              </div>
            )}
          </div>
        )}
        {isAiRequestBlocked && aiAvailabilityMessage && (
          <div className="legal-ai-status" role="status" aria-live="polite">
            <span>{t(aiAvailabilityMessage)}</span>
            {canRefreshAiStatus && (
              <button type="button" className="btn" disabled={isPlanStateLoading || isSubmitting} onClick={() => void refresh()}>
                {t("Refresh status")}
              </button>
            )}
          </div>
        )}
        {webUnavailableMessage && <div className="legal-ai-status" role="status">{t(webUnavailableMessage)}</div>}
      </form>

      <p id="legal-ai-privacy-note" className="legal-ai-privacy-note">
        {t("Share only what is necessary for your question. Do not include passwords, bank or card details, or government identity numbers.")}
      </p>
      <p className="legal-ai-disclaimer">
        {t("Legal Saathi provides AI-assisted legal information and may make mistakes. Verify important decisions, documents, and deadlines.")} <a href={publicLanguageHref("/terms", language)} target="_blank" rel="noopener noreferrer">{appCopy(language, "help.terms")}</a> &middot; <a href={publicLanguageHref("/privacy", language)} target="_blank" rel="noopener noreferrer">{appCopy(language, "help.privacy")}</a>
      </p>
    </div>
  );
}
