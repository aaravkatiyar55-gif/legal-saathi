"use client";
import { useState, useEffect } from "react";
import { User, Palette, Bell, Shield, CreditCard, Database, Scale, Gauge, X, Check, Download, Trash2, AlertTriangle } from "lucide-react";
import { UserProfile, AppSettings, UsageData } from "@/lib/types";
import { formatDailyResetTime, formatResetTime, getPlanLabel } from "@/lib/requestSettings";
import type { AppLanguage } from "@/lib/i18n";
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

const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: (c: boolean) => void }) => (
  <div
    onClick={() => onChange(!checked)}
    style={{
      width: "44px", height: "24px", borderRadius: "12px",
      background: checked ? "#3b82f6" : "rgba(255,255,255,0.15)",
      position: "relative", cursor: "pointer",
      transition: "background 0.2s"
    }}
  >
    <div style={{
      width: "18px", height: "18px", borderRadius: "50%", background: "#fff",
      position: "absolute", top: "3px", left: checked ? "23px" : "3px",
      transition: "left 0.2s", boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
    }} />
  </div>
);

export default function SettingsModal({ isOpen, onClose, onClearHistory, initialTab = "profile", onOpenPlans, onReviewConsent, authUser = null, language = "en" }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [showSaved, setShowSaved] = useState(false);
  const [historyAction, setHistoryAction] = useState<"idle" | "clearing" | "cleared" | "failed">("idle");
  const { catalog, planState, usage: backendUsage } = usePlanState();
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
    if (!window.confirm("Clear all saved chat history? Case folders and their documents will be kept.")) return;
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
      : "Loading...";
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
      ? "Not configured on this environment"
      : allowedModels.has(model.id)
        ? "Available"
        : model.id === "ultra"
          ? "Requires Max plan"
          : "Requires a higher plan",
  }));

  if (!isOpen) return null;

  const tabs = [
    { id: "profile", icon: User, label: "Profile & Account" },
    { id: "appearance", icon: Palette, label: "Appearance" },
    { id: "notifications", icon: Bell, label: "Notifications" },
    { id: "security", icon: Shield, label: "Privacy & Security" },
    { id: "billing", icon: CreditCard, label: "Subscription & Billing" },
    { id: "usage", icon: Gauge, label: "Usage" },
    { id: "data", icon: Database, label: "Data Management" },
    { id: "legal", icon: Scale, label: "Legal Preferences" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-content settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" onClick={e => e.stopPropagation()} style={{ width: "900px", height: "640px", padding: 0, display: "flex", overflow: "hidden" }}>

        {/* Left Nav */}
        <div className="settings-modal-nav" style={{ width: "220px", background: "var(--bg-tertiary)", borderRight: "1px solid var(--border-default)", display: "flex", flexDirection: "column" }}>
          <div className="settings-modal-title" style={{ padding: "1.5rem 1rem", borderBottom: "1px solid var(--border-default)" }}>
            <h3 id="settings-modal-title" style={{ fontSize: "1.25rem", margin: 0 }}>Settings</h3>
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
              {showSaved && <span className="fade-in" style={{ color: "#10b981", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "4px" }}><Check size={16}/> Saved</span>}
              <button className="btn" type="button" aria-label="Close settings" onClick={onClose} style={{ padding: "0.5rem", borderRadius: "var(--radius-full)" }}><X size={20}/></button>
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
                        className="settings-color-swatch"
                        type="button"
                        key={color}
                        onClick={() => saveProfile({...profile, avatarColor: color})}
                        aria-label={`Use ${color} for your profile avatar`}
                        aria-pressed={profile.avatarColor === color}
                        style={{ width: "32px", height: "32px", borderRadius: "50%", background: color, border: profile.avatarColor === color ? "2px solid #fff" : "none" }}
                      >
                        {profile.avatarColor === color && <Check size={16} color="#fff" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
                  <div><label className="text-secondary" htmlFor="settings-display-name" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Display Name</label><input id="settings-display-name" className="apple-glass-input" value={profile.displayName} onChange={e => saveProfile({...profile, displayName: e.target.value})} /></div>
                  <div><label className="text-secondary" htmlFor="settings-nickname" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Nickname</label><input id="settings-nickname" className="apple-glass-input" value={profile.nickname} onChange={e => saveProfile({...profile, nickname: e.target.value})} /></div>
                  <div><label className="text-secondary" htmlFor="settings-email" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>Email</label><input id="settings-email" className="apple-glass-input" type="email" value={profile.email} onChange={e => saveProfile({...profile, email: e.target.value})} /></div>
                </div>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                <div>
                  <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>Theme</h3>
                  <div style={{ display: "flex", gap: "1rem" }}>
                    <button className="settings-theme-choice" type="button" aria-pressed={settings.theme === "dark"} onClick={() => saveSettings({...settings, theme: "dark"})} style={{ flex: 1, padding: "1.5rem", borderRadius: "var(--radius-lg)", border: settings.theme === "dark" ? "2px solid #3b82f6" : "1px solid var(--border-default)", background: "#0a0a0a" }}>
                      Dark 🌙
                    </button>
                    <button className="settings-theme-choice" type="button" aria-pressed={settings.theme === "light"} onClick={() => saveSettings({...settings, theme: "light"})} style={{ flex: 1, padding: "1.5rem", borderRadius: "var(--radius-lg)", border: settings.theme === "light" ? "2px solid #3b82f6" : "1px solid var(--border-default)", background: "#f3f4f6", color: "#000" }}>
                      Light ☀️
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "1rem" }}>Font Size</h3>
                    <span className="text-secondary">{settings.fontSize}px</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <span className="text-secondary" style={{ fontSize: "12px" }}>Small</span>
                    <input type="range" min="12" max="20" value={settings.fontSize} onChange={e => saveSettings({...settings, fontSize: parseInt(e.target.value)})} aria-label="Font size" style={{ flex: 1 }} />
                    <span className="text-secondary" style={{ fontSize: "20px" }}>Large</span>
                  </div>
                </div>

                <div>
                  <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>Accent Color</h3>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    {ACCENT_COLORS.map(color => (
                      <button
                        className="settings-color-swatch"
                        type="button"
                        key={color}
                        onClick={() => saveSettings({...settings, accentColor: color})}
                        aria-label={`Use ${color} as the accent color`}
                        aria-pressed={settings.accentColor === color}
                        style={{ width: "40px", height: "40px", borderRadius: "8px", background: color, border: settings.accentColor === color ? "2px solid #fff" : "none", transform: settings.accentColor === color ? "scale(1.1)" : "none", transition: "transform 0.2s" }}
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
                {[
                  { key: "caseUpdates", title: "Case Updates", desc: "Get notified when a case status changes." },
                  { key: "analysisComplete", title: "Analysis Complete", desc: "Get notified when document AI analysis finishes." },
                  { key: "weeklyDigest", title: "Weekly Digest", desc: "Receive a weekly summary of your activities." },
                  { key: "securityAlerts", title: "Security Alerts", desc: "Important security and login notifications." }
                ].map(({ key, title, desc }) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "var(--surface-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}>
                    <div>
                      <h4 style={{ marginBottom: "0.25rem" }}>{title}</h4>
                      <p className="text-secondary" style={{ fontSize: "0.875rem" }}>{desc}</p>
                    </div>
                    <ToggleSwitch
                      checked={settings.notifications[key as keyof AppSettings["notifications"]]}
                      onChange={c => saveSettings({...settings, notifications: {...settings.notifications, [key]: c}})}
                    />
                  </div>
                ))}
              </div>
            )}

            {activeTab === "security" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                <div>
                  <h3 style={{ marginBottom: ".6rem", fontSize: "1rem" }}>Sign-in method</h3>
                  <p className="text-secondary" style={{ margin: 0, lineHeight: 1.6 }}>Your primary identity is verified by Supabase Auth through email/password or Google. Passwords and authenticator secrets are handled by Supabase and are never stored by this screen.</p>
                </div>
                  <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "2.5rem" }}>
                    {authUser ? (
              <SupabaseMfaSettings language={language} />
                  ) : (
                    <div role="status" style={{ padding: "1rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", color: "var(--text-secondary)", fontSize: ".9rem", lineHeight: 1.55 }}>
                      Sign in with a verified account to view or change authenticator security.
                    </div>
                    )}
                  </div>

                  {authUser && onReviewConsent && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "1rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
                      <div>
                        <h3 style={{ marginBottom: ".3rem", fontSize: "1rem" }}>Legal consent</h3>
                        <p className="text-secondary" style={{ margin: 0, fontSize: ".875rem" }}>Review the current Terms, Privacy Notice, and processing confirmations.</p>
                      </div>
                      <button className="btn" type="button" onClick={onReviewConsent}>Review consent</button>
                    </div>
                  )}

                <div>
                  <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>Active Sessions</h3>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", borderBottom: "1px solid var(--border-default)" }}>
                    <div>
                      <h4>This Device</h4>
                      <p className="text-secondary" style={{ fontSize: "0.875rem" }}>
                        {authUser
                          ? "Current signed-in browser session. Device and IP details are not collected by Legal Saathi."
                          : "No verified Legal Saathi session is active in this browser."}
                      </p>
                    </div>
                    <span style={{ background: authUser ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.1)", color: authUser ? "#10b981" : "var(--text-secondary)", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600 }}>
                      {authUser ? "Active" : "Signed out"}
                    </span>
                  </div>
                </div>

                <section aria-label="Privacy and provider disclosure" style={{ padding: "1.25rem", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
                  <h3 style={{ marginBottom: ".75rem", fontSize: "1rem" }}>Privacy Notice & Legal Information Disclaimer</h3>
                  <p className="text-secondary" style={{ lineHeight: 1.65, marginBottom: ".75rem" }}>
                    Legal Saathi provides general legal information and preparation help, not legal advice or representation. Google verifies sign-in; Razorpay processes checkout; Supabase may store account, case, usage, and payment records; approved AI providers process redacted prompts; and local OCR libraries may extract text from uploaded documents.
                  </p>
                  <p className="text-secondary" style={{ lineHeight: 1.65, marginBottom: ".75rem" }}>
                    Do not submit Aadhaar, PAN, banking credentials, passwords, full addresses, sealed records, confidential government material, or unnecessary private documents. Development document storage is owner-scoped, local-only, and marked for 30-day retention. Production storage, export, and deletion require an approved tenant-aware database and retention process.
                  </p>
                  <p className="text-secondary" style={{ lineHeight: 1.65, margin: 0 }}>
                    Laws and procedures change. Verify important information with official sources and consult a qualified advocate for criminal, urgent, court, arrest, bail, violence, or high-stakes matters.
                  </p>
                </section>
              </div>
            )}

            {activeTab === "billing" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.1), transparent)", padding: "2rem", borderRadius: "var(--radius-lg)", border: "1px solid rgba(59,130,246,0.3)" }}>
                  <h2 style={{ fontSize: "2.5rem", marginBottom: "0.5rem", background: "linear-gradient(to right, #fff, #a0a0a0)", WebkitBackgroundClip: "text", color: "transparent" }}>Current Plan: {planState?.plan.name ?? getPlanLabel(usage.plan)}</h2>
                  <p className="text-secondary" style={{ fontSize: "1.1rem", marginBottom: "2rem" }}>
                    {usage.plan === "free" ? "Fast and Flash are included. Pro and Ultra remain locked." : usage.plan === "plus" ? "Plus preparation limits are active. Upgrade to Pro for deeper tools." : usage.plan === "pro" ? "Pro reasoning is active. Advocate Prep remains available for case-specific support." : "Expanded model and preparation access is active."}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem" }}>
                    {usage.plan === "free" && <button className="btn" onClick={() => onOpenPlans?.()}>View Plans</button>}
                    {usage.plan === "free" && <button className="btn btn-primary" onClick={() => onOpenPlans?.()} style={{ background: "linear-gradient(90deg, #3b82f6, #8b5cf6)", border: "none" }}>Upgrade to Plus - {formatPlanPrice("plus")}</button>}
                    {(usage.plan === "free" || usage.plan === "plus") && <button className="btn btn-primary" onClick={() => onOpenPlans?.()} style={{ background: "linear-gradient(90deg, #3b82f6, #8b5cf6)", border: "none" }}>Upgrade to Pro - {formatPlanPrice("pro")}</button>}
                    {usage.plan === "plus" && <button className="btn" onClick={() => onOpenPlans?.()}>Manage Plan</button>}
                    {(usage.plan === "pro" || usage.plan === "max") && <button className="btn" onClick={() => onOpenPlans?.()}>Manage Billing</button>}
                    {(usage.plan === "pro" || usage.plan === "max") && <button className="btn" onClick={() => onOpenPlans?.()}>Explore Advocate Prep</button>}
                  </div>
                </div>

                <div>
                  <h3 style={{ marginBottom: "1.5rem", fontSize: "1.25rem" }}>Credits & Usage</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    <div style={{ padding: "1rem", background: "var(--surface-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.5rem" }}>
                        <span className="text-secondary">Included units remaining</span>
                        <span>{usage.creditsRemaining.toLocaleString("en-IN")} / {usage.creditsTotal.toLocaleString("en-IN")} ({includedPercentageRemaining.toFixed(2)}%)</span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "var(--bg-elevated)", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ width: `${includedPercentageRemaining}%`, height: "100%", background: "#3b82f6" }} />
                      </div>
                      <div className="text-secondary" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginTop: "0.7rem", fontSize: "0.8rem" }}>
                        <span>Next reset: {formatResetTime(usage.nextResetAt)}</span>
                        {usage.weeklyResetAt && <span>Weekly refresh: {formatResetTime(usage.weeklyResetAt)}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "1rem", background: "var(--surface-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)" }}>
                      <span className="text-secondary">Purchased top-up units</span>
                      <strong>{purchasedUnitsRemaining.toLocaleString("en-IN")}</strong>
                    </div>
                    {chatUsage && <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}><span className="text-secondary">Chat window</span><span>{chatUsage.remaining} / {chatUsage.limit} remaining</span></div>}
                    {caseUsage && <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}><span className="text-secondary">Case folder window</span><span>{caseUsage.remaining} / {caseUsage.limit} remaining</span></div>}
                  </div>
                </div>

                <div>
                  <h3 style={{ marginBottom: "1rem", fontSize: "1.05rem" }}>Model access</h3>
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
                      <p className="text-secondary" style={{ fontSize: "0.875rem", marginBottom: "0.25rem" }}>Included units remaining</p>
                      <h3 style={{ margin: 0, fontSize: "2rem" }}>{usage.creditsRemaining.toLocaleString("en-IN")} <span className="text-secondary" style={{ fontSize: "1rem", fontWeight: 400 }}>/ {usage.creditsTotal.toLocaleString("en-IN")}</span></h3>
                    </div>
                    <span style={{ padding: "0.35rem 0.6rem", borderRadius: "var(--radius-full)", color: "var(--text-primary)", background: "var(--bg-elevated)", fontSize: "0.8rem", fontWeight: 700 }}>
                      {includedPercentageRemaining.toFixed(2)}% left
                    </span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "var(--bg-elevated)", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${includedPercentageRemaining}%`, height: "100%", background: "#3b82f6" }} />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "1rem 1.5rem", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
                  <span className="text-secondary">Purchased top-up units</span>
                  <strong>{purchasedUnitsRemaining.toLocaleString("en-IN")}</strong>
                </div>

                <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--border-default)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "1rem 0", borderBottom: "1px solid var(--border-default)" }}>
                    <div>
                      <h4 style={{ marginBottom: "0.2rem" }}>Next credit reset</h4>
                      <p className="text-secondary" style={{ fontSize: "0.85rem" }}>Your main credit allowance refreshes then.</p>
                    </div>
                    <span>{formatResetTime(usage.nextResetAt)}</span>
                  </div>
                  {usage.dailyResetAt && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "1rem 0", borderBottom: "1px solid var(--border-default)" }}>
                      <div>
                        <h4 style={{ marginBottom: "0.2rem" }}>Daily limit refresh</h4>
                        <p className="text-secondary" style={{ fontSize: "0.85rem" }}>Your daily request allowance refreshes then.</p>
                      </div>
                      <span>{formatDailyResetTime(usage.dailyResetAt)}</span>
                    </div>
                  )}
                  {usage.weeklyResetAt && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "1rem 0", borderBottom: "1px solid var(--border-default)" }}>
                      <div>
                        <h4 style={{ marginBottom: "0.2rem" }}>Weekly refresh</h4>
                        <p className="text-secondary" style={{ fontSize: "0.85rem" }}>Weekly allowances and included Auto access refresh then.</p>
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
                    <h4 style={{ marginBottom: "0.25rem" }}>Export All Data</h4>
                    <p className="text-secondary" style={{ fontSize: "0.875rem" }}>Open the verified owner-scoped export flow.</p>
                  </div>
                  <button className="btn" onClick={handleExportData} style={{ color: "#3b82f6", borderColor: "rgba(59, 130, 246, 0.3)" }}><Download size={18}/> Export JSON</button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}>
                  <div>
                    <h4 style={{ marginBottom: "0.25rem" }}>Clear Chat History</h4>
                    <p className="text-secondary" style={{ fontSize: "0.875rem" }}>Remove all saved AI conversations from your account. Case folders and documents are kept.</p>
                  </div>
                  <button className="btn" disabled={historyAction === "clearing"} onClick={() => void handleClearHistory()} style={{ color: "#f59e0b", borderColor: "rgba(245, 158, 11, 0.3)" }}><Trash2 size={18}/> {historyAction === "clearing" ? "Clearing..." : "Clear History"}</button>
                </div>
                {historyAction === "cleared" && <p role="status" className="text-secondary">Chat history cleared.</p>}
                {historyAction === "failed" && <p role="alert" className="text-secondary">Chat history could not be cleared. Your existing conversations were preserved.</p>}

                <div className="settings-danger-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem", background: "rgba(239, 68, 68, 0.05)", borderRadius: "var(--radius-lg)", border: "1px solid rgba(239, 68, 68, 0.3)", marginTop: "2rem" }}>
                  <div>
                    <h4 style={{ marginBottom: "0.25rem", color: "#ef4444" }}>Delete Account</h4>
                    <p className="text-secondary" style={{ fontSize: "0.875rem" }}>Create a verified deletion or anonymization review request.</p>
                  </div>
                  <button className="btn" onClick={handleDeleteAccount} style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.5)", background: "rgba(239, 68, 68, 0.1)" }}><AlertTriangle size={18}/> Delete</button>
                </div>
              </div>
            )}

            {activeTab === "legal" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
                <div>
                  <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>Primary Jurisdiction</h3>
                  <select
                    className="apple-glass-input"
                    value={settings.legal.jurisdiction}
                    onChange={e => saveSettings({...settings, legal: {...settings.legal, jurisdiction: e.target.value}})}
                    style={{ maxWidth: "400px", appearance: "none" }}
                  >
                    {JURISDICTIONS.map(j => <option key={j} value={j} style={{ background: "var(--bg-secondary)" }}>{j}</option>)}
                  </select>
                </div>

                <div>
                  <h3 style={{ marginBottom: "1.5rem", fontSize: "1rem" }}>Preferred Law Areas</h3>
                  <div className="settings-law-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    {LAW_AREAS.map(area => {
                      const isSelected = settings.legal.lawAreas.includes(area);
                      return (
                        <div
                          key={area}
                          onClick={() => {
                            const newAreas = isSelected
                              ? settings.legal.lawAreas.filter(a => a !== area)
                              : [...settings.legal.lawAreas, area];
                            saveSettings({...settings, legal: {...settings.legal, lawAreas: newAreas}});
                          }}
                          style={{
                            display: "flex", alignItems: "center", gap: "1rem", padding: "1rem", cursor: "pointer",
                            background: isSelected ? "rgba(59, 130, 246, 0.1)" : "var(--surface-card)",
                            border: isSelected ? "1px solid rgba(59, 130, 246, 0.5)" : "1px solid var(--border-default)",
                            borderRadius: "var(--radius-md)"
                          }}
                        >
                          <div style={{ width: "20px", height: "20px", borderRadius: "4px", border: isSelected ? "none" : "1px solid var(--text-secondary)", background: isSelected ? "#3b82f6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {isSelected && <Check size={14} color="#fff" />}
                          </div>
                          <span style={{ color: isSelected ? "#3b82f6" : "var(--text-primary)" }}>{area}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <nav aria-label="Legal Saathi policies" style={{ display: "flex", flexWrap: "wrap", gap: ".8rem", paddingTop: "1rem", borderTop: "1px solid var(--border-default)" }}>
                  <a href="/privacy">Privacy Notice</a><a href="/terms">Terms of Use</a><a href="/disclaimer">Disclaimer</a><a href="/refunds">Refunds</a><a href="/support">Support</a>
                </nav>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
