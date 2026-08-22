"use client";
import { Archive, Briefcase, Coins, FileText, Gauge, HelpCircle, Pencil, Pin, PinOff, RotateCcw, Search, Settings, Sparkles, Trash2, PanelLeftClose, Plus } from "lucide-react";
import { AppView, CaseData, DocumentData } from "@/lib/types";
import { usePlanState } from "./PlanStateProvider";
import { useState } from "react";
import { sidebarMessage, type SidebarMessageKey } from "@/lib/i18n/sidebarMessages";
import type { AppLanguage } from "@/lib/i18n";

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
  const [conversationView, setConversationView] = useState<"active" | "archived">("active");
  const { planState } = usePlanState();
  const t = (key: SidebarMessageKey) => sidebarMessage(language, key);
  const pastConversations = documents
    .filter(document => !document.caseId && Boolean(document.archived) === (conversationView === "archived"))
    .filter(document => !conversationQuery.trim() || document.name.toLowerCase().includes(conversationQuery.trim().toLowerCase()))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.uploadedAt - a.uploadedAt);

  const isNewChatActive = activeView === "dashboard" && !activeDocId;
  const isCaseHubActive = activeView === "case_hub" || activeView === "case_workspace";
  const planName = planState?.plan.name ?? "Free";
  const includedTotal = planState?.balances.included.total ?? 100;
  const includedRemaining = planState?.balances.included.remaining ?? 100;
  const purchasedRemaining = planState?.balances.purchased.remaining ?? 0;
  const usagePercentage = includedTotal > 0 ? Number(((includedRemaining / includedTotal) * 100).toFixed(2)) : 0;

  return (
    <aside className={`sidebar ${!isOpen ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <div>
          <h2>Legal Saathi</h2>
          <p className="text-secondary">{t("sidebar.brand.subtitle")}</p>
        </div>
        <button className="sidebar-icon-btn" onClick={onToggle} aria-label={t("sidebar.collapse")}>
          <PanelLeftClose size={20} />
        </button>
      </div>

      <nav className="sidebar-primary" aria-label={t("sidebar.nav.label")}>
        <button className={`sidebar-nav-item ${isNewChatActive ? "active" : ""}`} onClick={onNewChat}>
          <Plus size={18} />
          <span>{t("sidebar.nav.newChat")}</span>
        </button>
        <button className={`sidebar-nav-item ${isCaseHubActive ? "active" : ""}`} onClick={onOpenCaseHub}>
          <Briefcase size={18} />
          <span>{t("sidebar.nav.caseWorkspaces")}</span>
          {cases.length > 0 && <span className="sidebar-count">{cases.length}</span>}
        </button>
      </nav>

      <div className="sidebar-scroll">
        <section className="sidebar-section" aria-labelledby="past-conversations-title">
          <div className="sidebar-section-heading">
            <span id="past-conversations-title">{t("sidebar.conversations.heading")}</span>
          </div>

          <label className="sidebar-conversation-search">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">{t("sidebar.conversations.search")}</span>
            <input value={conversationQuery} onChange={(event) => setConversationQuery(event.target.value)} placeholder={t("sidebar.conversations.search")} />
          </label>
          <div className="sidebar-conversation-tabs" role="tablist" aria-label={t("sidebar.conversations.viewLabel")}>
            <button type="button" role="tab" aria-selected={conversationView === "active"} className={conversationView === "active" ? "active" : ""} onClick={() => setConversationView("active")}>{t("sidebar.conversations.active")}</button>
            <button type="button" role="tab" aria-selected={conversationView === "archived"} className={conversationView === "archived" ? "active" : ""} onClick={() => setConversationView("archived")}>{t("sidebar.conversations.archived")}</button>
          </div>

          {lastDeletedChatName && (
            <div className="sidebar-chat-restore" role="status">
              <span>{lastDeletedChatName} {t("sidebar.chat.movedToTrash")}</span>
              <button type="button" onClick={onRestoreLastDeletedChat} aria-label={`${t("sidebar.chat.restoreLabel")} ${lastDeletedChatName}`}><RotateCcw size={14} /> {t("sidebar.chat.restore")}</button>
            </div>
          )}

          {pastConversations.length === 0 ? (
            <p className="sidebar-empty">{t("sidebar.conversations.empty")}</p>
          ) : (
            <div className="sidebar-list">
              {pastConversations.map(document => {
                const isActive = activeView === "dashboard" && activeDocId === document.id;

                return (
                  <div className={`sidebar-chat-row ${isActive ? "active" : ""}`} key={document.id}>
                    <button className="sidebar-list-item" onClick={() => onSelectDoc(document.id)} aria-label={`${t("sidebar.chat.open")} ${document.name}`}>
                      <FileText size={16} />
                      <span>{document.name}</span>
                    </button>
                    <div className="sidebar-chat-actions">
                      <button type="button" onClick={() => onPinChat(document.id, !document.pinned)} aria-label={`${t(document.pinned ? "sidebar.chat.unpin" : "sidebar.chat.pin")} ${document.name}`} title={t(document.pinned ? "sidebar.chat.unpin" : "sidebar.chat.pin")}>
                        {document.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                      </button>
                      <button type="button" onClick={() => onRenameChat(document.id)} aria-label={`${t("sidebar.chat.rename")} ${document.name}`} title={t("sidebar.chat.rename")}><Pencil size={13} /></button>
                      <button type="button" onClick={() => onArchiveChat(document.id, !document.archived)} aria-label={`${t(document.archived ? "sidebar.chat.unarchive" : "sidebar.chat.archive")} ${document.name}`} title={t(document.archived ? "sidebar.chat.unarchive" : "sidebar.chat.archive")}><Archive size={13} /></button>
                      <button type="button" onClick={() => onDeleteChat(document.id)} aria-label={`${t("sidebar.chat.delete")} ${document.name}`} title={t("sidebar.chat.moveToTrash")}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-usage-summary" onClick={() => onOpenSettings("usage")} title={t("sidebar.footer.usageDetails")}>
          <div className="sidebar-usage-heading">
            <span><Gauge size={15} /> {planName} {t("sidebar.usage.units")}</span>
            <strong>{usagePercentage.toFixed(2)}%</strong>
          </div>
          <div className="sidebar-usage-track" aria-hidden="true">
            <span style={{ width: `${usagePercentage}%` }} />
          </div>
          <span className="sidebar-usage-detail">{includedRemaining.toLocaleString("en-IN")} / {includedTotal.toLocaleString("en-IN")} {t("sidebar.usage.included")}</span>
          {planState?.plan.id !== "free" && <span className="sidebar-usage-detail">{purchasedRemaining.toLocaleString("en-IN")} {t("sidebar.usage.topUpUnits")}</span>}
        </button>
        <button className="sidebar-footer-item" onClick={() => onOpenSettings()}>
          <Settings size={18} />
          <span>{t("sidebar.footer.settings")}</span>
        </button>
        <button
          className="sidebar-footer-item"
          onClick={planState?.plan.id === "free" || !planState ? onOpenPlans : onOpenTopUp}
        >
          {planState?.plan.id === "free" || !planState ? <Sparkles size={18} /> : <Coins size={18} />}
          <span>{t(planState?.plan.id === "free" || !planState ? "sidebar.footer.upgrade" : "sidebar.footer.topUp")}</span>
        </button>
        <button className="sidebar-footer-item" type="button" onClick={onOpenHelp}>
          <HelpCircle size={18} />
          <span>{t("sidebar.footer.help")}</span>
        </button>
      </div>
    </aside>
  );
}
