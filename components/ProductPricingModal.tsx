"use client";

import { CalendarDays, Check, Coins, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  createRazorpayPurchaseOrder,
  getBackendSession,
  previewCoupon,
  ProductCatalog,
  quoteCustomTopUp,
  safeInlineBackendMessage,
  verifyRazorpayOrder,
} from "@/lib/backendApi";
import { usePlanState } from "./PlanStateProvider";

type RazorpayResult = { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (name: string, handler: () => void) => void };
  }
}

let razorpayScriptPromise: Promise<boolean> | null = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;
  razorpayScriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener("error", () => {
        existing.remove();
        razorpayScriptPromise = null;
        resolve(false);
      }, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      script.remove();
      razorpayScriptPromise = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return razorpayScriptPromise;
}

function formatInr(paise: number | null) {
  if (paise === null) return "Admin only";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

function planFeatures(plan: ProductCatalog["plans"][number], catalog: ProductCatalog) {
  const modelNames = plan.allowedModels.map((id) => catalog.models.find((model) => model.id === id)?.name ?? id).join(", ");
  return [
    `${plan.includedUnits.toLocaleString("en-IN")} included units / ${plan.cycleDays} days`,
    `${modelNames || "No configured model"} access`,
                  plan.allowsWeb
                    ? `${plan.usageWindows.webSearches.limit} manual Web searches / ${plan.usageWindows.webSearches.windowMs >= 28 * 24 * 60 * 60 * 1000 ? "30 days" : "7 days"} when configured`
                    : "Web search not included",
  ];
}

export default function ProductPricingModal({
  isOpen,
  mode = "plans",
  onClose,
  onRequireSignIn,
}: {
  isOpen: boolean;
  mode?: "plans" | "topup";
  onClose: () => void;
  onRequireSignIn: () => void;
}) {
  const { catalog, planState, loading, error, refresh } = usePlanState();
  const [couponByPlan, setCouponByPlan] = useState<Record<string, string>>({});
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [transactionReference, setTransactionReference] = useState("");
  const [customAmountInr, setCustomAmountInr] = useState("100");
  const [customQuote, setCustomQuote] = useState<{ amountInr: number; amount: number; units: number } | null>(null);
  const currentRank = useMemo(() => catalog?.plans.find((plan) => plan.id === planState?.plan.id)?.paid
    ? catalog.plans.findIndex((plan) => plan.id === planState?.plan.id)
    : 0, [catalog, planState]);

  useEffect(() => {
    if (!isOpen) return;
    setNotice("");
    setTransactionReference("");
    setBusy(null);
    setCustomQuote(null);
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const applyCoupon = async (planId: "plus" | "pro" | "max", selectedBillingCycle: "monthly" | "yearly") => {
    if (!getBackendSession()) { onRequireSignIn(); return; }
    const code = couponByPlan[planId]?.trim();
    if (!code) { setNotice("Enter a coupon code first."); return; }
    setBusy(`${planId}:coupon`);
    try {
      const quote = await previewCoupon(planId, selectedBillingCycle, code);
      setNotice(`${quote.coupon.code} applied. Backend quote: ${formatInr(quote.finalAmount)}.`);
    } catch (couponError) {
      setNotice(safeInlineBackendMessage(couponError, "Coupon could not be applied."));
    } finally {
      setBusy(null);
    }
  };

  const checkout = async (
    key: string,
    purchase:
      | { purchaseType: "plan"; planId: "plus" | "pro" | "max" | "advocate"; billingCycle: "monthly" | "yearly" | "one_time"; couponCode?: string }
      | { purchaseType: "topup"; packageId: string; customAmountInr?: number },
    description: string,
  ) => {
    if (!getBackendSession()) { onRequireSignIn(); return; }
    setBusy(key);
    setNotice("Creating a secure backend order...");
    setTransactionReference("");
    try {
      const order = await createRazorpayPurchaseOrder(purchase);
      if (order.localTestMode) {
        setNotice("Payment gateway setup is required. No plan or units were granted.");
        return;
      }
      if (!order.orderId || !order.keyId || !(await loadRazorpay()) || !window.Razorpay) {
        throw new Error("Razorpay Checkout could not be loaded. No plan or units were granted.");
      }
      setTransactionReference(order.orderId);
      setNotice("Checkout pending. Access changes only after backend verification.");
      const razorpay = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Legal Saathi",
        description,
        order_id: order.orderId,
        theme: { color: "#7c3aed" },
        modal: { ondismiss: () => { setNotice("Checkout cancelled. No plan or units were granted."); setBusy(null); } },
        handler: async (result: RazorpayResult) => {
          try {
            await verifyRazorpayOrder({
              razorpayOrderId: result.razorpay_order_id || "",
              razorpayPaymentId: result.razorpay_payment_id || "",
              razorpaySignature: result.razorpay_signature || "",
            });
            await refresh();
            setNotice("Payment verified by the backend. Your plan state is refreshed.");
          } catch (verifyError) {
            setNotice(safeInlineBackendMessage(verifyError, "Verification failed. No access was granted."));
          } finally {
            setBusy(null);
          }
        },
      });
      razorpay.on("payment.failed", () => { setNotice("Payment failed. No plan or units were granted."); setBusy(null); });
      razorpay.open();
    } catch (checkoutError) {
      setNotice(safeInlineBackendMessage(checkoutError, "Payment could not start."));
      setBusy(null);
    }
  };

  const previewCustomAmount = async () => {
    if (!getBackendSession()) { onRequireSignIn(); return; }
    const amountInr = Number(customAmountInr);
    setBusy("custom:quote");
    setCustomQuote(null);
    try {
      const quote = await quoteCustomTopUp(amountInr);
      setCustomQuote({ amountInr: quote.amountInr, amount: quote.amount, units: quote.units });
      setNotice(`${formatInr(quote.amount)} adds ${quote.units.toLocaleString("en-IN")} credits after verified payment.`);
    } catch (quoteError) {
      setNotice(safeInlineBackendMessage(quoteError, "That custom amount is not available."));
    } finally {
      setBusy(null);
    }
  };

  const advocate = catalog?.advocatePrep;
  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }} onMouseDown={onClose}>
      <section className="modal-content pricing-modal" role="dialog" aria-modal="true" aria-labelledby="pricing-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="pricing-modal-header"><div><span className="case-hub-kicker">{mode === "topup" ? "Secure credit purchase" : "Plan-aware workspace"}</span><h2 id="pricing-title">{mode === "topup" ? "Add credits" : "Legal Saathi plans"}</h2><p>{mode === "topup" ? "Choose a credit pack. Credits are granted only after backend payment verification." : "Backend prices, monthly or annual billing, and verified access."}</p></div><button className="btn" type="button" onClick={onClose} aria-label={mode === "topup" ? "Close Add Credits" : "Close pricing"}><X size={18} /></button></header>
        {(notice || error) && <div className="legal-ai-error" role="status">{notice || error}{transactionReference ? ` Reference: ${transactionReference}` : ""}</div>}
        {loading && !catalog ? <p className="text-secondary">Loading secure plan catalog...</p> : (
          mode === "plans" ? <>
          <div className="pricing-cycle-toggle" role="group" aria-label="Billing cycle">
            <button className={`btn ${billingCycle === "monthly" ? "btn-primary" : ""}`} type="button" aria-pressed={billingCycle === "monthly"} onClick={() => setBillingCycle("monthly")}>Monthly</button>
            <button className={`btn ${billingCycle === "yearly" ? "btn-primary" : ""}`} type="button" aria-pressed={billingCycle === "yearly"} onClick={() => setBillingCycle("yearly")}><CalendarDays size={15} /> Annual</button>
          </div>
          <div className="pricing-grid">
            {catalog?.plans.map((plan) => {
              const isCurrent = plan.id === (planState?.plan.id ?? "free");
              const targetIndex = catalog.plans.findIndex((item) => item.id === plan.id);
              const isIncluded = !isCurrent && targetIndex <= currentRank;
              const purchasablePlanId = plan.id === "plus" || plan.id === "pro" || plan.id === "max" ? plan.id : null;
              const canPurchase = Boolean(purchasablePlanId) && plan.purchasable && !isCurrent && !isIncluded;
              const selectedPrice = plan.billingPrices[billingCycle];
              return <Fragment key={plan.id}>
                {plan.id === "max" && advocate && <article className="pricing-card"><b className="pricing-badge">Case add-on</b><h3>{advocate.name}</h3><strong>From {formatInr(advocate.pricePaise)} / case</strong><p>A separate case add-on. It does not replace or grant the Max plan.</p><span><Check size={14} />Case-specific advocate preparation workflow</span><button className="btn btn-primary" type="button" disabled={busy !== null} onClick={() => void checkout("advocate_prep", { purchaseType: "plan", planId: "advocate", billingCycle: "one_time" }, "Advocate Prep add-on")}>Request Advocate Prep</button></article>}
                <article className={`pricing-card ${plan.id === "pro" ? "featured" : ""}`}>
                {plan.id === "pro" && <b className="pricing-badge">Most useful</b>}
                <h3>{plan.name}</h3><strong>{formatInr(selectedPrice)}{selectedPrice ? billingCycle === "yearly" ? " / year" : " / month" : ""}</strong>
                {billingCycle === "yearly" && plan.annualSavingsPercent > 0 && <small className="pricing-saving">Save {plan.annualSavingsPercent}% with annual billing</small>}
                <p>Backend-enforced plan and model access. Administrator access is separate.</p>
                {planFeatures(plan, catalog).map((feature) => <span key={feature}><Check size={14} />{feature}</span>)}
                {purchasablePlanId && canPurchase && <div className="pricing-coupon"><input className="apple-glass-input" value={couponByPlan[purchasablePlanId] || ""} onChange={(event) => setCouponByPlan({ ...couponByPlan, [purchasablePlanId]: event.target.value })} placeholder={`Coupon for ${billingCycle === "yearly" ? "annual" : "monthly"}`} /><button className="btn" type="button" onClick={() => void applyCoupon(purchasablePlanId, billingCycle)} disabled={busy === `${purchasablePlanId}:coupon`}>Apply</button></div>}
                <button className={`btn ${canPurchase ? "btn-primary" : ""}`} type="button" disabled={!canPurchase || busy !== null} onClick={() => purchasablePlanId && canPurchase && void checkout(purchasablePlanId, { purchaseType: "plan", planId: purchasablePlanId, billingCycle, couponCode: couponByPlan[purchasablePlanId] }, `Legal Saathi ${plan.name} ${billingCycle === "yearly" ? "annual" : "monthly"}`)}>{isCurrent ? "Current plan" : isIncluded ? "Included in current plan" : canPurchase ? `Choose ${plan.name}` : "Unavailable"}</button>
                </article>
              </Fragment>;
            })}
          </div></> : null
        )}
        {mode === "topup" && catalog && planState?.entitlements.topUps && catalog.topUps.length > 0 && <section className="topup-section"><div><span className="case-hub-kicker">{planState.topUpMode === "commercial" ? "Secure Razorpay checkout" : "Razorpay test checkout"}</span><h3>Choose a credit pack</h3><p>No credits are granted before the backend verifies the order owner, amount, currency, signature, and payment state.</p></div><div className="topup-grid">{catalog.topUps.map((item) => <button className="topup-option" type="button" key={item.id} disabled={busy !== null} onClick={() => void checkout(item.id, { purchaseType: "topup", packageId: item.id }, `${item.units.toLocaleString("en-IN")} Legal Saathi credits`)}><Coins size={18} /><strong>{item.units.toLocaleString("en-IN")} credits</strong><span>{formatInr(item.pricePaise)}</span></button>)}</div>{catalog.customTopUp && <div className="custom-topup"><div><h3>Choose your amount</h3><p>Enter a whole INR amount. The backend decides the exact credits before checkout.</p></div><label htmlFor="custom-topup-amount">Amount in INR</label><div className="custom-topup-controls"><input id="custom-topup-amount" className="apple-glass-input" type="number" inputMode="numeric" min={catalog.customTopUp.minAmountInr} max={catalog.customTopUp.maxAmountInr} step={catalog.customTopUp.amountStepInr} value={customAmountInr} onChange={(event) => { setCustomAmountInr(event.target.value); setCustomQuote(null); }} /><button className="btn" type="button" disabled={busy !== null} onClick={() => void previewCustomAmount()}>{busy === "custom:quote" ? "Calculating..." : "Calculate credits"}</button></div>{customQuote && <div className="custom-topup-quote" role="status"><strong>{customQuote.units.toLocaleString("en-IN")} credits</strong><span>for {formatInr(customQuote.amount)}</span><button className="btn btn-primary" type="button" disabled={busy !== null} onClick={() => void checkout("custom", { purchaseType: "topup", packageId: "custom", customAmountInr: customQuote.amountInr }, `${customQuote.units.toLocaleString("en-IN")} custom Legal Saathi credits`)}>Continue to secure checkout</button></div>}</div>}</section>}
        {mode === "topup" && catalog && (!planState?.entitlements.topUps || catalog.topUps.length === 0) && <section className="topup-unavailable" role="status"><Coins size={24} /><h3>Add Credits is not enabled in this environment</h3><p>The button no longer redirects to subscriptions. Credit packs appear here only when the backend confirms a controlled Razorpay test or commercially approved checkout.</p></section>}
        <p className="text-secondary">No frontend click grants access. The backend verifies ownership, amount, currency, coupon, signature, and payment replay before changing plan state.</p>
      </section>
    </div>
  );
}
