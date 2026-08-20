"use client";
import { Archive, Briefcase, Coins, FileText, Gauge, HelpCircle, Pencil, Pin, PinOff, RotateCcw, Search, Settings, Sparkles, Trash2, PanelLeftClose, Plus } from "lucide-react";
import { AppView, CaseData, DocumentData } from "@/lib/types";
import { usePlanState } from "./PlanStateProvider";
import { useRef, useState } from "react";
import type { AppLanguage } from "@/lib/i18n";
import { appCopy, formatAppCopy, type AppCopyKey } from "@/lib/i18n/appCopy";
import { getConversationTabNextView, type ConversationTabView } from "@/lib/conversationTabKeyboard";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  documents: DocumentData[];
  cases: CaseData[];
  activeDocId: string | null;
  activeView: AppView;
  onSelectDoc: (id: string) => void;
  onNewChat: () => void;
  onRenameChat: (id: string) => void;
  onPinChat: (id: string, pinned: boolean) => void;
  onArchiveChat: (id: string, archived: boolean) => void;
  onDeleteChat: (id: string) => void;
  lastDeletedChatName?: string;
  onRestoreLastDeletedChat: () => void;
  onOpenCaseHub: () => void;
  onOpenSettings: (initialTab?: "usage") => void;
  onOpenPlans: () => void;
  onOpenTopUp: () => void;
  onOpenHelp: () => void;
  language: AppLanguage;
}

export default function Sidebar({
  isOpen,
  onToggle,
  documents,
  cases,
  activeDocId,
  activeView,
  onSelectDoc,
  onNewChat,
  onRenameChat,
  onPinChat,
  onArchiveChat,
  onDeleteChat,
  lastDeletedChatName,
  onRestoreLastDeletedChat,
  onOpenCaseHub,
  onOpenSettings,
  onOpenPlans,
  onOpenTopUp,
  onOpenHelp,
  language,
}: SidebarProps) {
  const [conversationQuery, setConversationQuery] = useState("");
  const [conversationView, setConversationView] = useState<ConversationTabView>("active");
  const activeConversationTabRef = useRef<HTMLButtonElement>(null);
  const archivedConversationTabRef = useRef<HTMLButtonElement>(null);
  const { planState } = usePlanState();
  const copy = (key: AppCopyKey) => appCopy(language, key);
  const formatCopy = (key: AppCopyKey, values: Readonly<Record<string, string | number>>) => formatAppCopy(language, key, values);
  const pastConversations = documents
    .filter(document => !document.caseId && Boolean(document.archived) === (conversationView === "archived"))
    .filter(document => !conversationQuery.trim() || document.name.toLowerCase().includes(conversationQuery.trim().toLowerCase()))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.uploadedAt - a.uploadedAt);

  const isNewChatActive = activeView === "dashboard" && !activeDocId;
  const isCaseHubActive = activeView === "case_hub" || activeView === "case_workspace";
  const planName = planState?.plan.id === "free" ? copy("plan.free") : planState?.plan.name ?? copy("plan.free");
  const includedTotal = planState?.balances.included.total ?? 100;
  const includedRemaining = planState?.balances.included.remaining ?? 100;
  const purchasedRemaining = planState?.balances.purchased.remaining ?? 0;
  const usagePercentage = includedTotal > 0 ? Number(((includedRemaining / includedTotal) * 100).toFixed(2)) : 0;

  const handleConversationTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const nextView = getConversationTabNextView(conversationView, event.key);
    if (!nextView) return;
    event.preventDefault();
    setConversationView(nextView);
    window.requestAnimationFrame(() => {
      (nextView === "active" ? activeConversationTabRef : archivedConversationTabRef).current?.focus();
    });
  };

  return (
    <aside className={`sidebar ${!isOpen ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <div>
          <h2>Legal Saathi</h2>
          <p className="text-secondary">by inceptionaistudios</p>
        </div>
        <button type="button" className="sidebar-icon-btn" onClick={onToggle} aria-label={copy("sidebar.collapse")}>
          <PanelLeftClose size={20} />
        </button>
      </div>

      <nav className="sidebar-primary" aria-label={copy("sidebar.primaryNavigation")}>
        <button type="button" className={`sidebar-nav-item ${isNewChatActive ? "active" : ""}`} onClick={onNewChat}>
          <Plus size={18} />
          <span>{copy("sidebar.newChat")}</span>
        </button>
        <button type="button" className={`sidebar-nav-item ${isCaseHubActive ? "active" : ""}`} onClick={onOpenCaseHub}>
          <Briefcase size={18} />
          <span>{copy("sidebar.caseWorkspaces")}</span>
          {cases.length > 0 && <span className="sidebar-count">{cases.length}</span>}
        </button>
      </nav>

      <div className="sidebar-scroll">
        <section className="sidebar-section" aria-labelledby="past-conversations-title">
          <div className="sidebar-section-heading">
            <span id="past-conversations-title">{copy("sidebar.pastConversations")}</span>
          </div>

          <label className="sidebar-conversation-search">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">{copy("sidebar.searchConversations")}</span>
            <input value={conversationQuery} onChange={(event) => setConversationQuery(event.target.value)} placeholder={copy("sidebar.searchConversations")} />
          </label>
          <div className="sidebar-conversation-tabs" role="tablist" aria-label={copy("sidebar.conversationView")}>
            <button ref={activeConversationTabRef} id="sidebar-active-conversations-tab" type="button" role="tab" aria-controls="sidebar-active-conversations-panel" aria-selected={conversationView === "active"} tabIndex={conversationView === "active" ? 0 : -1} className={conversationView === "active" ? "active" : ""} onClick={() => setConversationView("active")} onKeyDown={handleConversationTabKeyDown}>{copy("sidebar.active")}</button>
            <button ref={archivedConversationTabRef} id="sidebar-archived-conversations-tab" type="button" role="tab" aria-controls="sidebar-archived-conversations-panel" aria-selected={conversationView === "archived"} tabIndex={conversationView === "archived" ? 0 : -1} className={conversationView === "archived" ? "active" : ""} onClick={() => setConversationView("archived")} onKeyDown={handleConversationTabKeyDown}>{copy("sidebar.archived")}</button>
          </div>

          {lastDeletedChatName && (
            <div className="sidebar-chat-restore" role="status">
              <span>{formatCopy("sidebar.movedToTrash", { conversation: lastDeletedChatName })}</span>
              <button type="button" onClick={onRestoreLastDeletedChat} aria-label={formatCopy("sidebar.restoreConversation", { conversation: lastDeletedChatName })}><RotateCcw size={14} /> {copy("sidebar.restore")}</button>
            </div>
          )}

          <div id={conversationView === "active" ? "sidebar-active-conversations-panel" : "sidebar-archived-conversations-panel"} role="tabpanel" aria-labelledby={conversationView === "active" ? "sidebar-active-conversations-tab" : "sidebar-archived-conversations-tab"}>
            {pastConversations.length === 0 ? (
              <p className="sidebar-empty">{copy("sidebar.noPastConversations")}</p>
            ) : (
              <div className="sidebar-list">
                {pastConversations.map(document => {
                  const isActive = activeView === "dashboard" && activeDocId === document.id;

                  return (
                    <div className={`sidebar-chat-row ${isActive ? "active" : ""}`} key={document.id}>
                      <button type="button" className="sidebar-list-item" onClick={() => onSelectDoc(document.id)} aria-label={formatCopy("sidebar.openConversation", { conversation: document.name })}>
                        <FileText size={16} />
                        <span data-no-i18n>{document.name}</span>
                      </button>
                      <div className="sidebar-chat-actions">
                        <button type="button" onClick={() => onPinChat(document.id, !document.pinned)} aria-label={formatCopy(document.pinned ? "sidebar.unpinConversation" : "sidebar.pinConversation", { conversation: document.name })} title={formatCopy(document.pinned ? "sidebar.unpinConversation" : "sidebar.pinConversation", { conversation: document.name })}>
                          {document.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                        </button>
                        <button type="button" onClick={() => onRenameChat(document.id)} aria-label={formatCopy("sidebar.renameConversation", { conversation: document.name })} title={formatCopy("sidebar.renameConversation", { conversation: document.name })}><Pencil size={13} /></button>
                        <button type="button" onClick={() => onArchiveChat(document.id, !document.archived)} aria-label={formatCopy(document.archived ? "sidebar.unarchiveConversation" : "sidebar.archiveConversation", { conversation: document.name })} title={formatCopy(document.archived ? "sidebar.unarchiveConversation" : "sidebar.archiveConversation", { conversation: document.name })}><Archive size={13} /></button>
                        <button type="button" onClick={() => onDeleteChat(document.id)} aria-label={formatCopy("sidebar.deleteConversation", { conversation: document.name })} title={formatCopy("sidebar.deleteConversation", { conversation: document.name })}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-usage-summary" onClick={() => onOpenSettings("usage")} title={copy("sidebar.viewUsageDetails")}>
          <div className="sidebar-usage-heading">
            <span><Gauge size={15} /> {planName} {copy("sidebar.units")}</span>
            <strong>{usagePercentage.toFixed(2)}%</strong>
          </div>
          <div className="sidebar-usage-track" aria-hidden="true">
            <span style={{ width: `${usagePercentage}%` }} />
          </div>
          <span className="sidebar-usage-detail">{includedRemaining.toLocaleString("en-IN")} / {includedTotal.toLocaleString("en-IN")} {copy("sidebar.included")}</span>
          {planState?.plan.id !== "free" && <span className="sidebar-usage-detail">{purchasedRemaining.toLocaleString("en-IN")} {copy("sidebar.topUpUnits")}</span>}
        </button>
        <button type="button" className="sidebar-footer-item" onClick={() => onOpenSettings()}>
          <Settings size={18} />
          <span>{copy("sidebar.settings")}</span>
        </button>
        <button
          type="button"
          className="sidebar-footer-item"
          onClick={planState?.plan.id === "free" || !planState ? onOpenPlans : onOpenTopUp}
        >
          {planState?.plan.id === "free" || !planState ? <Sparkles size={18} /> : <Coins size={18} />}
          <span>{copy(planState?.plan.id === "free" || !planState ? "sidebar.upgrade" : "sidebar.topUp")}</span>
        </button>
        <button className="sidebar-footer-item" type="button" onClick={onOpenHelp}>
          <HelpCircle size={18} />
          <span>{copy("sidebar.help")}</span>
        </button>
      </div>
    </aside>
  );
}
