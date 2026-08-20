import { Router } from "express";
import { requireActiveOnlineAccount } from "../middleware/accountAccess.middleware";
import { getVerifiedUser } from "../middleware/identity.middleware";
import {
  createRazorpayOrder,
  listPaymentTransactions,
  processRazorpayWebhook,
  PaymentSignatureError,
  PaymentStoreError,
  PaymentValidationError,
  RazorpayAuthenticationError,
  RazorpayNotConfiguredError,
  RazorpayRequestError,
  verifyRazorpayPayment,
  previewPaymentCoupon,
  quoteCustomTopUp,
  // Coupon-specific errors — each returns 400 with a clear user-facing message
  CouponNotFoundError,
  CouponInactiveError,
  CouponExpiredError,
  CouponRedeemedError,
  CouponPlanMismatchError,
  CouponBillingMismatchError,
  CouponDiscountInvalidError,
  CouponStoreError,
} from "../services/payments/razorpay.service";
import { OnlineUserStoreError } from "../services/supabase/onlineUsers.service";
import { couponRateLimit, paymentOrderRateLimit, paymentVerifyRateLimit } from "../middleware/rateLimit.middleware";
import { rejectDuplicateRequest } from "../middleware/idempotency.middleware";

export const paymentsRoutes = Router();

export async function razorpayWebhookHandler(request: import("express").Request, response: import("express").Response) {
  try {
    if (!Buffer.isBuffer(request.body)) {
      response.status(400).json({ ok: false, error: "INVALID_WEBHOOK_BODY", message: "Webhook body must be raw bytes." });
      return;
    }
    const result = await processRazorpayWebhook({
      rawBody: request.body,
      signature: request.header("x-razorpay-signature"),
      eventId: request.header("x-razorpay-event-id"),
    });
    response.json({ ok: true, ...result });
  } catch (error) {
    sendPaymentError(response, error);
  }
}

paymentsRoutes.post("/coupon-preview", couponRateLimit, requireActiveOnlineAccount, async (request, response) => {
  try {
    const coupon = await previewPaymentCoupon({
      planId: request.body?.planId,
      billingCycle: request.body?.billingCycle,
      couponCode: request.body?.couponCode,
      ownerEmail: getVerifiedUser(response).email,
    });
    response.json({
      ok: true,
      ...coupon,
    });
  } catch (error) {
    response.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Coupon could not be applied" });
  }
});

paymentsRoutes.post("/topup-quote", couponRateLimit, requireActiveOnlineAccount, async (request, response) => {
  try {
    const quote = await quoteCustomTopUp({
      ownerEmail: getVerifiedUser(response).email,
      amountInr: request.body?.amountInr,
    });
    response.json({ ok: true, ...quote });
  } catch (error) {
    sendPaymentError(response, error);
  }
});

function sendPaymentError(response: import("express").Response, error: unknown) {
  // ── Coupon validation errors (400) ──────────────────────────────────────────
  if (
    error instanceof CouponNotFoundError ||
    error instanceof CouponInactiveError ||
    error instanceof CouponExpiredError ||
    error instanceof CouponRedeemedError ||
    error instanceof CouponPlanMismatchError ||
    error instanceof CouponBillingMismatchError ||
    error instanceof CouponDiscountInvalidError
  ) {
    response.status(400).json({
      ok: false,
      error: (error as Error).message,
      couponInvalid: true,
    });
    return;
  }

  // ── Coupon store unavailable — fall back gracefully ──────────────────────
  if (error instanceof CouponStoreError) {
    response.status(503).json({
      ok: false,
      error: "Coupon validation service is temporarily unavailable. Please try again without a coupon.",
      couponInvalid: true,
    });
    return;
  }

  // ── Razorpay / Payment errors ────────────────────────────────────────────
  if (error instanceof RazorpayNotConfiguredError) {
    response.status(503).json({ ok: false, error: error.message });
    return;
  }
  if (error instanceof PaymentValidationError || error instanceof PaymentSignatureError) {
    response.status(400).json({ ok: false, error: (error as Error).message });
    return;
  }
  if (error instanceof RazorpayRequestError) {
    response.status(502).json({ ok: false, error: "Payment gateway request failed" });
    return;
  }
  if (error instanceof RazorpayAuthenticationError) {
    response.status(502).json({ ok: false, error: error.message });
    return;
  }
  if (error instanceof PaymentStoreError) {
    response.status(503).json({ ok: false, error: "Payment storage is not ready" });
    return;
  }
  if (error instanceof OnlineUserStoreError) {
    response.status(503).json({
      ok: false,
      error: "Payment user profile storage is not ready",
      setupHint: "Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then restart the backend.",
    });
    return;
  }
  response.status(500).json({ ok: false, error: "Payment request failed" });
}

paymentsRoutes.post("/order", paymentOrderRateLimit, requireActiveOnlineAccount, rejectDuplicateRequest, async (request, response) => {
  try {
    const order = await createRazorpayOrder({
      purchaseType: request.body?.purchaseType,
      planId: request.body?.planId,
      billingCycle: request.body?.billingCycle,
      packageId: request.body?.packageId,
      customAmountInr: request.body?.customAmountInr,
      ownerEmail: getVerifiedUser(response).email,
      couponCode: request.body?.couponCode,
    });
    response.status(201).json({ ok: true, ...order });
  } catch (error) {
    sendPaymentError(response, error);
  }
});

paymentsRoutes.get("/transactions", requireActiveOnlineAccount, async (_request, response) => {
  try {
    const transactions = await listPaymentTransactions(getVerifiedUser(response).email, 50);
    response.json({ ok: true, transactions });
  } catch (error) {
    sendPaymentError(response, error);
  }
});

paymentsRoutes.post("/verify", paymentVerifyRateLimit, requireActiveOnlineAccount, async (request, response) => {
  try {
    const result = await verifyRazorpayPayment({
      ownerEmail: getVerifiedUser(response).email,
      razorpayOrderId: request.body?.razorpayOrderId,
      razorpayPaymentId: request.body?.razorpayPaymentId,
      razorpaySignature: request.body?.razorpaySignature,
    });
    response.json({ ok: true, ...result });
  } catch (error) {
    sendPaymentError(response, error);
  }
});
