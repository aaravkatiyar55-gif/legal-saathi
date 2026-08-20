import { getSupabaseClient } from "../supabase/supabaseClient";

export type CouponDiscountType = "percent" | "fixed";

export interface CouponRow {
  id: string;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  applicable_plan: string | null;
  applicable_billing_cycle: string | null;
  active: boolean;
  expires_at: string | null;
  max_redemptions: number | null;
  redeemed_count: number;
}

export interface ValidatedCoupon {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  discountPercent: number;  // always a 0-100 value for easy paise math
  baseAmount: number;       // paise
  discountAmount: number;   // paise
  finalAmount: number;      // paise (>= 100)
}

export class CouponNotFoundError extends Error {
  constructor() { super("Coupon code was not found"); }
}
export class CouponInactiveError extends Error {
  constructor() { super("This coupon is inactive"); }
}
export class CouponExpiredError extends Error {
  constructor() { super("This coupon has expired"); }
}
export class CouponRedeemedError extends Error {
  constructor() { super("This coupon has reached its redemption limit"); }
}
export class CouponPlanMismatchError extends Error {
  constructor(plan: string) { super(`This coupon does not apply to the ${plan} plan`); }
}
export class CouponBillingMismatchError extends Error {
  constructor(cycle: string) { super(`This coupon does not apply to ${cycle} billing`); }
}
export class CouponDiscountInvalidError extends Error {
  constructor() { super("Coupon discount configuration is invalid"); }
}
export class CouponStoreError extends Error {
  constructor() { super("Coupon store is not available"); }
}

function normalizeCouponCode(code: unknown): string {
  return typeof code === "string"
    ? code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40)
    : "";
}

/**
 * Looks up and validates a coupon from Supabase, then computes the final
 * payable amount in paise.  Throws a typed error on any validation failure.
 *
 * @param code        Raw coupon code string from the request body.
 * @param plan        Normalised plan id ("plus" | "pro" | "advocate").
 * @param billingCycle Normalised billing cycle ("monthly" | "yearly" | "one_time").
 * @param baseAmount  Backend-fixed base price in paise (always authoritative).
 */
export async function validateAndApplyCoupon(
  code: unknown,
  plan: string,
  billingCycle: string,
  baseAmount: number,
): Promise<ValidatedCoupon> {
  const normalizedCode = normalizeCouponCode(code);
  if (!normalizedCode) throw new CouponNotFoundError();

  const supabase = getSupabaseClient();
  if (!supabase) throw new CouponStoreError();

  const { data, error } = await supabase
    .from("payment_coupons")
    .select("id,code,discount_type,discount_value,applicable_plan,applicable_billing_cycle,active,expires_at,max_redemptions,redeemed_count")
    .eq("code", normalizedCode)
    .maybeSingle<CouponRow>();

  if (error) throw new CouponStoreError();
  if (!data) throw new CouponNotFoundError();

  // Validate active state
  if (!data.active) throw new CouponInactiveError();

  // Validate expiry
  if (data.expires_at) {
    const expiry = new Date(data.expires_at);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) {
      throw new CouponExpiredError();
    }
  }

  // Validate redemption limit
  if (
    data.max_redemptions !== null &&
    data.redeemed_count >= data.max_redemptions
  ) {
    throw new CouponRedeemedError();
  }

  // Validate plan applicability
  const couponPlan = data.applicable_plan ?? "any";
  if (couponPlan !== "any" && couponPlan !== plan) {
    throw new CouponPlanMismatchError(plan);
  }

  // Validate billing cycle applicability
  const couponCycle = data.applicable_billing_cycle ?? "any";
  if (couponCycle !== "any" && couponCycle !== billingCycle) {
    throw new CouponBillingMismatchError(billingCycle);
  }

  // Calculate discount
  let discountAmount: number;
  let discountPercent: number;

  if (data.discount_type === "percent") {
    const pct = Number(data.discount_value);
    if (!Number.isFinite(pct) || pct < 1 || pct > 90) {
      throw new CouponDiscountInvalidError();
    }
    discountPercent = pct;
    discountAmount = Math.round(baseAmount * (pct / 100));
  } else {
    // "fixed" — discount_value stored in paise
    const fixedPaise = Math.round(Number(data.discount_value));
    if (!Number.isFinite(fixedPaise) || fixedPaise <= 0) {
      throw new CouponDiscountInvalidError();
    }
    discountAmount = Math.min(fixedPaise, baseAmount - 100); // keep at least ₹1
    discountPercent = Math.round((discountAmount / baseAmount) * 100);
  }

  const finalAmount = Math.max(100, baseAmount - discountAmount);

  return {
    code: data.code,
    discountType: data.discount_type,
    discountValue: Number(data.discount_value),
    discountPercent,
    baseAmount,
    discountAmount,
    finalAmount,
  };
}

/**
 * Increments the redeemed_count for a coupon after a successful payment.
 * Errors are swallowed — failure to update the counter must not block
 * the payment verification flow.
 */
export async function incrementCouponRedemption(code: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase.rpc("increment_coupon_redeemed_count", { p_code: code });
  } catch {
    // Non-fatal — counter update is best-effort
  }
}

export async function reserveCouponForOrder(code: string, orderId: string, email: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new CouponStoreError();
  const result = await supabase.rpc("reserve_payment_coupon", {
    p_code: code,
    p_order_id: orderId,
    p_email: email,
  });
  if (result.error) throw new CouponStoreError();
  return result.data === true;
}

export async function consumeCouponReservation(orderId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new CouponStoreError();
  const result = await supabase.rpc("consume_payment_coupon_reservation", { p_order_id: orderId });
  if (result.error) throw new CouponStoreError();
  return result.data === true;
}

export async function releaseCouponReservation(orderId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.rpc("release_payment_coupon_reservation", { p_order_id: orderId });
}
