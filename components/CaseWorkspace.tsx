"use client";
import { AlertTriangle, ArrowLeft, Briefcase, ChevronDown, ChevronRight, FileImage, FileSpreadsheet, FileText, FileWarning, Files, Folder, FolderOpen, FolderPlus, Highlighter, ImageIcon, Loader2, MessageSquareText, Plus, RefreshCw, ScrollText, Send, Sparkles, Upload, Video } from "lucide-react";
import type {
  CaseData,
  DocumentAnnotation,
  DocumentCategory,
  DocumentData,
  DocumentPreviewKind,
  DocumentQuestion,
  DocumentQuestionScope,
  DocumentQuestionStatus
} from "@/lib/types";
import { BackendApiError, loadDocumentFromServer, runCaseAgentAction, type CaseAgentResult } from "@/lib/backendApi";
import { CASE_AGENT_WORKFLOWS, type CaseAgentActionId } from "@/lib/caseAgentWorkflows";
import { CASE_UPLOAD_ACCEPT } from "@/lib/caseUploadPolicy";
import { getCategorySourceLabel, LEGAL_DOCUMENT_CATEGORIES } from "@/lib/documentCategories";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import DictationControl from "./DictationControl";
import type { AppLanguage } from "@/lib/i18n/types";
import { translateUiText } from "@/lib/i18n";

interface CaseWorkspaceProps {
  caseData: CaseData;
  documents: DocumentData[];
  onUpload: (file: File, category?: DocumentCategory) => unknown | Promise<unknown>;
  onUpdateDocumentCategory: (documentId: string, category: DocumentCategory) => void | Promise<void>;
  onAddAnnotation: (documentId: string, annotation: DocumentAnnotation) => void | Promise<void>;
  onPrepareDocumentText: (documentId: string, file: File) => Promise<string>;
  onSubmitQuestion: (
    caseId: string,
    scope: DocumentQuestionScope,
    text: string,
    documentId?: string
  ) => DocumentQuestion | Promise<DocumentQuestion>;
  onBackToCases: () => void;
  onRetryAnalysis?: () => Promise<void>;
  onRefreshCase?: () => Promise<void>;
  language: AppLanguage;
}

type UploadFolder = "auto" | DocumentCategory;
type ResizePanel = "left" | "right";

export default function CaseWorkspace({
  caseData,
  documents,
  onUpload,
  onUpdateDocumentCategory,
  onAddAnnotation,
  onPrepareDocumentText,
  onSubmitQuestion,
  onBackToCases,
  onRetryAnalysis,
  onRefreshCase,
  language,
}: CaseWorkspaceProps) {
  const t = (text: string) => translateUiText(text, language);
  const shellRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const annotationSurfaceRef = useRef<HTMLDivElement>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [questionScope, setQuestionScope] = useState<DocumentQuestionScope>("case");
  const [questionFeedback, setQuestionFeedback] = useState("");
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
  const [storedFile, setStoredFile] = useState<{ blob: Blob; size: number; mimeType: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "ready" | "missing" | "deleted" | "error">("idle");
  const [isRefreshingDocuments, setIsRefreshingDocuments] = useState(false);
  const [uploadFolder, setUploadFolder] = useState<UploadFolder>("auto");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [updatingCategoryId, setUpdatingCategoryId] = useState<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [pendingSelectedText, setPendingSelectedText] = useState("");
  const [annotationComment, setAnnotationComment] = useState("");
  const [referencedAnnotationIds, setReferencedAnnotationIds] = useState<string[]>([]);
  const [isPreparingAnnotationText, setIsPreparingAnnotationText] = useState(false);
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<DocumentCategory, boolean>>(
    () => Object.fromEntries(LEGAL_DOCUMENT_CATEGORIES.map(category => [category, true])) as Record<DocumentCategory, boolean>
  );
  // Track whether we're retrying AI analysis to show a spinner
  const [isRetryingAnalysis, setIsRetryingAnalysis] = useState(false);
  const [retryAnalysisMessage, setRetryAnalysisMessage] = useState("");
  const [activeAgentAction, setActiveAgentAction] = useState<CaseAgentActionId | null>(null);
  const [agentResult, setAgentResult] = useState<CaseAgentResult | null>(null);
  const [agentFeedback, setAgentFeedback] = useState("");
  const analysisNeedsPreparation = Boolean(
    caseData.aiAnalysisPending
    || caseData.description === "Case saved. AI preparation pending."
    || caseData.description === "Analysis temporarily unavailable",
  );

  const caseDocs = useMemo(
    () => documents
      .filter(document => caseData.documentIds.includes(document.id))
      .sort((first, second) => second.uploadedAt - first.uploadedAt),
    [documents, caseData.documentIds]
  );

  const documentFolders = useMemo(
    () => LEGAL_DOCUMENT_CATEGORIES
      .map(category => ({
        category,
        documents: caseDocs.filter(document => (document.caseCategory ?? "Other") === category)
      }))
      .filter(folder => folder.documents.length > 0),
    [caseDocs]
  );

  const selectedDocument = selectedDocId
    ? caseDocs.find(document => document.id === selectedDocId) ?? null
    : null;

  const selectedAnnotations = selectedDocument?.annotations ?? [];
  const referencedAnnotations = selectedAnnotations.filter(annotation => referencedAnnotationIds.includes(annotation.id));

  const activeQuestions = useMemo(
    () => [...(questionScope === "case" ? caseData.caseQuestions ?? [] : selectedDocument?.documentQuestions ?? [])]
      .sort((first, second) => second.createdAt - first.createdAt),
    [caseData.caseQuestions, questionScope, selectedDocument?.documentQuestions]
  );

  useEffect(() => {
    if (caseDocs.length === 0) {
      setSelectedDocId(null);
      setQuestionScope("case");
      return;
    }

    if (!selectedDocId || !caseDocs.some(document => document.id === selectedDocId)) {
      setSelectedDocId(caseDocs[0].id);
    }
  }, [caseDocs, selectedDocId]);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    setAnnotationMode(false);
    setPendingSelectedText("");
    setAnnotationComment("");
    setReferencedAnnotationIds([]);
  }, [selectedDocument?.id]);

  useEffect(() => {
    let isCancelled = false;
    let nextPreviewUrl = "";

    setStoredFile(null);
    setPreviewUrl("");
    setPreviewText(selectedDocument?.extractedText ?? "");

    if (!selectedDocument) {
      setPreviewStatus("idle");
      return;
    }

    if (!selectedDocument.serverBacked && !selectedDocument.serverStorageKey) {
      setPreviewStatus("missing");
      return;
    }

    setPreviewStatus("loading");

    const loadPreview = async () => {
      try {
        const fileRecord = await loadDocumentFromServer(selectedDocument.id);
        if (isCancelled) return;

        if (!fileRecord) {
          setPreviewStatus("missing");
          return;
        }

        setStoredFile(fileRecord);

        if (selectedDocument.previewKind === "image" || selectedDocument.previewKind === "pdf" || selectedDocument.previewKind === "video") {
          nextPreviewUrl = URL.createObjectURL(fileRecord.blob);
          setPreviewUrl(nextPreviewUrl);
        }

        if (selectedDocument.previewKind === "text") {
          const text = selectedDocument.extractedText ?? await fileRecord.blob.text();
          if (!isCancelled) setPreviewText(text);
        }

        if (!isCancelled) setPreviewStatus("ready");
      } catch (error) {
        console.warn("[Case workspace] document preview unavailable", { category: "document_preview_unavailable" });
        if (!isCancelled) {
          setPreviewStatus(error instanceof BackendApiError && error.code === "DOCUMENT_NOT_FOUND" ? "deleted" : "error");
        }
      }
    };

    loadPreview();

    return () => {
      isCancelled = true;
      if (nextPreviewUrl) URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [selectedDocument]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return t("Unknown");
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getPreviewLabel = (previewKind?: DocumentPreviewKind) => {
    if (previewKind === "image") return t("Image preview");
    if (previewKind === "pdf") return t("PDF preview");
    if (previewKind === "text") return t("Text preview");
    if (previewKind === "office") return t("Word document");
    if (previewKind === "spreadsheet") return t("Spreadsheet cells");
    if (previewKind === "video") return t("Video evidence");
    return t("Preview unavailable");
  };

  const renderPreviewContent = () => {
    if (!selectedDocument) return null;

    if (previewStatus === "loading") {
      return (
        <div className="case-preview-placeholder">
          <Loader2 className="spin" size={30} />
          <h3>{t("Loading preview")}</h3>
          <p>{t("Opening the locally stored file for this case document.")}</p>
        </div>
      );
    }

    if (previewStatus === "missing") {
      return (
        <div className="case-preview-placeholder">
          <FileWarning size={34} />
          <h3>{t("File preview is not available")}</h3>
          <p>
            {t("This record is saved, but the original file is not in local preview storage yet. Re-upload it into this case to enable previews.")}
          </p>
        </div>
      );
    }

    if (previewStatus === "error") {
      return (
        <div className="case-preview-placeholder">
          <FileWarning size={34} />
          <h3>{t("Could not open this file")}</h3>
          <p>{t("The browser could not load the local file preview. The case record itself is still available.")}</p>
        </div>
      );
    }

    if (previewStatus === "deleted") {
      return (
        <div className="case-preview-placeholder">
          <FileWarning size={34} />
          <h3>{t("Document deleted")}</h3>
          <p>{t("This document is no longer available. Refresh the case to update the document list.")}</p>
        </div>
      );
    }

    if (annotationMode) {
      return (
        <div className="case-annotation-reader">
          <div className="case-annotation-reader-toolbar">
            <span><Highlighter size={16} /> {t("Select document text to add a comment")}</span>
            <button type="button" onClick={() => setAnnotationMode(false)}>{t("View original")}</button>
          </div>
          <div
            ref={annotationSurfaceRef}
            className="case-annotation-text"
            data-no-i18n
            onMouseUp={handleAnnotationSelection}
          >
            {previewText || selectedDocument.extractedText || t("No selectable text was found.")}
          </div>
          {pendingSelectedText && (
            <div className="case-annotation-composer">
              <div className="case-annotation-quote" data-no-i18n>&quot;{pendingSelectedText}&quot;</div>
              <label htmlFor="case-annotation-comment">{t("Comment on this selection")}</label>
              <textarea
                id="case-annotation-comment"
                value={annotationComment}
                onChange={event => setAnnotationComment(event.target.value)}
                placeholder={t("Add a note, question, or legal observation...")}
                rows={2}
              />
              <div>
                <button type="button" className="secondary" onClick={() => setPendingSelectedText("")}>
                  {t("Cancel")}
                </button>
                <button type="button" onClick={() => void saveAnnotation()} disabled={!annotationComment.trim() || isSavingAnnotation}>
                  {isSavingAnnotation ? <Loader2 className="spin" size={15} /> : <MessageSquareText size={15} />}
                  {t(isSavingAnnotation ? "Saving comment" : "Save comment")}
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (selectedDocument.previewKind === "image" && previewUrl) {
      // Blob URLs are local authenticated previews and cannot use Next image optimization.
      // eslint-disable-next-line @next/next/no-img-element
      return <img className="case-document-image-preview" src={previewUrl} alt={selectedDocument.name} data-no-i18n />;
    }

    if (selectedDocument.previewKind === "pdf" && previewUrl) {
      return <iframe className="case-document-pdf-preview" src={previewUrl} title={selectedDocument.name} data-no-i18n />;
    }

    if (selectedDocument.previewKind === "text") {
      return (
        <pre className="case-document-text-preview" data-no-i18n>
          {previewText || t("No readable text was found in this file.")}
        </pre>
      );
    }

    if (selectedDocument.previewKind === "spreadsheet") {
      return (
        <pre className="case-document-text-preview" data-no-i18n>
          {previewText || selectedDocument.extractedText || t("No readable spreadsheet cells were found.")}
        </pre>
      );
    }

    if (selectedDocument.previewKind === "office") {
      if (previewText || selectedDocument.extractedText) {
        return (
          <pre className="case-document-text-preview" data-no-i18n>
            {previewText || selectedDocument.extractedText}
          </pre>
        );
      }
      return (
        <div className="case-preview-placeholder">
          <FileText size={34} />
          <h3>{t("Document stored securely")}</h3>
          <p>
            {t("This legacy Word file has no safe text extractor in this runtime. Convert it to DOCX when you need document-aware AI analysis.")}
          </p>
        </div>
      );
    }

    if (selectedDocument.previewKind === "video" && previewUrl) {
      return (
        <video className="case-document-video-preview" src={previewUrl} controls preload="metadata">
          {t("Your browser cannot preview this video.")}
        </video>
      );
    }

    return (
      <div className="case-preview-placeholder">
        <ScrollText size={34} />
        <h3>{t("Preview type not supported yet")}</h3>
        <p>{t("The file is stored locally, but this format does not have a frontend preview renderer yet.")}</p>
      </div>
    );
  };

  const getQuestionReferenceLabel = (previewKind?: DocumentPreviewKind) => {
    if (previewKind === "image") return t("Image document");
    if (previewKind === "pdf") return t("PDF document");
    if (previewKind === "text") return t("Text document");
    if (previewKind === "office") return t("Office document");
    if (previewKind === "spreadsheet") return t("Spreadsheet");
    if (previewKind === "video") return t("Video evidence");
    return t("Case document");
  };

  const getQuestionStatusLabel = (status: DocumentQuestionStatus) => {
    if (status === "processing") return t("Analyzing");
    if (status === "answered") return t("Answered");
    if (status === "error") return t("Needs attention");
    return t("Awaiting AI connection");
  };

  const getAgentResultBlocks = (result: CaseAgentResult | null) => {
    if (!result) return [] as Array<{ heading: string; lines: string[] }>;
    const blocks: Array<{ heading: string; lines: string[] }> = [];
    const asText = (value: unknown) => typeof value === "string" ? value.trim() : "";
    const addItems = (heading: string, value: unknown, fields: string[]) => {
      if (!Array.isArray(value)) return;
      const lines = value.map(item => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          return fields.map(field => asText((item as Record<string, unknown>)[field])).filter(Boolean).join(" - ");
        }
        return "";
      }).filter(Boolean);
      if (lines.length) blocks.push({ heading, lines });
    };

    addItems(t("Possible weak points"), result.weakPoints, ["issue", "whyItMatters", "evidenceNeeded"]);
    addItems(t("Possible opponent arguments"), result.opponentArguments, ["argument", "possibleCounter", "evidenceToCollect"]);
    const brief = result.brief as Record<string, unknown> | undefined;
    if (brief && typeof brief === "object") {
      const summary = asText(brief.onePageSummary);
      const nextSteps = Array.isArray(brief.urgentNextSteps) ? brief.urgentNextSteps.filter((item): item is string => typeof item === "string") : [];
      if (summary || nextSteps.length) blocks.push({ heading: t("Advocate brief"), lines: [summary, ...nextSteps].filter(Boolean) });
    }
    const draftText = asText(result.draftText);
    if (draftText) blocks.push({ heading: asText(result.draftTitle) || t("Preparation draft"), lines: [draftText] });
    const prepared = result.case as Record<string, unknown> | undefined;
    if (prepared && typeof prepared === "object") {
      const summary = asText(prepared.short_summary);
      if (summary) blocks.push({ heading: t("Case preparation"), lines: [summary] });
    }
    return blocks;
  };

  const handleAgentAction = async (action: CaseAgentActionId) => {
    if (activeAgentAction) return;
    const workflow = CASE_AGENT_WORKFLOWS.find(item => item.id === action);
    if (!workflow) return;
    setAgentFeedback("");
    setAgentResult(null);

    if (action === "research" || action === "review_document") {
      setQuestionScope(action === "review_document" && selectedDocument ? "document" : "case");
      setQuestion(workflow.composerPrefill?.(caseData.name) ?? "");
      setAgentFeedback(t("The request is ready to review and edit before sending."));
      return;
    }

    setActiveAgentAction(action);
    try {
      const result = await runCaseAgentAction({ action, caseId: caseData.id, language });
      setAgentResult(result);
      setAgentFeedback(t("Case Agent result is ready."));
      await onRefreshCase?.();
    } catch (error) {
      const requestReference = error instanceof BackendApiError && error.requestId
        ? ` ${t("Reference")}: ${error.requestId}`
        : "";
      setAgentFeedback(`${error instanceof Error ? error.message : t("The Case Agent could not complete this action.")}${requestReference}`);
    } finally {
      setActiveAgentAction(null);
    }
  };

  const getExtractionLabel = (document: DocumentData) => {
    if (document.extractionStatus === "complete") return t("Text ready");
    if (document.extractionStatus === "pending") return t("Processing");
    if (document.extractionStatus === "failed") return t("Extraction failed");
    if (document.extractionStatus === "unavailable") return t("No text layer");
    return t("Not processed yet");
  };

  const handleAnnotationSelection = () => {
    const selection = window.getSelection();
    const surface = annotationSurfaceRef.current;
    if (!selection || selection.isCollapsed || !surface) return;
    if (!surface.contains(selection.anchorNode) || !surface.contains(selection.focusNode)) return;

    const selectedText = selection.toString().replace(/\s+/g, " ").trim().slice(0, 2_000);
    if (!selectedText) return;
    setPendingSelectedText(selectedText);
    setAnnotationComment("");
  };

  const saveAnnotation = async () => {
    if (!selectedDocument || !pendingSelectedText || !annotationComment.trim() || isSavingAnnotation) return;

    const annotation: DocumentAnnotation = {
      id: crypto.randomUUID(),
      documentId: selectedDocument.id,
      selectedText: pendingSelectedText,
      comment: annotationComment.trim(),
      createdAt: Date.now()
    };
    setIsSavingAnnotation(true);
    setQuestionFeedback("");
    try {
      await onAddAnnotation(selectedDocument.id, annotation);
      setReferencedAnnotationIds(current => [...current, annotation.id]);
      setPendingSelectedText("");
      setAnnotationComment("");
      window.getSelection()?.removeAllRanges();
      setQuestionFeedback(t("Document comment saved."));
    } catch {
      setQuestionFeedback(t("The document comment could not be saved. Please try again."));
    } finally {
      setIsSavingAnnotation(false);
    }
  };

  const prepareAnnotationText = async () => {
    if (!selectedDocument || !storedFile || isPreparingAnnotationText) return;
    setIsPreparingAnnotationText(true);
    setQuestionFeedback("");

    try {
      const file = new File([storedFile.blob], selectedDocument.name, {
        type: selectedDocument.mimeType || storedFile.mimeType || "application/octet-stream"
      });
      const extractedText = await onPrepareDocumentText(selectedDocument.id, file);
      if (!extractedText.trim()) {
        setQuestionFeedback(t("This document does not have selectable text yet."));
        return;
      }
      setPreviewText(extractedText);
      setAnnotationMode(true);
    } catch {
      console.warn("[Case workspace] annotation text preparation failed", { category: "annotation_text_failure" });
      setQuestionFeedback(t("The selectable text layer could not be prepared."));
    } finally {
      setIsPreparingAnnotationText(false);
    }
  };

  const toggleAnnotationMode = () => {
    if (annotationMode) {
      setAnnotationMode(false);
      setPendingSelectedText("");
      return;
    }
    if (previewText.trim() || selectedDocument?.extractedText?.trim()) {
      setPreviewText(current => current || selectedDocument?.extractedText || "");
      setAnnotationMode(true);
      return;
    }
    void prepareAnnotationText();
  };

  const toggleAnnotationReference = (annotationId: string) => {
    setReferencedAnnotationIds(current =>
      current.includes(annotationId)
        ? current.filter(id => id !== annotationId)
        : [...current, annotationId]
    );
  };

  const startPanelResize = (panel: ResizePanel, event: ReactPointerEvent<HTMLDivElement>) => {
    const shell = shellRef.current;
    if (!shell) return;
    event.preventDefault();

    const startX = event.clientX;
    const startLeft = leftPanelWidth;
    const startRight = rightPanelWidth;
    const shellWidth = shell.getBoundingClientRect().width;
    let nextLeft = startLeft;
    let nextRight = startRight;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (panel === "left") {
        const maxLeft = Math.max(260, Math.min(480, shellWidth - nextRight - 520));
        nextLeft = Math.min(maxLeft, Math.max(220, startLeft + delta));
        setLeftPanelWidth(nextLeft);
      } else {
        const maxRight = Math.max(300, Math.min(560, shellWidth - nextLeft - 520));
        nextRight = Math.min(maxRight, Math.max(280, startRight - delta));
        setRightPanelWidth(nextRight);
      }
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const resizeWithKeyboard = (panel: ResizePanel, direction: number) => {
    if (panel === "left") {
      const nextLeft = Math.min(480, Math.max(220, leftPanelWidth + direction * 16));
      setLeftPanelWidth(nextLeft);
    } else {
      const nextRight = Math.min(560, Math.max(280, rightPanelWidth + direction * 16));
      setRightPanelWidth(nextRight);
    }
  };

  const handleAskQuestion = async (event: React.FormEvent) => {
    event.preventDefault();
    const requiresSelectedDocument = questionScope === "document";
    if ((requiresSelectedDocument && !selectedDocument) || !question.trim() || isSubmittingQuestion) return;

    setIsSubmittingQuestion(true);
    setQuestionFeedback("");

    try {
      const referenceText = referencedAnnotations.map((annotation, index) =>
        `Annotation ${index + 1}: "${annotation.selectedText}"\nComment: ${annotation.comment}`
      ).join("\n\n");
      const questionWithReferences = referenceText
        ? `${question.trim()}\n\nReferenced document annotations:\n${referenceText}`
        : question;
      const savedQuestion = await onSubmitQuestion(
        caseData.id,
        questionScope,
        questionWithReferences,
        requiresSelectedDocument ? selectedDocument?.id : undefined
      );
      setQuestion("");
      setReferencedAnnotationIds([]);
      setQuestionFeedback(
        savedQuestion.status === "error"
          ? savedQuestion.errorMessage ?? t("The question is saved locally, but the server could not prepare it.")
          : questionScope === "case"
            ? t("Saved across this case.")
            : `${t("Saved against")} ${selectedDocument?.name}.`
      );
    } catch {
      console.warn("[Case workspace] document question save failed", { category: "document_question_save_failure" });
      setQuestionFeedback(t("The question could not be saved. Please try again."));
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || isUploading) return;
    const files = Array.from(fileList);
    if (files.length > 10) {
      setUploadMessage(t("Upload up to 10 files at a time so each file can be validated safely."));
      return;
    }
    const totalSize = files.reduce((total, file) => total + file.size, 0);
    if (totalSize > 100 * 1024 * 1024) {
      setUploadMessage(t("This batch is larger than 100 MB. Choose a smaller group of files."));
      return;
    }
    setIsUploading(true);
    setUploadMessage(`${t("Uploading")} 0 / ${files.length}`);
    let uploaded = 0;
    let failed = 0;
    for (const file of files) {
      try {
        await onUpload(file, uploadFolder === "auto" ? undefined : uploadFolder);
        uploaded += 1;
      } catch {
        failed += 1;
      }
      setUploadMessage(`${t("Uploading")} ${uploaded + failed} / ${files.length}`);
    }
    setUploadMessage(failed === 0
      ? `${uploaded} ${t(uploaded === 1 ? "file added and sorted." : "files added and sorted.")}`
      : `${uploaded} ${t("added")}; ${failed} ${t("could not be added. Check the file type and size.")}`);
    setIsUploading(false);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    void uploadFiles(files);
    event.target.value = "";
  };

  const getDocumentIcon = (document: DocumentData) => {
    if (document.previewKind === "image") return <FileImage size={14} />;
    if (document.previewKind === "spreadsheet") return <FileSpreadsheet size={14} />;
    if (document.previewKind === "video") return <Video size={14} />;
    return <FileText size={14} />;
  };

  const toggleFolder = (category: DocumentCategory) => {
    setExpandedFolders(current => ({ ...current, [category]: !current[category] }));
  };

  return (
    <section
      ref={shellRef}
      className="case-workspace-shell fade-in"
      aria-label={`${caseData.name} ${t("case workspace")}`}
      style={{
        "--case-left-width": `${leftPanelWidth}px`,
        "--case-right-width": `${rightPanelWidth}px`
      } as CSSProperties}
    >
      <aside className="case-workspace-sidebar">
        <div className="case-workspace-brand">
          <button type="button" className="case-back-btn" onClick={onBackToCases}>
            <ArrowLeft size={18} />
            {t("All cases")}
          </button>
          <div className="case-workspace-title">
            <span className="case-workspace-icon" aria-hidden="true">
              <Briefcase size={20} />
            </span>
            <div>
              <h1 data-no-i18n>{caseData.name}</h1>
              <p>{t(caseData.typeTag ?? "Case workspace")}</p>
            </div>
          </div>
        </div>

        <div className="case-tree">
          <div className="case-tree-root">
            <Folder size={16} />
            <span data-no-i18n>{caseData.name}</span>
            <strong>{caseDocs.length}</strong>
          </div>
          <div className="case-tree-branch">
            {isRefreshingDocuments || caseData.documentLoadStatus === "loading" ? (
              <p className="case-tree-empty" role="status"><Loader2 className="spin" size={14} /> {t("Loading documents...")}</p>
            ) : caseData.documentLoadStatus === "failed" ? (
              <div className="case-tree-empty" role="alert">
                <p>{t("Documents could not be loaded. The case itself is still available.")}</p>
                <button
                  type="button"
                  className="btn"
                  disabled={isRefreshingDocuments || !onRefreshCase}
                  onClick={async () => {
                    if (!onRefreshCase || isRefreshingDocuments) return;
                    setIsRefreshingDocuments(true);
                    try {
                      await onRefreshCase();
                    } finally {
                      setIsRefreshingDocuments(false);
                    }
                  }}
                >
                  <RefreshCw size={14} /> {t("Try again")}
                </button>
              </div>
            ) : caseDocs.length === 0 ? (
              <p className="case-tree-empty">{t("No documents added yet.")}</p>
            ) : (
              documentFolders.map(folder => {
                const isExpanded = expandedFolders[folder.category];
                const containsSelectedDocument = folder.documents.some(document => document.id === selectedDocument?.id);

                return (
                  <div key={folder.category} className={`case-tree-folder-group ${containsSelectedDocument ? "contains-active" : ""}`}>
                    <button
                      type="button"
                      className="case-tree-folder"
                      onClick={() => toggleFolder(folder.category)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      {isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
                      <span>{t(folder.category)}</span>
                      <strong>{folder.documents.length}</strong>
                    </button>

                    {isExpanded && (
                      <div className="case-tree-folder-documents">
                        {folder.documents.map(document => (
                          <button
                            type="button"
                            key={document.id}
                            className={`case-tree-document ${selectedDocument?.id === document.id ? "active" : ""}`}
                            onClick={() => {
                              setSelectedDocId(document.id);
                              setQuestionFeedback("");
                            }}
                          >
                            {getDocumentIcon(document)}
                            <span data-no-i18n>{document.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          accept={CASE_UPLOAD_ACCEPT}
          multiple
          aria-label={t("Add document to case workspace")}
          onChange={handleFileChange}
        />
        <input
          ref={folderInputRef}
          type="file"
          className="sr-only"
          accept={CASE_UPLOAD_ACCEPT}
          multiple
          aria-label={t("Add a folder to case workspace")}
          onChange={handleFileChange}
        />
        <div className="case-upload-controls">
          <label className="case-upload-folder" htmlFor="case-upload-folder">
            <span>{t("Save new uploads to")}</span>
            <select
              id="case-upload-folder"
              value={uploadFolder}
              onChange={event => setUploadFolder(event.target.value as UploadFolder)}
            >
              <option value="auto">{t("Auto-sort to a folder")}</option>
              {LEGAL_DOCUMENT_CATEGORIES.map(category => (
                <option key={category} value={category}>{t(category)}</option>
              ))}
            </select>
          </label>
          <div className="case-upload-actions">
            <button type="button" className="case-add-file" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              {isUploading ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
              {t("Add files")}
            </button>
            <button type="button" className="case-add-file secondary" onClick={() => folderInputRef.current?.click()} disabled={isUploading}>
              <FolderPlus size={17} />
              {t("Add folder")}
            </button>
          </div>
          {uploadMessage && <p className="case-upload-message" role="status">{uploadMessage}</p>}
        </div>
      </aside>

      <div
        className="case-resize-handle left"
        role="separator"
        aria-label={t("Resize case navigation")}
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={event => startPanelResize("left", event)}
        onKeyDown={event => {
          if (event.key === "ArrowLeft") resizeWithKeyboard("left", -1);
          if (event.key === "ArrowRight") resizeWithKeyboard("left", 1);
        }}
      />

      <main className="case-document-stage">
        <header className="case-document-header">
          <div>
            <span className="case-workspace-kicker">{t("Document viewer")}</span>
            <h2>{selectedDocument ? <span data-no-i18n>{selectedDocument.name}</span> : t("Select a document")}</h2>
          </div>
          {selectedDocument && (
            <span className="case-document-pill">
              {t("Added")} {new Date(selectedDocument.uploadedAt).toLocaleDateString()}
            </span>
          )}
        </header>

        {analysisNeedsPreparation && (
          <div className="case-ai-pending-banner" role="status" aria-live="polite" style={{
            display: "flex", flexDirection: "column", gap: "0.5rem",
            padding: "0.9rem 1rem", borderRadius: "8px",
            border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.08)",
            color: "var(--text-primary)", margin: "0 1rem 1rem", textAlign: "left"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, fontSize: "0.9rem" }}>
              <AlertTriangle size={16} style={{ color: "#fbbf24", flexShrink: 0 }} />
              {t("Structured preparation needs another attempt")}
            </div>
            <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {t("Your case and Case Agent remain available. Retry the separate preparation snapshot when you are ready.")}
            </p>
            {retryAnalysisMessage && (
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>{retryAnalysisMessage}</p>
            )}
            <button
              type="button"
              className="btn"
              style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.83rem" }}
              disabled={isRetryingAnalysis || !onRetryAnalysis}
              onClick={async () => {
                if (!onRetryAnalysis || isRetryingAnalysis) return;
                setIsRetryingAnalysis(true);
                setRetryAnalysisMessage(t("Running structured preparation..."));
                try {
                  await onRetryAnalysis();
                  await onRefreshCase?.();
                  setRetryAnalysisMessage(t("Analysis completed."));
                } catch {
                  setRetryAnalysisMessage(t("Analysis is temporarily unavailable. Your case is still saved."));
                } finally {
                  setIsRetryingAnalysis(false);
                }
              }}
              title={onRetryAnalysis ? t("Run structured case preparation") : t("Analysis retry is not connected on this screen yet")}
            >
              {isRetryingAnalysis ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              {t("Retry analysis")}
            </button>
          </div>
        )}

        {selectedDocument ? (
          <div className="case-document-viewer has-preview">
            <div className="case-preview-summary">
              <span className="case-preview-icon" aria-hidden="true">
                {selectedDocument.previewKind === "image"
                  ? <ImageIcon size={18} />
                  : selectedDocument.previewKind === "spreadsheet"
                    ? <FileSpreadsheet size={18} />
                    : selectedDocument.previewKind === "video"
                      ? <Video size={18} />
                      : <FileText size={18} />}
              </span>
              <div>
                <strong>{getPreviewLabel(selectedDocument.previewKind)}</strong>
                <span>
                  {formatFileSize(selectedDocument.size ?? storedFile?.size)}
                  {selectedDocument.mimeType ? ` | ${selectedDocument.mimeType}` : ""}
                </span>
              </div>
              <button
                type="button"
                className={`case-annotation-mode-btn ${annotationMode ? "active" : ""}`}
                onClick={toggleAnnotationMode}
                disabled={isPreparingAnnotationText || (!storedFile && !selectedDocument.extractedText)}
                title={t("Select document text and attach a saved comment")}
              >
                {isPreparingAnnotationText ? <Loader2 className="spin" size={16} /> : <Highlighter size={16} />}
                {isPreparingAnnotationText ? t("Preparing text") : annotationMode ? t("Annotation mode") : t("Annotate text")}
              </button>
            </div>

            <div className="case-preview-body">
              {renderPreviewContent()}
            </div>

            <div className="case-document-meta-grid wide">
              <span>{t("Storage")}</span>
              <strong>
                {selectedDocument.serverBacked || selectedDocument.serverStorageKey ? t("Encrypted-session server copy") : t("Metadata only")}
              </strong>
              <span>{t("Text extraction")}</span>
              <strong title={selectedDocument.extractionMessage} data-no-i18n>{getExtractionLabel(selectedDocument)}</strong>
              <span>{t("Folder")}</span>
              <label className="case-category-field">
                <select
                  aria-label={t("Document folder")}
                  value={selectedDocument.caseCategory ?? "Other"}
                  disabled={updatingCategoryId === selectedDocument.id}
                  onChange={async (event) => {
                    const category = event.target.value as DocumentCategory;
                    setUpdatingCategoryId(selectedDocument.id);
                    setQuestionFeedback("");
                    try {
                      await onUpdateDocumentCategory(selectedDocument.id, category);
                      setQuestionFeedback(t("Document folder saved."));
                    } catch {
                      setQuestionFeedback(t("The document folder could not be saved. Please try again."));
                    } finally {
                      setUpdatingCategoryId(null);
                    }
                  }}
                >
                  {LEGAL_DOCUMENT_CATEGORIES.map(category => (
                    <option key={category} value={category}>{t(category)}</option>
                  ))}
                </select>
                <small>{t(getCategorySourceLabel(selectedDocument.categorySource))}</small>
              </label>
              <span>{t("Conversation entries")}</span>
              <strong>{selectedDocument.chatHistory.length}</strong>
            </div>
          </div>
        ) : (
          <div className="case-document-empty">
            <Plus size={28} />
            <h3>{caseData.preparation ? t("Case preparation snapshot") : t("Add the first document")}</h3>

            {/* AI analysis pending banner — shown when case was saved before AI enrichment finished */}
            {caseData.preparation ? (
              <div className="case-preparation-snapshot">
                <p data-no-i18n>{caseData.preparation.summary}</p>
                {[
                  ["Important facts", caseData.preparation.facts], ["Missing information", caseData.preparation.missingInformation], ["Documents to collect", [t("Keep agreements, notices, receipts, messages, and relevant records together.")]], ["Questions for the other party", [t("What written record supports their position?"), t("Which dates or payments are disputed?")]], ["Questions for an advocate", caseData.preparation.questionsForUser], ["Risks / red flags", caseData.preparation.risks], ["Next-step checklist", [t("Preserve truthful records."), t("Add dates and documents."), t("Discuss urgent points with a licensed advocate.")]]
                ].map(([label, items]) => Array.isArray(items) && items.length > 0 ? <section key={String(label)}><strong>{t(String(label))}</strong><ul>{items.map((item) => <li key={item} data-no-i18n>{item}</li>)}</ul></section> : null)}
              </div>
            ) : <p>{t("Add documents, spreadsheets, screenshots, or videos to review them inside this case workspace.")}</p>}
            <button type="button" className="case-add-file inline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              <Upload size={17} />
              {t("Add files")}
            </button>
          </div>
        )}
      </main>

      <div
        className="case-resize-handle right"
        role="separator"
        aria-label={t("Resize question panel")}
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={event => startPanelResize("right", event)}
        onKeyDown={event => {
          if (event.key === "ArrowLeft") resizeWithKeyboard("right", 1);
          if (event.key === "ArrowRight") resizeWithKeyboard("right", -1);
        }}
      />

      <aside className="case-question-panel">
        <div>
          <span className="case-workspace-kicker">{t("Case Agent")}</span>
          <h2>{questionScope === "case" ? t("Continue with full case memory") : t("Ask about the selected document")}</h2>
          <p>
            {questionScope === "case"
              ? t("The agent keeps the transferred conversation, case preparation, and every owned case document in scope.")
              : t("The agent keeps the case conversation and focuses retrieval on the exact file you select.")}
          </p>
        </div>

        <section className="case-agent-workbench" aria-label={t("Case Agent workbench")}>
          <div className="case-agent-workbench-heading">
            <div>
              <span>{t("Guided actions")}</span>
              <p>{t("Each action uses the saved case and documents you own. Research and review stay editable until you send them.")}</p>
            </div>
          </div>
          <div className="case-agent-workbench-actions">
            {CASE_AGENT_WORKFLOWS.map(workflow => {
              const isWorking = activeAgentAction === workflow.id;
              return (
                <button
                  key={workflow.id}
                  type="button"
                  className="case-agent-action"
                  disabled={Boolean(activeAgentAction)}
                  onClick={() => void handleAgentAction(workflow.id)}
                  title={t(workflow.description)}
                >
                  {isWorking ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}
                  <span>{t(isWorking ? "Working..." : workflow.label)}</span>
                </button>
              );
            })}
          </div>
          {agentFeedback && <p className="case-agent-workbench-status" role="status" data-no-i18n>{agentFeedback}</p>}
          {getAgentResultBlocks(agentResult).map(block => (
            <article className="case-agent-result" key={block.heading}>
              <h3 data-no-i18n>{block.heading}</h3>
              <ul>{block.lines.map((line, index) => <li data-no-i18n key={`${block.heading}-${index}`}>{line}</li>)}</ul>
            </article>
          ))}
        </section>

        {(caseData.conversationHistory?.length ?? 0) > 0 && (
          <section className="case-agent-memory" aria-label={t("Transferred case conversation")}>
            <div className="case-agent-memory-heading">
              <span>{t("Conversation memory")}</span>
              <strong>{caseData.conversationHistory?.length ?? 0}</strong>
            </div>
            {caseData.conversationContextSummary && (
              <p className="case-agent-memory-note">{t("Earlier messages are retained in the private case memory summary.")}</p>
            )}
            <div className="case-agent-memory-thread">
              {caseData.conversationHistory?.slice(-6).map((message, index) => (
                <div key={`${message.role}:${index}`} className={`case-agent-memory-message ${message.role}`}>
                  <strong>{message.role === "assistant" ? t("Legal Saathi") : t("You")}</strong>
              <p data-no-i18n>{message.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="case-question-scope" role="group" aria-label={t("Question scope")}>
          <button
            type="button"
            className={questionScope === "document" ? "active" : ""}
            onClick={() => setQuestionScope("document")}
            disabled={!selectedDocument}
          >
            {t("Selected document")}
          </button>
          <button
            type="button"
            className={questionScope === "case" ? "active" : ""}
            onClick={() => setQuestionScope("case")}
          >
            {t("Entire case")}
          </button>
        </div>

        <div className={`case-question-reference ${questionScope === "case" || selectedDocument ? "ready" : "empty"}`}>
          <span className="case-question-reference-icon" aria-hidden="true">
            {questionScope === "case"
              ? <Files size={18} />
              : selectedDocument?.previewKind === "image" ? <FileImage size={18} /> : <FileText size={18} />}
          </span>
          <div>
            <span>
              {questionScope === "case"
                ? t("Entire case")
                : selectedDocument ? getQuestionReferenceLabel(selectedDocument.previewKind) : t("No document selected")}
            </span>
            <strong>
              {questionScope === "case"
                ? <>{caseDocs.length} {t(caseDocs.length === 1 ? "document" : "documents")} {t("plus conversation memory in")} <span data-no-i18n>{caseData.name}</span></>
                : selectedDocument ? <span data-no-i18n>{selectedDocument.name}</span> : t("Choose a document from the case tree")}
            </strong>
            {questionScope === "case" ? (
              <small>{t("Case-wide retrieval enabled")}</small>
            ) : selectedDocument && (
              <small>{t(selectedDocument.caseCategory ?? "Other")} | {getPreviewLabel(selectedDocument.previewKind)}</small>
            )}
          </div>
        </div>

        {questionScope === "document" && selectedAnnotations.length > 0 && (
          <section className="case-annotation-list" aria-label={t("Saved document annotations")}>
            <div className="case-annotation-list-heading">
              <span>{t("Saved comments")}</span>
              <strong>{selectedAnnotations.length}</strong>
            </div>
            <div className="case-annotation-list-items">
              {selectedAnnotations.map(annotation => {
                const isReferenced = referencedAnnotationIds.includes(annotation.id);
                return (
                  <button
                    key={annotation.id}
                    type="button"
                    className={isReferenced ? "referenced" : ""}
                    onClick={() => toggleAnnotationReference(annotation.id)}
                    title={isReferenced ? t("Remove from this question") : t("Reference in this question")}
                  >
                    <span data-no-i18n>&quot;{annotation.selectedText}&quot;</span>
                    <strong data-no-i18n>{annotation.comment}</strong>
                    <small>{isReferenced ? t("Referenced in question") : t("Click to reference")}</small>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <form className="case-question-form" onSubmit={handleAskQuestion}>
          <label htmlFor="case-document-question">
            {questionScope === "case" ? t("Question across this case") : t("Question about this document")}
          </label>
          {referencedAnnotations.length > 0 && (
            <div className="case-question-annotation-reference">
              <Highlighter size={14} />
              {referencedAnnotations.length} {t(referencedAnnotations.length === 1 ? "annotation attached" : "annotations attached")}
            </div>
          )}
          <div className="case-question-input-wrap">
            <textarea
              id="case-document-question"
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                if (questionFeedback) setQuestionFeedback("");
              }}
              placeholder={questionScope === "case"
                ? `${t("Ask about the")} ${caseData.name} ${t("case")}`
                : selectedDocument ? `${t("Ask about")} ${selectedDocument.name}` : t("Select a document first")}
              disabled={(questionScope === "document" && !selectedDocument) || isSubmittingQuestion}
              rows={5}
            />
            <DictationControl
              key={`${caseData.id}:${questionScope}:${selectedDocument?.id ?? "case"}`}
              value={question}
              onChange={(nextQuestion) => {
                setQuestion(nextQuestion);
                if (questionFeedback) setQuestionFeedback("");
              }}
              language={language}
              disabled={(questionScope === "document" && !selectedDocument) || isSubmittingQuestion}
              onMessage={setQuestionFeedback}
              className="case-dictation-control"
            />
          </div>
          <button type="submit" className="case-question-submit" disabled={(questionScope === "document" && !selectedDocument) || !question.trim() || isSubmittingQuestion}>
            {isSubmittingQuestion ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
            {isSubmittingQuestion ? t("Working with case memory") : t("Ask Case Agent")}
          </button>
        </form>

        {questionFeedback && (
          <div className="case-question-status" role="status">
            {questionFeedback}
          </div>
        )}

        {activeQuestions.length > 0 && (
          <section className="case-question-history" aria-label={t("Saved document questions")}>
            <div className="case-question-history-heading">
              <span>{questionScope === "case" ? t("Case questions") : t("Document questions")}</span>
              <strong>{activeQuestions.length}</strong>
            </div>
            <ol>
              {activeQuestions.map(documentQuestion => (
                <li key={documentQuestion.id}>
                  <p data-no-i18n>{documentQuestion.text}</p>
                  <span>
                    {getQuestionStatusLabel(documentQuestion.status)}
                    {documentQuestion.scope === "case"
                      ? ` | ${documentQuestion.sourceDocumentIds?.length ?? caseDocs.length} ${t("documents in scope")}`
                      : documentQuestion.retrievedDocumentIds?.length
                        ? ` | ${documentQuestion.retrievedDocumentIds.length} ${t(documentQuestion.retrievedDocumentIds.length === 1 ? "relevant document" : "relevant documents")}`
                        : ""}
                  </span>
                  {documentQuestion.response && (
                    <div className="case-question-answer" data-no-i18n>{documentQuestion.response}</div>
                  )}
                  {documentQuestion.errorMessage && (
                    <div className="case-question-answer error" data-no-i18n>{documentQuestion.errorMessage}</div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </aside>
    </section>
  );
}
