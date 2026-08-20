"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { createRazorpayOrder, getBackendSession, previewCoupon, safeInlineBackendMessage, verifyRazorpayOrder } from "@/lib/backendApi";
import { frontendPlans, paidFrontendPlans, type PaidFrontendPlan } from "@/lib/plans";

type PlanId = "plus" | "pro" | "advocate";
type PlanCard = PaidFrontendPlan & { id: PlanId };

declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (name: string, handler: () => void) => void }; } }

async function loadRazorpay() {
  if (window.Razorpay) return true;
  return new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export default function PricingModal({ isOpen, onClose, onRequireSignIn, onPaymentVerified }: { isOpen: boolean; onClose: () => void; onRequireSignIn: () => void; onPaymentVerified?: () => Promise<void> | void }) {
  const [couponByPlan, setCouponByPlan] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (!isOpen) return null;

  const applyCoupon = async (plan: PlanCard) => {
    if (!getBackendSession()) { onRequireSignIn(); return; }
    const code = couponByPlan[plan.id]?.trim();
    if (!code) return;
    setBusy(`${plan.id}:coupon`);
    try {
      const quote = await previewCoupon(plan.id, plan.billingCycle, code);
      setNotice(`${quote.coupon.code} applied. Final price: ₹${(quote.finalAmount / 100).toLocaleString("en-IN")}.`);
    } catch (error) { setNotice(safeInlineBackendMessage(error, "Coupon could not be applied.")); }
    finally { setBusy(null); }
  };

  const checkout = async (plan: PlanCard) => {
    if (!getBackendSession()) { onRequireSignIn(); return; }
    setBusy(plan.id); setNotice("");
    try {
      const order = await createRazorpayOrder(plan.id, plan.billingCycle, couponByPlan[plan.id]);
      if (order.localTestMode) { setNotice("Payment setup is required. No tier was granted."); return; }
      if (!order.orderId || !order.keyId || !(await loadRazorpay()) || !window.Razorpay) { throw new Error("Razorpay Checkout could not be loaded. Confirm backend Razorpay keys and try again."); }
      const razorpay = new window.Razorpay({
        key: order.keyId, amount: order.amount, currency: order.currency, name: "Legal Saathi", description: `${plan.title} access`, order_id: order.orderId,
        theme: { color: "#2563eb" },
        modal: { ondismiss: () => setBusy(null) },
        handler: async (payment: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string }) => {
          try {
            await verifyRazorpayOrder({ razorpayOrderId: payment.razorpay_order_id || "", razorpayPaymentId: payment.razorpay_payment_id || "", razorpaySignature: payment.razorpay_signature || "" });
            await onPaymentVerified?.();
            setNotice("Payment verified. Your access has been updated by the backend.");
          } catch (error) { setNotice(safeInlineBackendMessage(error, "Payment could not be verified. Access was not granted.")); }
          finally { setBusy(null); }
        },
      });
      razorpay.on("payment.failed", () => { setNotice("Payment was not completed. No access was granted."); setBusy(null); });
      razorpay.open();
    } catch (error) { setNotice(safeInlineBackendMessage(error, "Payment could not start.")); setBusy(null); }
  };

  return <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={onClose}><section className="modal-content pricing-modal" onClick={(event) => event.stopPropagation()}><header className="pricing-modal-header"><div><span className="case-hub-kicker">Upgrade your workspace</span><h2>Legal Saathi plans</h2><p>Payment is completed only after backend Razorpay signature verification.</p></div><button className="btn" onClick={onClose}><X size={18} /></button></header>{notice && <div className="legal-ai-error" role="status">{notice}</div>}<div className="pricing-grid"><article className="pricing-card"><h3>{frontendPlans.free.title}</h3><strong>{frontendPlans.free.price}</strong><p>{frontendPlans.free.description}</p>{frontendPlans.free.features.map((feature) => <span key={feature}><Check size={14} />{feature}</span>)}<button className="btn">{frontendPlans.free.cta}</button></article>{paidFrontendPlans.map((plan) => <article className={`pricing-card ${plan.id === "pro" ? "featured" : ""}`} key={plan.id}>{plan.id === "pro" && <b className="pricing-badge">Most useful</b>}<h3>{plan.title}</h3><strong>{plan.price}</strong><p>{plan.description}</p>{plan.features.map((feature) => <span key={feature}><Check size={14} />{feature}</span>)}<div className="pricing-coupon"><input className="apple-glass-input" value={couponByPlan[plan.id] || ""} onChange={(event) => setCouponByPlan({ ...couponByPlan, [plan.id]: event.target.value })} placeholder="Have a coupon?" /><button className="btn" onClick={() => void applyCoupon(plan)} disabled={busy === `${plan.id}:coupon`}>Apply</button></div><button className="btn btn-primary" onClick={() => void checkout(plan)} disabled={busy === plan.id}>{busy === plan.id ? "Preparing..." : plan.cta}</button></article>)}</div><p className="text-secondary">Real access changes only after the backend verifies the Razorpay payment signature. Admin may grant preview tiers for local testing.</p></section></div>;
}
