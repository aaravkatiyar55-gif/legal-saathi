import { createHash, createHmac, timingSafeEqual } from "crypto";
import { env } from "../../config/env";
import {
  grantPaidTier,
  getUserProfile,
  isValidUserEmail,
  normalizeUserEmail,
  UserTier,
} from "../supabase/onlineUsers.service";
import { getSupabaseClient } from "../supabase/supabaseClient";
import {
  getLocalPaymentOrder,
  listLocalPayments,
  markLocalPaymentVerified,
  recordLocalPaymentEvent,
  saveLocalPaymentOrder,
} from "../local/localDevStore.service";
import {
  consumePreviewCouponReservation,
  ensurePreviewProfile,
  getPreviewProfile,
  releasePreviewCouponReservation,
  reservePreviewCoupon,
  updatePreviewProfile,
  validatePreviewCoupon,
} from "../local/previewAccess.service";
import {
  validateAndApplyCoupon,
  reserveCouponForOrder,
  releaseCouponReservation,
  CouponNotFoundError,
  CouponInactiveError,
  CouponExpiredError,
  CouponRedeemedError,
  CouponPlanMismatchError,
  CouponBillingMismatchError,
  CouponDiscountInvalidError,
  CouponStoreError,
} from "./coupon.service";
import {
  PRODUCT_CATALOG_VERSION,
  PRODUCT_PLANS,
  ProductPlanId,
  CUSTOM_TOP_UP_POLICY,
  TEST_TOP_UP_PACKAGES,
  TestTopUpPackageId,
} from "../../config/productPolicy";
import { currentPlanIdFromState, getPlanState, isTopUpEnabled } from "../billing/planState.service";
import { grantPlan, grantTopUp } from "../billing/creditLedger.service";
import { getCommercialPlanPrice } from "../billing/commercialPricing.service";

export type PaidPlanId = "plus" | "pro" | "max" | "advocate";
export type BillingCycle = "monthly" | "yearly" | "one_time";
export type PaymentPurchaseType = "plan" | "topup";

const tierRank: Record<UserTier, number> = { free: 0, plus: 1, pro: 2, advocate: 3 };

type PaymentRow = {
  id: string;
  email: string;
  plan: PaidPlanId | null;
  billing_cycle: BillingCycle;
  amount: number;
  currency: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  status: string;
  coupon_code: string | null;
  purchase_type?: PaymentPurchaseType;
  package_id?: string | null;
  units?: number | null;
  product_catalog_version?: string | null;
};

export class RazorpayNotConfiguredError extends Error {}
export class RazorpayAuthenticationError extends Error {}
export class RazorpayRequestError extends Error {}
export class PaymentStoreError extends Error {}
export class PaymentValidationError extends Error {}
export class PaymentSignatureError extends Error {}

// Re-export coupon errors so the route can handle them uniformly
export {
  CouponNotFoundError,
  CouponInactiveError,
  CouponExpiredError,
  CouponRedeemedError,
  CouponPlanMismatchError,
  CouponBillingMismatchError,
  CouponDiscountInvalidError,
  CouponStoreError,
};

function hasConfiguredValue(value: string) {
  return Boolean(value.trim()) && !value.includes("PASTE_") && value !== "replace_later";
}

export function isRazorpayConfigured() {
  return hasConfiguredValue(env.razorpayKeyId) && hasConfiguredValue(env.razorpayKeySecret);
}

function requireRazorpayConfiguration() {
  if (!isRazorpayConfigured()) {
    throw new RazorpayNotConfiguredError(
      "Payment gateway is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend env and restart backend.",
    );
  }
}

function requirePaymentStore() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new PaymentStoreError("Payment storage is not configured");
  return supabase;
}

function normalizePlan(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeBillingCycle(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeCouponInput(value: unknown) {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40)
    : "";
}

async function resolveBasePrice(planValue: unknown, billingValue: unknown) {
  const plan = normalizePlan(planValue);
  const billingCycle = normalizeBillingCycle(billingValue);
  if (plan === "free") throw new PaymentValidationError("Free plan does not require payment");
  if (plan !== "plus" && plan !== "pro" && plan !== "max" && plan !== "advocate") {
    throw new PaymentValidationError("Invalid payment plan");
  }
  const paidPlan = plan as PaidPlanId;
  if (!["monthly", "yearly", "one_time"].includes(billingCycle)) {
    throw new PaymentValidationError("Invalid billing cycle");
  }
  const amount = await getCommercialPlanPrice(paidPlan, billingCycle as BillingCycle);
  if (!amount) throw new PaymentValidationError("Billing cycle is not available for this plan");
  if (amount < 100) throw new PaymentValidationError("Paid plan amount must be at least 100 paise");
  return { plan: paidPlan, billingCycle: billingCycle as BillingCycle, baseAmount: amount };
}

export function resolveCustomTopUpPrice(amountValue: unknown) {
  const amountInr = Number(amountValue);
  if (!Number.isSafeInteger(amountInr)) {
    throw new PaymentValidationError("Custom top-up amount must be a whole INR amount.");
  }
  const amountPaise = amountInr * 100;
  if (
    amountPaise < CUSTOM_TOP_UP_POLICY.minAmountPaise
    || amountPaise > CUSTOM_TOP_UP_POLICY.maxAmountPaise
    || amountPaise % CUSTOM_TOP_UP_POLICY.amountStepPaise !== 0
  ) {
    throw new PaymentValidationError(
      `Custom top-up amount must be between INR ${CUSTOM_TOP_UP_POLICY.minAmountPaise / 100} and INR ${CUSTOM_TOP_UP_POLICY.maxAmountPaise / 100}.`,
    );
  }
  return {
    packageId: CUSTOM_TOP_UP_POLICY.id,
    units: amountInr * CUSTOM_TOP_UP_POLICY.unitsPerRupee,
    baseAmount: amountPaise,
    amountInr,
    billingCycle: "one_time" as const,
  };
}

function resolveTopUpPrice(packageValue: unknown, customAmountInr: unknown) {
  if (!isTopUpEnabled()) {
    throw new PaymentValidationError("Top-ups are not enabled in this environment.");
  }
  const normalizedPackage = String(packageValue ?? "").trim().toLowerCase();
  if (normalizedPackage === CUSTOM_TOP_UP_POLICY.id || (!normalizedPackage && customAmountInr !== undefined)) {
    return resolveCustomTopUpPrice(customAmountInr);
  }
  if (customAmountInr !== undefined && customAmountInr !== null && customAmountInr !== "") {
    throw new PaymentValidationError("A custom amount cannot be combined with a fixed top-up package.");
  }
  const packageId = normalizedPackage as TestTopUpPackageId;
  if (!(packageId in TEST_TOP_UP_PACKAGES)) throw new PaymentValidationError("Invalid top-up package");
  const item = TEST_TOP_UP_PACKAGES[packageId];
  return {
    packageId,
    units: item.units,
    baseAmount: item.pricePaise,
    amountInr: item.pricePaise / 100,
    billingCycle: "one_time" as const,
  };
}

function normalizePurchaseType(value: unknown): PaymentPurchaseType {
  return value === "topup" ? "topup" : "plan";
}

export function getPaymentPlanQuote(planId: unknown, billingCycle: unknown) {
  return resolveBasePrice(planId, billingCycle);
}

async function paymentAccountContext(email: string) {
  const profile = canUseLocalPaymentStorageFallback()
    ? await getPreviewProfile(email) || await ensurePreviewProfile({ email })
    : await getUserProfile(email);
  const planState = await getPlanState(email, profile?.tier ?? "free");
  return { profile, planState, currentPlan: currentPlanIdFromState(planState) };
}

function requireTopUpEligiblePlan(currentPlan: ProductPlanId) {
  if (!PRODUCT_PLANS[currentPlan].paid || !PRODUCT_PLANS[currentPlan].allowsTopUps) {
    throw new PaymentValidationError("Top-ups require an active Plus, Pro, or Max membership.");
  }
}

export async function quoteCustomTopUp(input: { ownerEmail: unknown; amountInr: unknown }) {
  const email = normalizeUserEmail(input.ownerEmail);
  if (!isValidUserEmail(email)) throw new PaymentValidationError("A valid account is required");
  if (!isTopUpEnabled()) throw new PaymentValidationError("Top-ups are not enabled in this environment.");
  const quote = resolveCustomTopUpPrice(input.amountInr);
  const { currentPlan } = await paymentAccountContext(email);
  requireTopUpEligiblePlan(currentPlan);
  return {
    packageId: quote.packageId,
    amountInr: quote.amountInr,
    amount: quote.baseAmount,
    currency: "INR" as const,
    units: quote.units,
  };
}

export async function previewPaymentCoupon(input: {
  planId: unknown;
  billingCycle: unknown;
  couponCode: unknown;
  ownerEmail: unknown;
}) {
  const email = normalizeUserEmail(input.ownerEmail);
  if (!isValidUserEmail(email)) throw new PaymentValidationError("A valid account is required");
  const quote = await resolveBasePrice(input.planId, input.billingCycle);
  const couponCode = normalizeCouponInput(input.couponCode);
  if (!couponCode) throw new CouponNotFoundError();
  const coupon = canUseLocalPaymentStorageFallback()
    ? await validatePreviewCoupon({
        code: couponCode,
        plan: quote.plan,
        billingCycle: quote.billingCycle,
        amount: quote.baseAmount,
        email,
      })
    : await validateAndApplyCoupon(couponCode, quote.plan, quote.billingCycle, quote.baseAmount);
  const normalized = "coupon" in coupon ? coupon.coupon : coupon;
  return {
    coupon: {
      code: normalized.code,
      discountType: normalized.discountType,
      discountValue: normalized.discountValue,
    },
    baseAmount: quote.baseAmount,
    discountAmount: coupon.discountAmount,
    finalAmount: coupon.finalAmount,
  };
}

function canUseLocalPaymentTestMode() {
  return env.localPaymentTestMode && env.nodeEnv !== "production";
}

function canUseLocalPaymentStorageFallback() {
  // The isolated local preview uses a backend JSON ledger even when it creates
  // a real Razorpay test order. This avoids writing preview users/orders into
  // the original application's Supabase project.
  return env.nodeEnv !== "production" && env.localCasesFallback;
}

async function verifyLocalStoredPayment(email: string, orderId: string, paymentId: string) {
  const localRecord = await getLocalPaymentOrder(orderId);
  if (!localRecord || localRecord.email !== email) {
    throw new PaymentValidationError("Payment order was not found");
  }
  let finalized;
  try {
    finalized = await markLocalPaymentVerified(orderId, paymentId);
  } catch (error) {
    const category = error instanceof Error ? error.message : "";
    if (category === "PAYMENT_ID_REPLAYED" || category === "PAYMENT_ORDER_ALREADY_FINALIZED") {
      throw new PaymentValidationError("Payment verification cannot be reused");
    }
    throw new PaymentStoreError("Verified payment could not be saved");
  }
  if (!finalized) throw new PaymentValidationError("Payment order was not found");

  const paidRecord = finalized.record;
  if (paidRecord.coupon_code) {
    const consumed = await consumePreviewCouponReservation(orderId, paymentId, email);
    if (!consumed) throw new PaymentValidationError("Coupon reservation is invalid");
  }

  const purchaseType = paidRecord.purchase_type ?? "plan";
  const isTopUp = purchaseType === "topup";
  const isAdvocateAddOn = !isTopUp && paidRecord.plan === "advocate";
  const currentProfile = await getPreviewProfile(email) || await ensurePreviewProfile({ email });
  if (isTopUp) {
    if (!paidRecord.package_id || !paidRecord.units) throw new PaymentStoreError("Top-up order snapshot is incomplete");
    await grantTopUp({ email, units: paidRecord.units, paymentId, bootstrapTier: currentProfile.tier });
  }
  const paidPlan = paidRecord.plan === "plus" || paidRecord.plan === "pro" || paidRecord.plan === "max"
    ? paidRecord.plan
    : null;
  const paidTier: UserTier | null = paidPlan === "max" ? "advocate" : paidPlan;
  const shouldGrantTier = Boolean(paidTier) && tierRank[currentProfile.tier] < tierRank[paidTier as UserTier];
  const profile = shouldGrantTier
    ? await updatePreviewProfile(email, { tier: paidTier as "plus" | "pro" | "advocate" }, "verified_razorpay_payment")
    : currentProfile;
  if (paidPlan) {
    await grantPlan({
      email,
      planId: paidPlan,
      source: "payment",
      referenceId: orderId,
      durationDays: paidRecord.billing_cycle === "yearly" ? 365 : 30,
    });
  }
  return {
    success: true,
    verified: true,
    localPaymentStorage: true,
    payment: {
      orderId,
      paymentId,
      purchaseType,
      planId: paidRecord.plan,
      packageId: paidRecord.package_id,
      units: paidRecord.units,
      billingCycle: paidRecord.billing_cycle,
      amount: paidRecord.amount,
      currency: paidRecord.currency,
      status: "captured",
    },
    profile,
    currentTier: profile?.tier ?? null,
    addonStatus: isAdvocateAddOn ? "advocate_addon_paid" : null,
    topUpStatus: isTopUp ? "topup_units_granted" : null,
  };
}

async function ensurePaymentsTable() {
  const result = await requirePaymentStore().from("payments").select("id").limit(1);
  if (result.error) throw new PaymentStoreError("Payment storage is not ready");
}

export async function createRazorpayOrder(input: {
  purchaseType?: unknown;
  planId: unknown;
  billingCycle: unknown;
  packageId?: unknown;
  customAmountInr?: unknown;
  ownerEmail: unknown;
  couponCode?: unknown;
}) {
  const email = normalizeUserEmail(input.ownerEmail);
  if (!isValidUserEmail(email)) throw new PaymentValidationError("A valid ownerEmail is required");
  const purchaseType = normalizePurchaseType(input.purchaseType);
  const planQuote = purchaseType === "plan" ? await resolveBasePrice(input.planId, input.billingCycle) : null;
  const topUpQuote = purchaseType === "topup" ? resolveTopUpPrice(input.packageId, input.customAmountInr) : null;
  const plan = planQuote?.plan ?? null;
  const billingCycle = planQuote?.billingCycle ?? topUpQuote?.billingCycle ?? "one_time";
  const baseAmount = planQuote?.baseAmount ?? topUpQuote?.baseAmount ?? 0;
  const packageId = topUpQuote?.packageId ?? null;
  const units = topUpQuote?.units ?? 0;
  const accountContext = await paymentAccountContext(email);
  const currentPlan = accountContext.currentPlan;
  if (purchaseType === "topup") {
    requireTopUpEligiblePlan(currentPlan);
  }
  if (purchaseType === "plan" && plan && plan !== "advocate") {
    const targetPlan = plan as ProductPlanId;
    if (PRODUCT_PLANS[currentPlan].rank >= PRODUCT_PLANS[targetPlan].rank) {
      throw new PaymentValidationError(`Your current ${PRODUCT_PLANS[currentPlan].name} plan already includes this plan.`);
    }
  }
  if (canUseLocalPaymentTestMode() && !isRazorpayConfigured()) {
    // Never grant a paid tier merely because the user clicked a payment CTA.
    // Preview administrators can grant a tier separately for local UI testing.
    return {
      localTestMode: true,
      orderId: `local_test_${Date.now()}`,
      amount: baseAmount,
      currency: "INR",
      keyId: "",
      purchaseType,
      planId: plan,
      packageId,
      units,
      billingCycle,
      baseAmount,
      discountAmount: 0,
      finalAmount: baseAmount,
      couponCode: null,
      couponApplied: false,
      discountPercent: 0,
      mode: "local_test",
      message: "Local test only. No real Razorpay payment was created.",
      currentTier: null,
    };
  }

  requireRazorpayConfiguration();

  const currency = env.razorpayCurrency.trim().toUpperCase() || "INR";
  if (currency !== "INR") throw new PaymentValidationError("RAZORPAY_CURRENCY must be INR");

  const useLocalPaymentStore = canUseLocalPaymentStorageFallback();
  if (!useLocalPaymentStore) {
    await ensurePaymentsTable();
  }

  const couponCodeInput = normalizeCouponInput(input.couponCode);
  if (purchaseType === "topup" && couponCodeInput) {
    throw new PaymentValidationError("Coupons cannot be applied to controlled-test top-ups.");
  }

  // ── Backend coupon validation ──────────────────────────────────────────────
  let finalAmount = baseAmount;
  let discountAmount = 0;
  let discountPercent = 0;
  let appliedCouponCode: string | null = null;
  let couponApplied = false;

  if (couponCodeInput && plan) {
    const coupon = useLocalPaymentStore
      ? await validatePreviewCoupon({ code: couponCodeInput, plan, billingCycle, amount: baseAmount, email })
      : await validateAndApplyCoupon(couponCodeInput, plan, billingCycle, baseAmount);
    finalAmount = coupon.finalAmount;
    discountAmount = coupon.discountAmount;
    const previewCoupon = "coupon" in coupon ? coupon.coupon : coupon;
    discountPercent = previewCoupon.discountType === "percent"
      ? previewCoupon.discountValue
      : Math.round((coupon.discountAmount / baseAmount) * 100);
    appliedCouponCode = previewCoupon.code;
    couponApplied = true;
  }

  // ── Create Razorpay order with the validated (possibly discounted) amount ──
  const itemReference = purchaseType === "topup" ? packageId : plan;
  const receipt = `legal_sathi_${itemReference}_${Date.now()}`.slice(0, 40);
  const authorization = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64");

  let response: globalThis.Response;
  try {
    response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: finalAmount,   // always the backend-calculated amount
        currency,
        receipt,
        notes: {
          purchase_type: purchaseType,
          legal_sathi_plan: plan ?? "none",
          package_id: packageId ?? "none",
          units,
          billing_cycle: billingCycle,
          catalog_version: PRODUCT_CATALOG_VERSION,
          owner_ref: createHash("sha256").update(email).digest("hex").slice(0, 24),
          coupon_code: appliedCouponCode ?? "none",
          base_amount: baseAmount,
          discount_amount: discountAmount,
          final_amount: finalAmount,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new RazorpayRequestError("Payment gateway request failed");
  }

  if (response.status === 401 || response.status === 403) {
    throw new RazorpayAuthenticationError(
      "Razorpay authentication failed. Check that Key ID and Key Secret are from the same Razorpay test key pair.",
    );
  }

  let order: { id?: string; amount?: number; currency?: string } = {};
  try {
    order = (await response.json()) as typeof order;
  } catch {
    throw new RazorpayRequestError("Payment gateway returned an invalid response");
  }
  if (
    !response.ok ||
    !order.id ||
    order.amount !== finalAmount ||
    String(order.currency || "").toUpperCase() !== currency
  ) {
    throw new RazorpayRequestError("Payment gateway request failed");
  }

  let couponReserved = false;
  if (appliedCouponCode) {
    couponReserved = useLocalPaymentStore
      ? await reservePreviewCoupon(appliedCouponCode, order.id, email)
      : await reserveCouponForOrder(appliedCouponCode, order.id, email);
    if (!couponReserved) throw new CouponRedeemedError();
  }

  // ── Store payment record ───────────────────────────────────────────────────
  try {
    if (useLocalPaymentStore) {
      await saveLocalPaymentOrder({
        email,
        purchase_type: purchaseType,
        plan,
        package_id: packageId,
        units,
        product_catalog_version: PRODUCT_CATALOG_VERSION,
        billing_cycle: billingCycle,
        amount: finalAmount,
        currency,
        razorpay_order_id: order.id,
        coupon_code: appliedCouponCode ?? null,
      });
    } else {
      const paymentRecord = await requirePaymentStore().from("payments").insert({
        email,
        purchase_type: purchaseType,
        plan,
        package_id: packageId,
        units,
        product_catalog_version: PRODUCT_CATALOG_VERSION,
        billing_cycle: billingCycle,
        amount: finalAmount,
        currency,
        razorpay_order_id: order.id,
        razorpay_payment_id: null,
        status: "created",
        coupon_code: appliedCouponCode ?? null,
        base_amount: baseAmount,
        discount_amount: discountAmount,
        final_amount: finalAmount,
        discount_percent: discountPercent > 0 ? discountPercent : null,
      });
      if (paymentRecord.error) throw new PaymentStoreError("Payment record could not be created");
    }
  } catch (error) {
    if (couponReserved) {
      if (useLocalPaymentStore) await releasePreviewCouponReservation(order.id);
      else await releaseCouponReservation(order.id);
    }
    if (error instanceof PaymentStoreError) throw error;
    throw new PaymentStoreError("Payment record could not be created");
  }

  return {
    orderId: order.id,
    amount: finalAmount,        // ← frontend must use this for Razorpay modal
    currency,
    keyId: env.razorpayKeyId,
    purchaseType,
    planId: plan,
    packageId,
    units,
    catalogVersion: PRODUCT_CATALOG_VERSION,
    billingCycle,
    baseAmount,
    discountAmount,
    finalAmount,
    couponCode: appliedCouponCode,
    couponApplied,
    discountPercent: couponApplied ? discountPercent : 0,
    mode: env.razorpayMode,
    localTestMode: false,
  };
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
  if (
    !/^order_[A-Za-z0-9_-]{8,80}$/.test(orderId) ||
    !/^pay_[A-Za-z0-9_-]{8,80}$/.test(paymentId) ||
    !/^[a-fA-F0-9]{64}$/.test(signature)
  ) {
    return false;
  }
  const expected = createHmac("sha256", env.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function verifyRazorpayWebhookSignature(rawBody: Buffer, signatureValue: unknown) {
  const signature = typeof signatureValue === "string" ? signatureValue.trim() : "";
  if (!hasConfiguredValue(env.razorpayWebhookSecret) || !/^[a-fA-F0-9]{64}$/.test(signature) || rawBody.length === 0 || rawBody.length > 256_000) {
    return false;
  }
  const expected = createHmac("sha256", env.razorpayWebhookSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function confirmRazorpayPaymentCaptured(input: { orderId: string; paymentId: string; amount: number; currency: string }) {
  if (env.nodeEnv !== "production" && canUseLocalPaymentStorageFallback()) return;
  const authorization = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64");
  let response: globalThis.Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(input.paymentId)}`, {
      method: "GET",
      headers: { Authorization: `Basic ${authorization}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new RazorpayRequestError("Payment capture status could not be verified");
  }
  if (!response.ok) throw new RazorpayRequestError("Payment capture status could not be verified");
  const data = await response.json() as { id?: string; order_id?: string; amount?: number; currency?: string; status?: string; captured?: boolean };
  if (
    data.id !== input.paymentId || data.order_id !== input.orderId || data.amount !== input.amount
    || String(data.currency || "").toUpperCase() !== input.currency || data.status !== "captured" || data.captured !== true
  ) {
    throw new PaymentValidationError("Payment is not captured yet.");
  }
}

export async function verifyRazorpayPayment(input: {
  ownerEmail: unknown;
  razorpayOrderId: unknown;
  razorpayPaymentId: unknown;
  razorpaySignature: unknown;
}) {
  requireRazorpayConfiguration();
  const email = normalizeUserEmail(input.ownerEmail);
  const orderId = typeof input.razorpayOrderId === "string" ? input.razorpayOrderId.trim() : "";
  const paymentId = typeof input.razorpayPaymentId === "string" ? input.razorpayPaymentId.trim() : "";
  const signature = typeof input.razorpaySignature === "string" ? input.razorpaySignature.trim() : "";

  if (
    !isValidUserEmail(email) ||
    !/^order_[A-Za-z0-9_-]{8,80}$/.test(orderId) ||
    !/^pay_[A-Za-z0-9_-]{8,80}$/.test(paymentId) ||
    !/^[a-fA-F0-9]{64}$/.test(signature)
  ) {
    throw new PaymentValidationError("Payment verification fields are required");
  }
  if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
    throw new PaymentSignatureError("Payment signature verification failed");
  }

  if (canUseLocalPaymentStorageFallback()) {
    const localRecord = await getLocalPaymentOrder(orderId);
    if (!localRecord || localRecord.email !== email) throw new PaymentValidationError("Payment order was not found");
    await confirmRazorpayPaymentCaptured({ orderId, paymentId, amount: localRecord.amount, currency: localRecord.currency });
    return verifyLocalStoredPayment(email, orderId, paymentId);
  }

  let supabase;
  try {
    supabase = requirePaymentStore();
  } catch (error) {
    if (!canUseLocalPaymentStorageFallback()) throw error;
    return verifyLocalStoredPayment(email, orderId, paymentId);
  }
  const recordResult = await supabase
    .from("payments")
    .select("id,email,plan,billing_cycle,amount,currency,razorpay_order_id,razorpay_payment_id,status,coupon_code,purchase_type,package_id,units,product_catalog_version")
    .eq("razorpay_order_id", orderId)
    .maybeSingle<PaymentRow>();

  if (recordResult.error) {
    if (canUseLocalPaymentStorageFallback()) return verifyLocalStoredPayment(email, orderId, paymentId);
    throw new PaymentStoreError("Payment record could not be loaded");
  }
  if (!recordResult.data || recordResult.data.email !== email) {
    throw new PaymentValidationError("Payment order was not found");
  }

  await confirmRazorpayPaymentCaptured({
    orderId,
    paymentId,
    amount: recordResult.data.amount,
    currency: recordResult.data.currency,
  });

  const finalized = await supabase.rpc("legal_sathi_finalize_purchase", {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_source: "browser_verification",
    p_event_id: null,
  });
  if (finalized.error) throw new PaymentStoreError("Verified payment could not be saved");
  const finalizeStatus = String(finalized.data ?? "");
  if (!["transitioned", "idempotent"].includes(finalizeStatus)) {
    throw new PaymentValidationError(
      finalizeStatus === "coupon_invalid"
        ? "Coupon reservation is invalid"
        : "Payment order could not be completed",
    );
  }
  const purchaseType = recordResult.data.purchase_type ?? "plan";
  const isAdvocateAddOn = purchaseType === "plan" && recordResult.data.plan === "advocate";
  const paidPlan = recordResult.data.plan === "plus" || recordResult.data.plan === "pro" || recordResult.data.plan === "max"
    ? recordResult.data.plan
    : null;
  const paidTier: UserTier | null = paidPlan === "max" ? "advocate" : paidPlan;
  const profile = paidTier
    ? await grantPaidTier(email, paidTier, orderId)
    : await getUserProfile(email);
  if (purchaseType === "plan" && !isAdvocateAddOn && !profile) throw new PaymentStoreError("Paid tier could not be applied");

  return {
    success: true,
    verified: true,
    payment: {
      orderId,
      paymentId,
      purchaseType,
      planId: recordResult.data.plan,
      packageId: recordResult.data.package_id ?? null,
      units: recordResult.data.units ?? 0,
      billingCycle: recordResult.data.billing_cycle,
      amount: recordResult.data.amount,
      currency: recordResult.data.currency,
      status: "captured",
    },
    profile,
    currentTier: profile?.tier ?? null,
    addonStatus: isAdvocateAddOn ? "advocate_addon_paid" : null,
    topUpStatus: purchaseType === "topup" ? "topup_units_granted" : null,
  };
}

type RazorpayWebhookPayload = {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } };
};

function webhookStatus(eventType: string, providerStatus: string) {
  if (eventType.includes("dispute")) return "disputed" as const;
  if (eventType.includes("refund") || providerStatus === "refunded") return "refunded" as const;
  if (eventType === "payment.captured" || providerStatus === "captured") return "captured" as const;
  if (eventType === "payment.authorized" || providerStatus === "authorized") return "authorized" as const;
  if (eventType === "payment.failed" || providerStatus === "failed") return "failed" as const;
  return null;
}

export async function processRazorpayWebhook(input: { rawBody: Buffer; signature: unknown; eventId: unknown }) {
  if (!verifyRazorpayWebhookSignature(input.rawBody, input.signature)) throw new PaymentSignatureError("Webhook signature verification failed");
  const eventId = typeof input.eventId === "string" ? input.eventId.trim() : "";
  if (!/^[A-Za-z0-9_.:-]{8,200}$/.test(eventId)) throw new PaymentValidationError("Webhook event ID is required");
  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(input.rawBody.toString("utf8")) as RazorpayWebhookPayload;
  } catch {
    throw new PaymentValidationError("Webhook payload is invalid");
  }
  const eventType = String(payload.event ?? "").slice(0, 100);
  const payment = payload.payload?.payment?.entity;
  const orderId = String(payment?.order_id ?? "");
  const paymentId = String(payment?.id ?? "");
  const nextStatus = webhookStatus(eventType, String(payment?.status ?? ""));
  if (!nextStatus || !/^order_[A-Za-z0-9_-]{8,80}$/.test(orderId) || !/^pay_[A-Za-z0-9_-]{8,80}$/.test(paymentId)) {
    return { accepted: true, ignored: true, eventId };
  }

  if (canUseLocalPaymentStorageFallback()) {
    const event = await recordLocalPaymentEvent({ eventId, eventType, orderId, paymentId, status: nextStatus });
    if (!event.record) return { accepted: true, ignored: true, eventId };
    if (event.duplicate) return { accepted: true, duplicate: true, eventId };
    if (nextStatus === "captured") {
      await verifyLocalStoredPayment(event.record.email, orderId, paymentId);
    }
    return {
      accepted: true,
      duplicate: false,
      eventId,
      status: nextStatus,
      reconciliationRequired: nextStatus === "refunded" || nextStatus === "disputed",
    };
  }

  const result = await requirePaymentStore().rpc("legal_sathi_record_razorpay_webhook", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_payment_status: nextStatus,
  });
  if (result.error) throw new PaymentStoreError("Webhook event could not be stored");
  return { accepted: true, eventId, status: nextStatus, result: String(result.data ?? "accepted") };
}

export async function listPaymentTransactions(ownerEmail: unknown, limit = 50) {
  const email = normalizeUserEmail(ownerEmail);
  if (!isValidUserEmail(email)) throw new PaymentValidationError("A valid account is required");
  if (canUseLocalPaymentStorageFallback()) {
    return (await listLocalPayments(email, limit)).map((item) => ({
      orderId: item.razorpay_order_id,
      paymentId: item.razorpay_payment_id,
      purchaseType: item.purchase_type ?? "plan",
      planId: item.plan,
      packageId: item.package_id,
      units: item.units,
      amount: item.amount,
      currency: item.currency,
      status: item.status,
      createdAt: item.created_at,
      paidAt: item.paid_at,
      reconciliationRequired: item.reconciliation_required,
    }));
  }
  const result = await requirePaymentStore()
    .from("payments")
    .select("razorpay_order_id,razorpay_payment_id,purchase_type,plan,package_id,units,amount,currency,status,created_at,paid_at,reconciliation_required")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.floor(limit))));
  if (result.error) throw new PaymentStoreError("Payment history could not be loaded");
  return result.data ?? [];
}
