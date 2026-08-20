"use client";

import { Activity, Clipboard, Coins, Download, RefreshCw, Search, ShieldAlert, ShieldCheck, X, EyeOff, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import {
  deleteAdminCoupon,
  disableAdminCoupon,
  getAdminCoupons,
  getAdminCommercialPricing,
  getAdminProviderStatus,
  getAdminIncidents,
  getAdminUsers,
  getAdminConsentEvents,
  downloadAdminConsentExport,
  resetAdminUserUsage,
  saveAdminCoupon,
  safeInlineBackendMessage,
  setAdminUserBan,
  updateAdminUserTier,
  updateAdminIncidentStatus,
  hideAdminUser,
  restoreAdminUser,
  type BackendIncident,
  type BackendIncidentStatus,
  type AdminCommercialPricing,
  type SafeProviderStatus,
  type AdminConsentEvent,
  updateAdminCommercialPricing,
} from "@/lib/backendApi";
import { requestPlanStateRefresh } from "./PlanStateProvider";

type AdminUser = {
  email: string;
  displayName?: string;
  tier?: string;
  activePlan?: "free" | "plus" | "pro" | "max";
  includedUnitsRemaining?: number;
  purchasedUnitsRemaining?: number;
  isBanned?: boolean;
  banReason?: string | null;
  lastSeenAt?: string;
  loginCount?: number;
  isHidden?: boolean;
};
type Coupon = {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  active: boolean;
  redeemedCount?: number;
  expiresAt?: string | null;
  plans?: string[];
  billingCycles?: string[];
};

type Tab = "all" | "active" | "free" | "plus" | "pro" | "max" | "banned" | "hidden" | "incidents" | "providers" | "consents" | "pricing" | "coupons";

export function buildSanitizedCodexPrompt(incident: BackendIncident, projectReference: string) {
  const componentMap: Record<string, string> = {
    chat: "LegalAiWorkspace.tsx, AnalysisPage.tsx, ai.routes.ts",
    payment: "ProductPricingModal.tsx, payments.routes.ts",
    document: "CaseWorkspace.tsx, documents.routes.ts",
    case: "CaseWorkspace.tsx, supabaseCases.routes.ts",
    profile: "AuthModal.tsx, SettingsModal.tsx, profile.routes.ts",
    auth: "AuthModal.tsx, profile.routes.ts",
    web: "LegalAiWorkspace.tsx, ai.routes.ts",
    rag: "LegalAiWorkspace.tsx, rag service",
    incidents: "AppErrorProvider.tsx, incidents.routes.ts",
  };
  const safeProjectReference = projectReference.replace(/[\r\n]/g, " ").slice(0, 240);
  return [
    "LEGAL SAATHI SANITIZED INCIDENT REVIEW ONLY",
    `Authorized project: ${safeProjectReference}`,
    "Do not inspect .env files, user prompts, documents, audio, cookies, tokens, payment data, or backups.",
    `Incident: ${incident.id}`,
    `Deployment: ${incident.deploymentVersion}`,
    `Feature: ${incident.feature}`,
    `Safe error: ${incident.errorCode}`,
    `Request reference: ${incident.requestId}`,
    `Related component names: ${componentMap[incident.feature] ?? "AppErrorProvider.tsx, backend route for the affected feature"}`,
    `Lifecycle: first ${incident.firstSeenAt}; last ${incident.lastSeenAt}; reports ${incident.reportCount}; retry ${incident.retryResult}`,
    `Safe reproduction: ${incident.attemptedAction}; frequency ${incident.reproducibility}.`,
    "Expected: the requested action completes or returns one safe, recoverable error without losing user input.",
    `Actual: sanitized ${incident.errorCode} response (HTTP ${incident.httpStatus}).`,
    "Reproduce only with synthetic data. Inspect current disk state first, make a reviewable local fix, run targeted tests, and do not deploy.",
  ].join("\n");
}

export default function AdminDashboard({ onClose, currentUserEmail }: { onClose: () => void; currentUserEmail?: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [providers, setProviders] = useState<SafeProviderStatus[]>([]);
  const [incidents, setIncidents] = useState<BackendIncident[]>([]);
  const [copiedIncidentId, setCopiedIncidentId] = useState("");
  const [projectReference, setProjectReference] = useState("current Legal Saathi project root");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState("10");
  const [couponPlan, setCouponPlan] = useState("all");
  const [couponBillingCycle, setCouponBillingCycle] = useState("all");
  const [pricing, setPricing] = useState<AdminCommercialPricing | null>(null);
  const [consentEmail, setConsentEmail] = useState("");
  const [consentEvents, setConsentEvents] = useState<AdminConsentEvent[]>([]);
  const [consentLoading, setConsentLoading] = useState(false);
  const [pricingDraft, setPricingDraft] = useState({
    plusMonthly: "499",
    plusYearly: "5090",
    proMonthly: "999",
    proYearly: "10190",
    maxMonthly: "10000",
    maxYearly: "102000",
    advocateOneTime: "3999",
  });
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    document.body.style.overflow = "auto";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [userResult, couponResult, providerResult, incidentResult, pricingResult] = await Promise.all([
        getAdminUsers(),
        getAdminCoupons().catch(() => ({ coupons: [] })),
        getAdminProviderStatus().catch(() => ({ providers: [] })),
        getAdminIncidents().catch(() => ({ incidents: [], projectReference: "current Legal Saathi project root" })),
        getAdminCommercialPricing(),
      ]);
      setUsers(userResult.users as AdminUser[]);
      setCoupons(couponResult.coupons as Coupon[]);
      setProviders(providerResult.providers as SafeProviderStatus[]);
      setIncidents(incidentResult.incidents as BackendIncident[]);
      setPricing(pricingResult.pricing);
      setPricingDraft({
        plusMonthly: String(pricingResult.pricing.plans.plus.monthly / 100),
        plusYearly: String(pricingResult.pricing.plans.plus.yearly / 100),
        proMonthly: String(pricingResult.pricing.plans.pro.monthly / 100),
        proYearly: String(pricingResult.pricing.plans.pro.yearly / 100),
        maxMonthly: String(pricingResult.pricing.plans.max.monthly / 100),
        maxYearly: String(pricingResult.pricing.plans.max.yearly / 100),
        advocateOneTime: String(pricingResult.pricing.advocatePrep.oneTime / 100),
      });
      if (incidentResult.projectReference) setProjectReference(incidentResult.projectReference);
    } catch (loadError) {
      setError(safeInlineBackendMessage(loadError, "Admin data could not be loaded."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const changeTier = async (user: AdminUser, tier: string) => {
    setError("");
    try {
      const result = await updateAdminUserTier(user.email, tier);
      setUsers((current) => current.map((item) => item.email === user.email
        ? {
            ...item,
            tier: result.profile.tier,
            activePlan: result.planState.plan.id,
            includedUnitsRemaining: result.planState.balances.included.remaining,
            purchasedUnitsRemaining: result.planState.balances.purchased.remaining,
          }
        : item));
      if (currentUserEmail && currentUserEmail.toLowerCase() === user.email.toLowerCase()) {
        requestPlanStateRefresh();
      }
    } catch (actionError) {
      setError(safeInlineBackendMessage(actionError, "Plan could not be changed."));
    }
  };

  const act = async (action: () => Promise<unknown>) => {
    try { await action(); await load(); } catch (actionError) { setError(safeInlineBackendMessage(actionError, "Admin action failed.")); }
  };

  const savePricing = async () => {
    const toPaise = (value: string) => Math.round(Number(value) * 100);
    const amounts = {
      plusMonthly: toPaise(pricingDraft.plusMonthly),
      plusYearly: toPaise(pricingDraft.plusYearly),
      proMonthly: toPaise(pricingDraft.proMonthly),
      proYearly: toPaise(pricingDraft.proYearly),
      maxMonthly: toPaise(pricingDraft.maxMonthly),
      maxYearly: toPaise(pricingDraft.maxYearly),
      advocateOneTime: toPaise(pricingDraft.advocateOneTime),
    };
    if (Object.values(amounts).some((amount) => !Number.isFinite(amount) || amount < 100)) {
      setError("Enter valid prices of at least INR 1.");
      return;
    }
    setError("");
    try {
      const result = await updateAdminCommercialPricing({
        plans: {
          plus: { monthly: amounts.plusMonthly, yearly: amounts.plusYearly },
          pro: { monthly: amounts.proMonthly, yearly: amounts.proYearly },
          max: { monthly: amounts.maxMonthly, yearly: amounts.maxYearly },
        },
        advocatePrep: { oneTime: amounts.advocateOneTime },
      });
      setPricing(result.pricing);
      requestPlanStateRefresh();
    } catch (pricingError) {
      setError(safeInlineBackendMessage(pricingError, "Plan prices could not be saved."));
    }
  };

  const searchConsentEvidence = async () => {
    const email = consentEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid user email.");
      return;
    }
    setConsentLoading(true);
    setError("");
    try {
      const result = await getAdminConsentEvents(email);
      setConsentEvents(result.events);
    } catch (consentError) {
      setConsentEvents([]);
      setError(safeInlineBackendMessage(consentError, "Consent evidence could not be loaded."));
    } finally {
      setConsentLoading(false);
    }
  };

  const exportConsentEvidence = async () => {
    const email = consentEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid user email.");
      return;
    }
    setError("");
    try {
      const blob = await downloadAdminConsentExport(email);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `legal-saathi-consent-${email.replace(/[^a-z0-9]/gi, "_")}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (consentError) {
      setError(safeInlineBackendMessage(consentError, "Consent evidence could not be exported."));
    }
  };

  const copyCodexPrompt = async (incident: BackendIncident) => {
    setError("");
    try {
      await navigator.clipboard.writeText(buildSanitizedCodexPrompt(incident, projectReference));
      setCopiedIncidentId(incident.id);
    } catch {
      setError("The sanitized Codex prompt could not be copied. Browser clipboard permission may be unavailable.");
    }
  };

  const isRecentlyActive = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    return (now.getTime() - date.getTime()) < 7 * 24 * 60 * 60 * 1000;
  };

  const getFilteredUsers = () => {
    let filtered = users;
    
    if (activeTab === "active") filtered = filtered.filter(u => !u.isHidden && isRecentlyActive(u.lastSeenAt));
    else if (activeTab === "free") filtered = filtered.filter(u => !u.isHidden && u.tier === "free");
    else if (activeTab === "plus") filtered = filtered.filter(u => !u.isHidden && u.tier === "plus");
    else if (activeTab === "pro") filtered = filtered.filter(u => !u.isHidden && u.tier === "pro");
    else if (activeTab === "max") filtered = filtered.filter(u => !u.isHidden && (u.tier === "max" || u.tier === "advocate"));
    else if (activeTab === "banned") filtered = filtered.filter(u => !u.isHidden && u.isBanned);
    else if (activeTab === "hidden") filtered = filtered.filter(u => u.isHidden);
    else filtered = filtered.filter(u => !u.isHidden);

    if (search.trim()) {
      const s = search.toLowerCase();
      filtered = filtered.filter(u => `${u.displayName || ""} ${u.email}`.toLowerCase().includes(s));
    }
    return filtered;
  };

  const filteredUsers = getFilteredUsers();
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "all", label: "All Users", count: users.filter(u => !u.isHidden).length },
    { id: "active", label: "Recently Active", count: users.filter(u => !u.isHidden && isRecentlyActive(u.lastSeenAt)).length },
    { id: "free", label: "Free", count: users.filter(u => !u.isHidden && u.tier === "free").length },
    { id: "plus", label: "Plus", count: users.filter(u => !u.isHidden && u.tier === "plus").length },
    { id: "pro", label: "Pro", count: users.filter(u => !u.isHidden && u.tier === "pro").length },
    { id: "max", label: "Max", count: users.filter(u => !u.isHidden && (u.tier === "max" || u.tier === "advocate")).length },
    { id: "banned", label: "Banned", count: users.filter(u => !u.isHidden && u.isBanned).length },
    { id: "hidden", label: "Hidden", count: users.filter(u => u.isHidden).length },
    { id: "incidents", label: "Incidents", count: incidents.length },
    { id: "providers", label: "Providers" },
    { id: "consents", label: "Consent evidence" },
    { id: "pricing", label: "Plan Prices" },
    { id: "coupons", label: "Coupons" },
  ];

  const handleTabChange = (tabId: Tab) => {
    setActiveTab(tabId);
    setCurrentPage(1);
  };

  return (
    <main className="admin-dashboard fade-in" style={{ minHeight: "100dvh", overflowY: "auto", paddingBottom: "2rem" }}>
      <header className="admin-header" style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(10px)", padding: "1rem" }}>
        <div><span className="case-hub-kicker">Owner controls</span><h1>Admin Control Center</h1><p>Backend-enforced administration. Data is safely stored and validated by the backend.</p></div>
        <button className="btn" onClick={onClose}><X size={17} /> Exit Admin</button>
      </header>

      {error && <div className="legal-ai-error" style={{ margin: "1rem" }} role="alert">{error}</div>}

      <nav className="admin-tabs" style={{ display: "flex", gap: "0.5rem", overflowX: "auto", padding: "0 1rem 1rem", borderBottom: "1px solid #eee" }}>
        {tabs.map(tab => (
          <button 
            key={tab.id} 
            className={`btn ${activeTab === tab.id ? "btn-primary" : ""}`}
            style={{ whiteSpace: "nowrap" }}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label} {tab.count !== undefined && `(${tab.count})`}
          </button>
        ))}
        <button className="btn" style={{ marginLeft: "auto" }} onClick={() => void load()}><RefreshCw size={15} /> Refresh Data</button>
      </nav>

      <div style={{ padding: "1rem" }}>
        {["all", "active", "free", "plus", "pro", "max", "banned", "hidden"].includes(activeTab) && (
          <section className="apple-glass-card admin-users-card">
            <div className="admin-card-heading">
              <div>
                <h2>{tabs.find(t => t.id === activeTab)?.label}</h2>
                <p>Manage user access and tiers. Showing {filteredUsers.length} result(s).</p>
              </div>
            </div>
            <input 
              className="apple-glass-input" 
              style={{ marginBottom: "1rem", width: "100%", maxWidth: "400px" }}
              value={search} 
              onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} 
              placeholder="Search by email or name" 
            />
            
            <div className="admin-user-list">
              {loading ? <p className="text-secondary">Loading users...</p> : paginatedUsers.length === 0 ? <p className="text-secondary">No users found.</p> : paginatedUsers.map((user) => (
                <div className="admin-user-row" key={user.email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", borderBottom: "1px solid #eee" }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: "block" }}>{user.displayName || user.email} {user.isHidden && <span style={{ color: "#999", fontSize: "0.8em" }}>(Hidden)</span>}</strong>
                    <span style={{ display: "block", color: "#666", fontSize: "0.9em" }}>{user.email}</span>
                    <small style={{ color: "#888" }}>
                      {user.isBanned ? `Restricted${user.banReason ? `: ${user.banReason}` : ""}` : `Last seen ${user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : "-"}`} · {user.loginCount || 0} logins · {(user.includedUnitsRemaining ?? 0).toLocaleString("en-IN")} included · {(user.purchasedUnitsRemaining ?? 0).toLocaleString("en-IN")} top-up
                    </small>
                  </div>
                  <div className="admin-user-actions" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <select 
                      className="apple-glass-input"
                      style={{ padding: "0.3rem" }}
                      value={user.activePlan || (user.tier === "advocate" ? "max" : user.tier) || "free"} 
                      onChange={(event) => void changeTier(user, event.target.value)} 
                      aria-label={`Set tier for ${user.email}`}
                    >
                      <option value="free">Free</option>
                      <option value="plus">Plus</option>
                      <option value="pro">Pro</option>
                      <option value="max">Max</option>
                    </select>
                    <button className="btn" onClick={() => void act(() => resetAdminUserUsage(user.email))}>Reset usage</button>
                    <button className="btn" onClick={() => void act(() => setAdminUserBan(user.email, !user.isBanned, user.isBanned ? undefined : "Restricted by admin"))}>{user.isBanned ? "Unban" : "Ban"}</button>
                    {user.isHidden ? (
                      <button className="btn" onClick={() => void act(() => restoreAdminUser(user.email))} title="Restore to admin list"><Eye size={15} /> Restore</button>
                    ) : (
                      <button className="btn" onClick={() => void act(() => hideAdminUser(user.email))} title="Hide from admin list"><EyeOff size={15} /> Hide</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginTop: "1rem", alignItems: "center" }}>
                <button className="btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Previous</button>
                <span>Page {currentPage} of {totalPages}</span>
                <button className="btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
              </div>
            )}
          </section>
        )}

        {activeTab === "incidents" && (
          <section className="apple-glass-card admin-incidents-card">
            <div className="admin-card-heading">
              <div><h2>Incident Center</h2><p>Sanitized diagnostics only. User data and stack traces are excluded.</p></div>
              <ShieldAlert size={18} aria-hidden="true" />
            </div>
            <div className="admin-incident-list">
              {incidents.length === 0 ? <p className="text-secondary">No incidents reported.</p> : incidents.map((incident) => (
                <article className="admin-incident-row" key={incident.id} style={{ padding: "0.75rem", borderBottom: "1px solid #eee" }}>
                  <div>
                    <strong>{incident.feature} · {incident.errorCode}</strong>
                    <span style={{ display: "block" }}>{incident.id} · HTTP {incident.httpStatus} · {incident.deploymentVersion}</span>
                    <small style={{ display: "block" }}>Request {incident.requestId} · {incident.reportCount} report(s)</small>
                    <small style={{ display: "block" }}>First {new Date(incident.firstSeenAt).toLocaleString()} · last {new Date(incident.lastSeenAt).toLocaleString()}</small>
                    <small style={{ display: "block" }}>Plan {incident.planClass} · model {incident.modelClass} · Web {incident.webEnabled ? "on" : "off"} · RAG {incident.ragEnabled ? "on" : "off"} · retry {incident.retryResult}</small>
                    <small style={{ display: "block" }}>Action {incident.attemptedAction} · reproducibility {incident.reproducibility}</small>
                  </div>
                  <div className="admin-user-actions" style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                    <select className="apple-glass-input" value={incident.status} onChange={(event) => void act(() => updateAdminIncidentStatus(incident.id, event.target.value as BackendIncidentStatus))} aria-label={`Set status for ${incident.id}`}>
                      <option value="new">New</option>
                      <option value="investigating">Investigating</option>
                      <option value="resolved">Resolved</option>
                      <option value="ignored">Ignored</option>
                      <option value="needs_codex_review">Needs Codex review</option>
                    </select>
                    <button className="btn" type="button" onClick={() => void copyCodexPrompt(incident)} disabled={incident.status !== "needs_codex_review"}>
                      <Clipboard size={14} /> {copiedIncidentId === incident.id ? "Copied" : "Copy Codex Fix Prompt"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "providers" && (
          <section className="apple-glass-card admin-provider-card">
            <div className="admin-card-heading">
              <div><h2>AI Provider Status</h2><p>Sanitized availability only. Credentials are never shown.</p></div>
              <Activity size={18} aria-hidden="true" />
            </div>
            <div className="admin-provider-grid">
              {providers.length === 0 && <p className="text-secondary">No providers configured.</p>}
              {providers.map((provider) => (
                <div className="admin-provider-row" key={provider.provider} style={{ padding: "0.75rem", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <strong style={{ display: "block" }}>{provider.provider === "openrouter" ? "OpenRouter" : "Mesh"}{provider.primary ? " (primary)" : ""}</strong>
                    <span style={{ fontSize: "0.9em", color: "#666" }}>{provider.configured ? "Configured" : "Configuration required"} · {provider.approved ? "Approved" : "Not approved"}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ display: "block" }}>{provider.availability === "payment_required" ? "Provider balance required" : provider.availability === "available" ? "Available" : provider.availability === "unavailable" ? "Unavailable" : "Not checked yet"}</strong>
                    <span style={{ fontSize: "0.9em", color: "#666" }}>{provider.reachable === null ? "Reachability unknown" : provider.reachable ? "Reachable" : "Not reachable"}{provider.lastSafeCheckAt ? ` · checked ${new Date(provider.lastSafeCheckAt).toLocaleString()}` : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "consents" && (
          <section className="apple-glass-card admin-consent-card">
            <div className="admin-card-heading">
              <div>
                <h2>Consent evidence</h2>
                <p>Search immutable acceptance evidence by the user&apos;s normalized email.</p>
              </div>
              <ShieldCheck size={18} aria-hidden="true" />
            </div>
            <form
              className="admin-consent-search"
              onSubmit={(event) => {
                event.preventDefault();
                void searchConsentEvidence();
              }}
            >
              <label>
                <span>User email</span>
                <input
                  className="apple-glass-input"
                  type="email"
                  value={consentEmail}
                  onChange={(event) => setConsentEmail(event.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
              <button className="btn btn-primary" type="submit" disabled={consentLoading}>
                <Search size={16} aria-hidden="true" /> {consentLoading ? "Searching..." : "Search"}
              </button>
              <button className="btn" type="button" onClick={() => void exportConsentEvidence()} disabled={consentEvents.length === 0}>
                <Download size={16} aria-hidden="true" /> Export CSV
              </button>
            </form>
            <div className="admin-consent-results" aria-live="polite">
              {!consentLoading && consentEvents.length === 0 && <p className="text-secondary">No evidence loaded.</p>}
              {consentEvents.map((event) => (
                <article className="admin-consent-event" key={event.id}>
                  <div>
                    <strong>{new Date(event.acceptedAt).toLocaleString()}</strong>
                    <span>{event.authenticationMethod} · {event.locale}</span>
                  </div>
                  <dl>
                    <div><dt>Terms</dt><dd>{event.termsVersion}</dd></div>
                    <div><dt>Privacy</dt><dd>{event.privacyVersion}</dd></div>
                    <div><dt>Consent</dt><dd>{event.consentVersion}</dd></div>
                    <div><dt>Request</dt><dd>{event.requestId}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "pricing" && (
          <section className="apple-glass-card admin-pricing-card">
            <div className="admin-card-heading">
              <div>
                <h2>Plan Price Manager</h2>
                <p>Amounts are stored in INR and enforced by the backend when creating payment orders.</p>
              </div>
              <Coins size={18} aria-hidden="true" />
            </div>
            <form className="admin-pricing-form" onSubmit={(event) => { event.preventDefault(); void savePricing(); }}>
              <label><span>Plus monthly</span><input className="apple-glass-input" type="number" min="1" step="0.01" value={pricingDraft.plusMonthly} onChange={(event) => setPricingDraft({ ...pricingDraft, plusMonthly: event.target.value })} /></label>
              <label><span>Plus annual</span><input className="apple-glass-input" type="number" min="1" step="0.01" value={pricingDraft.plusYearly} onChange={(event) => setPricingDraft({ ...pricingDraft, plusYearly: event.target.value })} /></label>
              <label><span>Pro monthly</span><input className="apple-glass-input" type="number" min="1" step="0.01" value={pricingDraft.proMonthly} onChange={(event) => setPricingDraft({ ...pricingDraft, proMonthly: event.target.value })} /></label>
              <label><span>Pro annual</span><input className="apple-glass-input" type="number" min="1" step="0.01" value={pricingDraft.proYearly} onChange={(event) => setPricingDraft({ ...pricingDraft, proYearly: event.target.value })} /></label>
              <label><span>Max monthly</span><input className="apple-glass-input" type="number" min="1" step="0.01" value={pricingDraft.maxMonthly} onChange={(event) => setPricingDraft({ ...pricingDraft, maxMonthly: event.target.value })} /></label>
              <label><span>Max annual</span><input className="apple-glass-input" type="number" min="1" step="0.01" value={pricingDraft.maxYearly} onChange={(event) => setPricingDraft({ ...pricingDraft, maxYearly: event.target.value })} /></label>
              <label><span>Advocate Prep one-time</span><input className="apple-glass-input" type="number" min="1" step="0.01" value={pricingDraft.advocateOneTime} onChange={(event) => setPricingDraft({ ...pricingDraft, advocateOneTime: event.target.value })} /></label>
              <button className="btn btn-primary" type="submit">Save plan prices</button>
            </form>
            <p className="text-secondary">Free remains ₹0. Paid-plan checkout amounts are verified by the backend.{pricing?.updatedAt ? ` Last saved ${new Date(pricing.updatedAt).toLocaleString()}.` : ""}</p>
          </section>
        )}

        {activeTab === "coupons" && (
          <section className="apple-glass-card admin-coupons-card">
            <div className="admin-card-heading"><div><h2>Coupon Manager</h2><p>Validated by the backend before an order is created.</p></div></div>
            <form className="admin-coupon-form" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }} onSubmit={(event) => { event.preventDefault(); void act(async () => { await saveAdminCoupon({ code: couponCode, discountType: "percent", discountValue: Number(couponDiscount), plans: couponPlan === "all" ? ["all"] : [couponPlan], billingCycles: couponBillingCycle === "all" ? ["all"] : [couponBillingCycle], active: true }); setCouponCode(""); }); }}>
              <input className="apple-glass-input" value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Coupon code" required />
              <input className="apple-glass-input" type="number" min="1" max="90" value={couponDiscount} onChange={(event) => setCouponDiscount(event.target.value)} aria-label="Discount percent" required />
              <select className="apple-glass-input" value={couponPlan} onChange={(event) => setCouponPlan(event.target.value)}><option value="all">All paid plans</option><option value="plus">Plus</option><option value="pro">Pro</option><option value="advocate">Advocate</option></select>
              <select className="apple-glass-input" value={couponBillingCycle} onChange={(event) => setCouponBillingCycle(event.target.value)} aria-label="Coupon billing cycle"><option value="all">All billing cycles</option><option value="monthly">Monthly only</option><option value="yearly">Annual only</option><option value="one_time">One-time only</option></select>
              <button className="btn btn-primary" type="submit">Create coupon</button>
            </form>
            <div className="admin-coupon-list">
              {coupons.length === 0 ? <p className="text-secondary">No coupons yet.</p> : coupons.map((coupon) => (
                <div className="admin-coupon-row" key={coupon.code} style={{ padding: "0.75rem", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ display: "block" }}>{coupon.code}</strong>
                    <small style={{ display: "block", color: "#666" }}>{(coupon.plans || ["all"]).join(", ")} / {(coupon.billingCycles || ["all"]).map((cycle) => cycle === "yearly" ? "annual" : cycle).join(", ")}</small>
                    <span style={{ fontSize: "0.9em", color: "#666" }}>{coupon.discountValue}{coupon.discountType === "percent" ? "% off" : " paise off"} · {coupon.redeemedCount || 0} uses</span>
                  </div>
                  <div className="admin-user-actions" style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="btn" onClick={() => void act(() => disableAdminCoupon(coupon.code))} disabled={!coupon.active}>{coupon.active ? "Disable" : "Disabled"}</button>
                    <button className="btn" onClick={() => void act(() => deleteAdminCoupon(coupon.code))}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
