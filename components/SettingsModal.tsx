"use client";
import { useState, useEffect, useRef } from "react";
import { User, Palette, Bell, Shield, CreditCard, Database, Scale, Gauge, X, Check, Download, Trash2, AlertTriangle } from "lucide-react";
import { UserProfile, AppSettings, UsageData } from "@/lib/types";
import { formatDailyResetTime, formatResetTime, getPlanLabel } from "@/lib/requestSettings";
import type { AppLanguage } from "@/lib/i18n";
import { appCopy, publicLanguageHref } from "@/lib/i18n/appCopy";
import { formatSettingsModalCopy, settingJurisdictionKeys, settingLawAreaKeys, settingsModalCopy } from "@/lib/i18n/settingsModalCopy";
import { getModalFocusCycleTargetInContainer } from "@/lib/modalFocusTrap";
import { usePlanState } from "./PlanStateProvider";
import { SupabaseMfaSettings } from "./security/SupabaseMfaSettings";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearHistory: () => Promise<void>;
  initialTab?: SettingsTab;
  onOpenPlans?: () => void;
  onReviewConsent?: () => void;
  authUser?: Pick<UserProfile, "displayName" | "email" | "avatarColor"> | null;
  language?: AppLanguage;
}

type SettingsTab = "profile" | "appearance" | "notifications" | "security" | "billing" | "usage" | "data" | "legal";

const ACCENT_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#f97316"];
const AVATAR_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#f97316", "#6366f1", "#14b8a6"];
const JURISDICTIONS = ["India", "United States", "United Kingdom", "European Union", "Canada", "Australia", "Singapore"];
const LAW_AREAS = ["Corporate Law", "Criminal Law", "Family Law", "Intellectual Property", "Labor & Employment", "Real Estate", "Tax Law", "Constitutional Law", "Environmental Law", "Immigration Law", "Banking & Finance", "Cyber Law"];

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1 && parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return "?";
};

const ToggleSwitch = ({ checked, onChange, label }: { checked: boolean; onChange: (c: boolean) => void; label: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    style={{
      width: "44px", height: "24px", borderRadius: "12px",
      background: checked ? "#3b82f6" : "rgba(255,255,255,0.15)",
      position: "relative", cursor: "pointer", padding: 0, border: 0,
      transition: "background 0.2s"
    }}
  >
    <span aria-hidden="true" style={{
      width: "18px", height: "18px", borderRadius: "50%", background: "#fff",
      position: "absolute", top: "3px", left: checked ? "23px" : "3px",
      transition: "left 0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
    }} />
  </button>
);

export default function SettingsModal({ isOpen, onClose, onClearHistory, initialTab = "profile", onOpenPlans, onReviewConsent, authUser = null, language = "en" }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [showSaved, setShowSaved] = useState(false);
  const [historyAction, setHistoryAction] = useState<"idle" | "clearing" | "cleared" | "failed">("idle");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const { catalog, planState, usage: backendUsage } = usePlanState();
  const copy = (key: Parameters<typeof settingsModalCopy>[1]) => settingsModalCopy(language, key);
  const formatCopy = (key: Parameters<typeof formatSettingsModalCopy>[1], values: Readonly<Record<string, string | number>>) => formatSettingsModalCopy(language, key, values);
  const usage: UsageData = {
    plan: planState?.plan.id ?? "free",
    creditsTotal: planState?.balances.included.total ?? 100,
    creditsRemaining: planState?.balances.included.remaining ?? 100,
    nextResetAt: planState ? new Date(planState.plan.cycleEndsAt).getTime() : 0,
    dailyResetAt: backendUsage?.usage.find((item) => item.feature === "chat") ? new Date(backendUsage.usage.find((item) => item.feature === "chat")!.resetAt).getTime() : undefined,
    weeklyResetAt: backendUsage?.usage.find((item) => item.feature === "caseFolders") ? new Date(backendUsage.usage.find((item) => item.feature === "caseFolders")!.resetAt).getTime() : undefined,
    autoUsesRemaining: Number.MAX_SAFE_INTEGER,
  };

  const [profile, setProfile] = useState<UserProfile>({ displayName: "", nickname: "", email: "", avatarColor: "#3b82f6" });
  
  const [settings, setSettings] = useState<AppSettings>({
    theme: "dark", fontSize: 16, accentColor: "#3b82f6",
    notifications: { caseUpdates: true, analysisComplete: true, weeklyDigest: false, securityAlerts: true },
    legal: { jurisdiction: "India", lawAreas: [] }
  });

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setHistoryAction("idle");
      setProfile({
        displayName: authUser?.displayName ?? "",
        nickname: authUser?.displayName?.split(/\s+/)[0] ?? "",
        email: authUser?.email ?? "",
        avatarColor: authUser?.avatarColor ?? "#3b82f6",
      });
    }
  }, [authUser, initialTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (previouslyFocusedElementRef.current?.isConnected) previouslyFocusedElementRef.current.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty("--accent-primary", settings.accentColor);
    document.documentElement.style.setProperty("--accent-primary-hover", settings.accentColor);
    document.documentElement.style.setProperty("--app-font-scale", String(settings.fontSize / 16));
  }, [settings.accentColor, settings.fontSize, settings.theme]);

  const saveProfile = (p: UserProfile) => {
    setProfile(p);
    triggerSaved();
  };

  const saveSettings = (s: AppSettings) => {
    setSettings(s);
    triggerSaved();
  };

  const triggerSaved = () => {
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 1500);
  };

  const handleExportData = () => {
    window.location.assign("/data-export");
  };

  const handleClearHistory = async () => {
    if (historyAction === "clearing") return;
    if (!window.confirm(appCopy(language, "settings.clearChatHistoryConfirm"))) return;
    setHistoryAction("clearing");
    try {
      await onClearHistory();
      setHistoryAction("cleared");
    } catch {
      setHistoryAction("failed");
    }
  };

  const handleDeleteAccount = () => {
    window.location.assign("/data-deletion");
  };

  const formatPlanPrice = (planId: "plus" | "pro") => {
    const pricePaise = catalog?.plans.find((plan) => plan.id === planId)?.pricePaise;
    return typeof pricePaise === "number"
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(pricePaise / 100)
      : copy("billing.loading");
  };
  const includedPercentageRemaining = usage.creditsTotal > 0
    ? Number(((usage.creditsRemaining / usage.creditsTotal) * 100).toFixed(2))
    : 0;
  const purchasedUnitsRemaining = planState?.balances.purchased.remaining ?? 0;
  const allowedModels = new Set(planState?.entitlements.allowedModels ?? ["auto", "fast", "flash"]);
  const chatUsage = backendUsage?.usage.find((item) => item.feature === "chat");
  const caseUsage = backendUsage?.usage.find((item) => item.feature === "caseFolders");
  const modelRows = (catalog?.models ?? []).map((model) => ({
    label: model.name,
    detail: !model.configured
      ? copy("billing.notConfigured")
      : allowedModels.has(model.id)
        ? copy("billing.available")
        : model.id === "ultra"
          ? copy("billing.requiresMax")
          : copy("billing.requiresHigher"),
  }));

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nextFocus = getModalFocusCycleTargetInContainer(event.currentTarget, document.activeElement, event.shiftKey);
    if (!nextFocus) return;
    event.preventDefault();
    nextFocus.focus();
  };

  if (!isOpen) return null;

  const tabs = [
    { id: "profile", icon: User, label: copy("tab.profile") },
    { id: "appearance", icon: Palette, label: copy("tab.appearance") },
    { id: "notifications", icon: Bell, label: copy("tab.notifications") },
    { id: "security", icon: Shield, label: copy("tab.security") },
    { id: "billing", icon: CreditCard, label: copy("tab.billing") },
    { id: "usage", icon: Gauge, label: copy("tab.usage") },
    { id: "data", icon: Database, label: copy("tab.data") },
    { id: "legal", icon: Scale, label: copy("tab.legal") },
  ];

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-content settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" onKeyDown={handleDialogKeyDown} onClick={e => e.stopPropagation()} style={{ width: "900px", height: "640px", padding: 0, display: "flex", overflow: "hidden" }}>
        
        {/* Left Nav */}
        <div className="settings-modal-nav" style={{ width: "220px", background: "var(--bg-tertiary)", borderRight: "1px solid var(--border-default)", display: "flex", flexDirection: "column" }}>
          <div className="settings-modal-title" style={{ padding: "1.5rem 1rem", borderBottom: "1px solid var(--border-default)" }}>
            <h3 id="settings-modal-title" style={{ fontSize: "1.25rem", margin: 0 }}>{copy("title.settings")}</h3>
          </div>
          <div className="settings-modal-tabs" style={{ flex: 1, padding: "1rem 0", display: "flex", flexDirection: "column", gap: "2px" }}>
            {tabs.map(tab => (
              <button
                type="button"
                className="settings-modal-tab"
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                aria-pressed={activeTab === tab.id}
                style={{ 
                  display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem",
                  width: "100%", textAlign: "left", font: "inherit", cursor: "pointer",
                  border: 0, borderLeft: activeTab === tab.id ? "3px solid #3b82f6" : "3px solid transparent",
                  background: activeTab === tab.id ? "rgba(255,255,255,0.05)" : "transparent",
                  color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-secondary)"
                }}
              >
                <tab.icon size={18} />
                <span style={{ fontSize: "0.875rem", fontWeight: activeTab === tab.id ? 500 : 400 }}>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Content */}
        <div className="settings-modal-main" style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-secondary)", position: "relative" }}>
          <div className="settings-modal-header" style={{ padding: "1.5rem 2rem", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1.25rem", margin: 0 }}>{tabs.find(t => t.id === activeTab)?.label}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
              {showSaved && <span className="fade-in" style={{ color: "#10b981", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "4px" }}><Check size={16}/> {copy("action.updatedForSession")}</span>}
              <button ref={closeButtonRef} className="btn" type="button" aria-label={copy("action.close")} onClick={onClose} style={{ padding: "0.5rem", borderRadius: "var(--radius-full)" }}><X size={20}/></button>
            </div>
          </div>

          <div className="settings-modal-body" style={{ flex: 1, overflowY: "auto", padding: "2rem" }}>
            
            {activeTab === "profile" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                <div className="settings-profile-avatar" style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
                  <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: profile.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: "bold" }}>
                    {getInitials(profile.displayName)}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", flex: 1 }}>
                    {AVATAR_COLORS.map(color => (
                      <button
                        key={color} type="button" onClick={() => saveProfile({...profile, avatarColor: color})}
                        aria-label={formatCopy("action.chooseAvatarColor", { color })} aria-pressed={profile.avatarColor === color}
                        style={{ width: "32px", height: "32px", padding: 0, borderRadius: "50%", background: color, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: profile.avatarColor === color ? "2px solid #fff" : "none" }}
                      >
                        {profile.avatarColor === color && <Check size={16} color="#fff" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
                  <div><label htmlFor="settings-display-name" className="text-secondary" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>{copy("profile.displayName")}</label><input id="settings-display-name" className="apple-glass-input" value={profile.displayName} onChange={e => saveProfile({...profile, displayName: e.target.value})} /></div>
                  <div><label htmlFor="settings-nickname" className="text-secondary" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>{copy("profile.nickname")}</label><input id="settings-nickname" className="apple-glass-input" value={profile.nickname} onChange={e => saveProfile({...profile, nickname: e.target.value})} /></div>
                  <div><label htmlFor="settings-email" className="text-secondary" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>{copy("profile.email")}</label><input id="settings-email" className="apple-glass-input" type="email" value={profile.email} onChange={e => saveProfile({...profile, email: e.target.value})} /></div>
                </div>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                <div>
                  <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>{copy("appearance.theme")}</h3>
                  <div style={{ display: "flex", gap: "1rem" }}>
                    <button type="button" onClick={() => saveSettings({...settings, theme: "dark"})} aria-pressed={settings.theme === "dark"} style={{ flex: 1, padding: "1.5rem", borderRadius: "var(--radius-lg)", border: settings.theme === "dark" ? "2px solid #3b82f6" : "1px solid var(--border-default)", background: "#0a0a0a", cursor: "pointer", textAlign: "center" }}>
                      {copy("appearance.dark")} 🌙
                    </button>
                    <button type="button" onClick={() => saveSettings({...settings, theme: "light"})} aria-pressed={settings.theme === "light"} style={{ flex: 1, padding: "1.5rem", borderRadius: "var(--radius-lg)", border: settings.theme === "light" ? "2px solid #3b82f6" : "1px solid var(--border-default)", background: "#f3f4f6", color: "#000", cursor: "pointer", textAlign: "center" }}>
                      {copy("appearance.light")} ☀️
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "1rem" }}>{copy("appearance.fontSize")}</h3>
                    <span className="text-secondary">{settings.fontSize}px</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <span className="text-secondary" style={{ fontSize: "12px" }}>{copy("appearance.small")}</span>
                    <input type="range" min="12" max="20" value={settings.fontSize} onChange={e => saveSettings({...settings, fontSize: parseInt(e.target.value)})} style={{ flex: 1 }} />
                    <span className="text-secondary" style={{ fontSize: "20px" }}>{copy("appearance.large")}</span>
                  </div>
                </div>

                <div>
                  <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>{copy("appearance.accentColor")}</h3>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    {ACCENT_COLORS.map(color => (
                      <button
                        key={color} type="button" onClick={() => saveSettings({...settings, accentColor: color})}
                        aria-label={formatCopy("action.chooseAccentColor", { color })} aria-pressed={settings.accentColor === color}
                        style={{ width: "40px", height: "40px", padding: 0, borderRadius: "8px", background: color, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: settings.accentColor === color ? "2px solid #fff" : "none", transform: settings.accentColor === color ? "scale(1.1)" : "none", transition: "transform 0.2s" }}
                      >
                        {settings.accentColor === color && <Check size={20} color="#fff" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {([
                  { key: "caseUpdates", title: copy("notification.caseUpdates.title"), desc: copy("notification.caseUpdates.description") },
                  { key: "analysisComplete", title: copy("notification.analysisComplete.title"), desc: copy("notification.analysisComplete.description") },
                  { key: "weeklyDigest", title: copy("notification.weeklyDigest.title"), desc: copy("notification.weeklyDigest.description") },
                  { key: "securityAlerts", title: copy("notification.securityAlerts.title"), desc: copy("notification.securityAlerts.description") }
                ] as const).map(({ key, title, desc }) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "var(--surface-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}>
                    <div>
                      <h4 style={{ marginBottom: "0.25rem" }}>{title}</h4>
                      <p className="text-secondary" style={{ fontSize: "0.875rem" }}>{desc}</p>
                    </div>
                    <ToggleSwitch 
                      checked={settings.notifications[key as keyof AppSettings["notifications"]]} 
                      onChange={c => saveSettings({...settings, notifications: {...settings.notifications, [key]: c}})}
                      label={title}
                    />
                  </div>
                ))}
              </div>
            )}

            {activeTab === "security" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                <div>
                  <h3 style={{ marginBottom: ".6rem", fontSize: "1rem" }}>{copy("security.signInMethod")}</h3>
                  <p className="text-secondary" style={{ margin: 0, lineHeight: 1.6 }}>{copy("security.signInDescription")}</p>
                </div>
                  <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "2.5rem" }}>
                    {authUser ? (
              <SupabaseMfaSettings language={language} />
                  ) : (
                    <div role="status" style={{ padding: "1rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", color: "var(--text-secondary)", fontSize: ".9rem", lineHeight: 1.55 }}>
                      {copy("security.signInRequired")}
                    </div>
                    )}
                  </div>

                  {authUser && onReviewConsent && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "1rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
                      <div>
                        <h3 style={{ marginBottom: ".3rem", fontSize: "1rem" }}>{copy("security.legalConsent")}</h3>
                        <p className="text-secondary" style={{ margin: 0, fontSize: ".875rem" }}>{copy("security.legalConsentDescription")}</p>
                      </div>
                      <button className="btn" type="button" onClick={onReviewConsent}>{copy("security.reviewConsent")}</button>
                    </div>
                  )}

                <div>
                  <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>{copy("security.activeSessions")}</h3>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", borderBottom: "1px solid var(--border-default)" }}>
                    <div>
                      <h4>{copy("security.thisDevice")}</h4>
                      <p className="text-secondary" style={{ fontSize: "0.875rem" }}>
                        {authUser
                          ? copy("security.activeSessionDescription")
                          : copy("security.signedOutSessionDescription")}
                      </p>
                    </div>
                    <span style={{ background: authUser ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.1)", color: authUser ? "#10b981" : "var(--text-secondary)", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600 }}>
                      {authUser ? copy("security.active") : copy("security.signedOut")}
                    </span>
                  </div>
                </div>

                <section aria-label={copy("security.disclosureAria")} style={{ padding: "1.25rem", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
                  <h3 style={{ marginBottom: ".75rem", fontSize: "1rem" }}>{copy("security.disclosureTitle")}</h3>
                  <p className="text-secondary" style={{ lineHeight: 1.65, marginBottom: ".75rem" }}>
                    {copy("security.disclosureProviders")}
                  </p>
                  <p className="text-secondary" style={{ lineHeight: 1.65, marginBottom: ".75rem" }}>
                    {copy("security.disclosureSensitiveData")}
                  </p>
                  <p className="text-secondary" style={{ lineHeight: 1.65, margin: 0 }}>
                    {copy("security.disclosureLegalLimit")}
                  </p>
                </section>
              </div>
            )}

            {activeTab === "billing" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.1), transparent)", padding: "2rem", borderRadius: "var(--radius-lg)", border: "1px solid rgba(59,130,246,0.3)" }}>
                  <h2 style={{ fontSize: "2.5rem", marginBottom: "0.5rem", background: "linear-gradient(to right, #fff, #a0a0a0)", WebkitBackgroundClip: "text", color: "transparent" }}>{formatCopy("billing.currentPlan", { plan: planState?.plan.name ?? getPlanLabel(usage.plan) })}</h2>
                  <p className="text-secondary" style={{ fontSize: "1.1rem", marginBottom: "2rem" }}>
                    {usage.plan === "free" ? copy("billing.freeDescription") : usage.plan === "plus" ? copy("billing.plusDescription") : usage.plan === "pro" ? copy("billing.proDescription") : copy("billing.maxDescription")}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem" }}>
                    {usage.plan === "free" && <button type="button" className="btn" onClick={() => onOpenPlans?.()}>{copy("billing.viewPlans")}</button>}
                    {usage.plan === "free" && <button type="button" className="btn btn-primary" onClick={() => onOpenPlans?.()} style={{ background: "linear-gradient(90deg, #3b82f6, #8b5cf6)", border: "none" }}>{formatCopy("billing.upgradePlus", { price: formatPlanPrice("plus") })}</button>}
                    {(usage.plan === "free" || usage.plan === "plus") && <button type="button" className="btn btn-primary" onClick={() => onOpenPlans?.()} style={{ background: "linear-gradient(90deg, #3b82f6, #8b5cf6)", border: "none" }}>{formatCopy("billing.upgradePro", { price: formatPlanPrice("pro") })}</button>}
                    {usage.plan === "plus" && <button type="button" className="btn" onClick={() => onOpenPlans?.()}>{copy("billing.managePlan")}</button>}
                    {(usage.plan === "pro" || usage.plan === "max") && <button type="button" className="btn" onClick={() => onOpenPlans?.()}>{copy("billing.manageBilling")}</button>}
                    {(usage.plan === "pro" || usage.plan === "max") && <button type="button" className="btn" onClick={() => onOpenPlans?.()}>{copy("billing.exploreAdvocatePrep")}</button>}
                  </div>
                </div>

                <div>
                  <h3 style={{ marginBottom: "1.5rem", fontSize: "1.25rem" }}>{copy("usage.creditsAndUsage")}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    <div style={{ padding: "1rem", background: "var(--surface-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.5rem" }}>
                        <span className="text-secondary">{copy("usage.includedUnitsRemaining")}</span>
                        <span>{usage.creditsRemaining.toLocaleString("en-IN")} / {usage.creditsTotal.toLocaleString("en-IN")} ({includedPercentageRemaining.toFixed(2)}%)</span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "var(--bg-elevated)", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ width: `${includedPercentageRemaining}%`, height: "100%", background: "#3b82f6" }} />
                      </div>
                      <div className="text-secondary" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginTop: "0.7rem", fontSize: "0.8rem" }}>
                        <span>{formatCopy("usage.nextReset", { time: formatResetTime(usage.nextResetAt) })}</span>
                        {usage.weeklyResetAt && <span>{formatCopy("usage.weeklyRefresh", { time: formatResetTime(usage.weeklyResetAt) })}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "1rem", background: "var(--surface-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}>
                      <span className="text-secondary">{copy("usage.purchasedTopUpUnits")}</span>
                      <strong>{purchasedUnitsRemaining.toLocaleString("en-IN")}</strong>
                    </div>
                    {chatUsage && <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}><span className="text-secondary">{copy("usage.chatWindow")}</span><span>{formatCopy("usage.remainingWithTotal", { remaining: chatUsage.remaining, total: chatUsage.limit })}</span></div>}
                    {caseUsage && <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}><span className="text-secondary">{copy("usage.caseFolderWindow")}</span><span>{formatCopy("usage.remainingWithTotal", { remaining: caseUsage.remaining, total: caseUsage.limit })}</span></div>}
                  </div>
                </div>

                <div>
                  <h3 style={{ marginBottom: "1rem", fontSize: "1.05rem" }}>{copy("usage.modelAccess")}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                    {modelRows.map(({ label, detail }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.75rem 0", borderBottom: "1px solid var(--border-default)", fontSize: "0.9rem" }}>
                        <span>{label}</span>
                        <span className="text-secondary">{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "usage" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div style={{ padding: "1.5rem", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "1.25rem" }}>
                    <div>
                      <p className="text-secondary" style={{ fontSize: "0.875rem", marginBottom: "0.25rem" }}>{copy("usage.includedUnitsRemaining")}</p>
                      <h3 style={{ margin: 0, fontSize: "2rem" }}>{usage.creditsRemaining.toLocaleString("en-IN")} <span className="text-secondary" style={{ fontSize: "1rem", fontWeight: 400 }}>/ {usage.creditsTotal.toLocaleString("en-IN")}</span></h3>
                    </div>
                    <span style={{ padding: "0.35rem 0.6rem", borderRadius: "var(--radius-full)", color: "var(--text-primary)", background: "var(--bg-elevated)", fontSize: "0.8rem", fontWeight: 700 }}>
                      {formatCopy("usage.percentLeft", { percent: includedPercentageRemaining.toFixed(2) })}
                    </span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "var(--bg-elevated)", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${includedPercentageRemaining}%`, height: "100%", background: "#3b82f6" }} />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "1rem 1.5rem", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
                  <span className="text-secondary">{copy("usage.purchasedTopUpUnits")}</span>
                  <strong>{purchasedUnitsRemaining.toLocaleString("en-IN")}</strong>
                </div>

                <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--border-default)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "1rem 0", borderBottom: "1px solid var(--border-default)" }}>
                    <div>
                        <h4 style={{ marginBottom: "0.2rem" }}>{copy("usage.nextCreditReset")}</h4>
                        <p className="text-secondary" style={{ fontSize: "0.85rem" }}>{copy("usage.nextCreditDescription")}</p>
                    </div>
                    <span>{formatResetTime(usage.nextResetAt)}</span>
                  </div>
                  {usage.dailyResetAt && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "1rem 0", borderBottom: "1px solid var(--border-default)" }}>
                      <div>
                        <h4 style={{ marginBottom: "0.2rem" }}>{copy("usage.dailyLimitRefresh")}</h4>
                        <p className="text-secondary" style={{ fontSize: "0.85rem" }}>{copy("usage.dailyLimitDescription")}</p>
                      </div>
                      <span>{formatDailyResetTime(usage.dailyResetAt)}</span>
                    </div>
                  )}
                  {usage.weeklyResetAt && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "1rem 0", borderBottom: "1px solid var(--border-default)" }}>
                      <div>
                        <h4 style={{ marginBottom: "0.2rem" }}>{copy("usage.weeklyAllowanceRefresh")}</h4>
                        <p className="text-secondary" style={{ fontSize: "0.85rem" }}>{copy("usage.weeklyAllowanceDescription")}</p>
                      </div>
                      <span>{formatResetTime(usage.weeklyResetAt)}</span>
                    </div>
                  )}
                </div>

              </div>
            )}

            {activeTab === "data" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
                  <div>
                    <h4 style={{ marginBottom: "0.25rem" }}>{copy("data.exportAll")}</h4>
                    <p className="text-secondary" style={{ fontSize: "0.875rem" }}>{copy("data.exportDescription")}</p>
                  </div>
                  <button type="button" className="btn" onClick={handleExportData} style={{ color: "#3b82f6", borderColor: "rgba(59, 130, 246, 0.3)" }}><Download size={18}/> {copy("data.exportJson")}</button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
                  <div>
                    <h4 style={{ marginBottom: "0.25rem" }}>{copy("data.clearHistory")}</h4>
                    <p className="text-secondary" style={{ fontSize: "0.875rem" }}>{copy("data.clearDescription")}</p>
                  </div>
                  <button type="button" className="btn" disabled={historyAction === "clearing"} onClick={() => void handleClearHistory()} style={{ color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.3)" }}><Trash2 size={18}/> {historyAction === "clearing" ? copy("data.clearing") : copy("data.clearHistory")}</button>
                </div>
                {historyAction === "cleared" && <p role="status" className="text-secondary">{copy("data.cleared")}</p>}
                {historyAction === "failed" && <p role="alert" className="text-secondary">{copy("data.clearFailed")}</p>}

                <div className="settings-danger-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem", background: "rgba(239, 68, 68, 0.05)", borderRadius: "var(--radius-lg)", border: "1px solid rgba(239, 68, 68, 0.3)", marginTop: "2rem" }}>
                  <div>
                    <h4 style={{ marginBottom: "0.25rem", color: "#ef4444" }}>{copy("data.deleteAccount")}</h4>
                    <p className="text-secondary" style={{ fontSize: "0.875rem" }}>{copy("data.deleteDescription")}</p>
                  </div>
                  <button type="button" className="btn" onClick={handleDeleteAccount} style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.5)", background: "rgba(239, 68, 68, 0.1)" }}><AlertTriangle size={18}/> {copy("data.delete")}</button>
                </div>
              </div>
            )}

            {activeTab === "legal" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                <div>
                  <label htmlFor="settings-jurisdiction" style={{ display: "block", marginBottom: "1rem", fontSize: "1rem", fontWeight: 700 }}>{copy("legal.primaryJurisdiction")}</label>
                  <select 
                    id="settings-jurisdiction"
                    className="apple-glass-input" 
                    value={settings.legal.jurisdiction}
                    onChange={e => saveSettings({...settings, legal: {...settings.legal, jurisdiction: e.target.value}})}
                    style={{ maxWidth: "400px", appearance: "none" }}
                  >
                    {JURISDICTIONS.map(j => <option key={j} value={j} style={{ background: "var(--bg-secondary)" }}>{copy(settingJurisdictionKeys[j as keyof typeof settingJurisdictionKeys])}</option>)}
                  </select>
                </div>

                <div>
                  <h3 style={{ marginBottom: "1.5rem", fontSize: "1rem" }}>{copy("legal.preferredAreas")}</h3>
                  <div className="settings-law-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    {LAW_AREAS.map(area => {
                      const isSelected = settings.legal.lawAreas.includes(area);
                      return (
                        <button
                          key={area} type="button"
                          onClick={() => {
                            const newAreas = isSelected 
                              ? settings.legal.lawAreas.filter(a => a !== area)
                              : [...settings.legal.lawAreas, area];
                            saveSettings({...settings, legal: {...settings.legal, lawAreas: newAreas}});
                          }}
                          aria-pressed={isSelected}
                          style={{ 
                            display: "flex", alignItems: "center", gap: "1rem", padding: "1rem", cursor: "pointer", textAlign: "left",
                            background: isSelected ? "rgba(59, 130, 246, 0.1)" : "var(--surface-card)",
                            border: isSelected ? "1px solid rgba(59, 130, 246, 0.5)" : "1px solid var(--border-default)",
                            borderRadius: "var(--radius-md)"
                          }}
                        >
                          <div style={{ width: "20px", height: "20px", borderRadius: "4px", border: isSelected ? "none" : "1px solid var(--text-secondary)", background: isSelected ? "#3b82f6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {isSelected && <Check size={14} color="#fff" />}
                          </div>
                          <span style={{ color: isSelected ? "#3b82f6" : "var(--text-primary)" }}>{copy(settingLawAreaKeys[area as keyof typeof settingLawAreaKeys])}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <nav aria-label={copy("legal.policiesAria")} style={{ display: "flex", flexWrap: "wrap", gap: ".8rem", paddingTop: "1rem", borderTop: "1px solid var(--border-default)" }}>
                  <a href={publicLanguageHref("/privacy", language)}>{copy("legal.privacyNotice")}</a><a href={publicLanguageHref("/terms", language)}>{copy("legal.termsOfUse")}</a><a href={publicLanguageHref("/disclaimer", language)}>{copy("legal.disclaimer")}</a><a href={publicLanguageHref("/refunds", language)}>{copy("legal.refunds")}</a><a href={publicLanguageHref("/support", language)}>{copy("legal.support")}</a>
                </nav>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
