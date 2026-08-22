"use client";
import { ArrowRight, Briefcase, FileText, Plus, Trash2, Undo2 } from "lucide-react";
import { CaseData, DocumentData } from "@/lib/types";
import { translateUiText } from "@/lib/i18n";
import type { AppLanguage } from "@/lib/i18n/types";

interface CaseHubProps {
  cases: CaseData[];
  documents: DocumentData[];
  onCreateCase: () => void;
  onOpenCase: (id: string) => void;
  onDeleteCase: (caseItem: CaseData) => void;
  lastDeletedCase?: CaseData | null;
  onRestoreLastDeleted?: () => void;
  actionError?: string | null;
  language: AppLanguage;
}

export default function CaseHub({ cases, documents, onCreateCase, onOpenCase, onDeleteCase, lastDeletedCase, onRestoreLastDeleted, actionError, language }: CaseHubProps) {
  const sortedCases = [...cases].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  const t = (text: string) => translateUiText(text, language);

  return (
    <section className="case-hub fade-in" aria-labelledby="case-hub-title">
      <header className="case-hub-header">
        <div>
          <span className="case-hub-kicker">{t("Case workspaces")}</span>
          <h1 id="case-hub-title">{t("Organize every matter in one place.")}</h1>
          <p>
            {t("Open a case workspace to collect documents, keep the matter separate from ordinary chats, and organize the record by legal document type.")}
          </p>
        </div>
        <button className="case-hub-create" onClick={onCreateCase}>
          <Plus size={18} />
          {t("New Case")}
        </button>
      </header>

      {lastDeletedCase && (
        <div className="legal-ai-error" role="status" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem" }}>
          <span>{lastDeletedCase.name} {t("moved to trash. It can be restored during this session.")}</span>
          <button className="btn" onClick={onRestoreLastDeleted}><Undo2 size={15} />{t("Restore")}</button>
        </div>
      )}

      {actionError && <div className="legal-ai-error" role="alert">{actionError}</div>}

      {sortedCases.length === 0 ? (
        <div className="case-hub-empty">
          <Briefcase size={30} />
          <h2>{t("No case workspaces yet")}</h2>
          <p>{t("Create a case workspace when a matter needs multiple documents, its own structure, and a separate working area.")}</p>
          <button className="case-hub-create" onClick={onCreateCase}>
            <Plus size={18} />
            {t("Create Case Workspace")}
          </button>
        </div>
      ) : (
        <div className="case-hub-grid">
          {sortedCases.map(caseItem => {
            const caseDocs = documents.filter(document => caseItem.documentIds.includes(document.id));
            const updatedAt = new Date(caseItem.updatedAt ?? caseItem.createdAt).toLocaleDateString();

            return (
              <article key={caseItem.id} className="case-hub-card">
                <div className="case-hub-card-top">
                  <span className="case-hub-icon" aria-hidden="true">
                    <Briefcase size={19} />
                  </span>
                  <span className="case-hub-tag">{caseItem.typeTag ?? t("Case")}</span>
                </div>
                <h2>{caseItem.name}</h2>
                {caseItem.clientName && <p className="case-hub-client">{caseItem.clientName}</p>}
                {caseItem.description && <p className="case-hub-description">{caseItem.description}</p>}
                <div className="case-hub-meta">
                  <span>
                    <FileText size={15} />
                    {caseItem.documentLoadStatus === "failed"
                      ? t("Documents unavailable")
                      : `${caseDocs.length} ${t(caseDocs.length === 1 ? "document" : "documents")}`}
                  </span>
                  <span>{t("Updated")} {updatedAt}</span>
                </div>
                <div style={{ display: "flex", gap: ".6rem" }}>
                  <button className="case-hub-open" onClick={() => onOpenCase(caseItem.id)}>
                    {t("Open workspace")}
                    <ArrowRight size={17} />
                  </button>
                  <button className="btn" aria-label={`${t("Delete")} ${caseItem.name}`} title={t("Move case to trash")} onClick={() => onDeleteCase(caseItem)} style={{ color: "#f87171" }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
