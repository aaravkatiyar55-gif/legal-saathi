import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PLAN_USAGE_LIMITS, PreviewPlan, PreviewUsageFeature } from "../../config/modelPlans";

type PreviewProfile = {
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: string;
  tier: "free" | "plus" | "pro" | "advocate";
  isBanned: boolean;
  banReason: string | null;
  createdAt: string;
  lastSeenAt: string;
  lastLoginAt: string;
  loginCount: number;
  updated_at: string;
  source: string;
};

type Coupon = {
  id: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  plans: Array<"plus" | "pro" | "max" | "advocate" | "all">;
  billingCycles: Array<"monthly" | "yearly" | "one_time" | "all">;
  maxUses: number | null;
  perUserLimit: number | null;
  expiresAt: string | null;
  active: boolean;
  redeemedCount: number;
  redemptionsByEmail: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

type UsageWindow = { count: number; windowStartedAt: string };
type CouponReservation = { code: string; email: string; status: "reserved" | "consumed"; paymentId: string | null; createdAt: string; consumedAt: string | null };
type PreviewStore = {
  profiles: Record<string, PreviewProfile>;
  coupons: Record<string, Coupon>;
  usage: Record<string, Partial<Record<PreviewUsageFeature, UsageWindow>>>;
  adminEvents: Array<{
    id: string;
    action: string;
    targetEmail?: string;
    createdAt: string;
    metadata?: Record<string, string | number | boolean | null>;
  }>;
  couponReservations: Record<string, CouponReservation>;
};

const storePath = path.resolve(process.cwd(), ".local", "preview-access.json");
const defaultStore = (): PreviewStore => ({ profiles: {}, coupons: {}, usage: {}, adminEvents: [], couponReservations: {} });
const COUPON_RESERVATION_TTL_MS = 30 * 60 * 1000;
let mutationQueue: Promise<void> = Promise.resolve();

function withStoreMutation<T>(task: (store: PreviewStore) => Promise<T> | T) {
  const run = mutationQueue.then(async () => {
    const store = await readStore();
    const result = await task(store);
    await saveStore(store);
    return result;
  });
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function readStore() {
  try {
    return { ...defaultStore(), ...(JSON.parse(await fs.readFile(storePath, "utf8")) as Partial<PreviewStore>) };
  } catch {
    return defaultStore();
  }
}

async function saveStore(store: PreviewStore) {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, storePath);
}

function currentWindowStart(windowMs: number) {
  return new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
}

export function isPreviewStoreEnabled() {
  return process.env.NODE_ENV !== "production";
}

export async function ensurePreviewProfile(input: { email: string; displayName?: string; avatarUrl?: string; provider?: string }) {
  return withStoreMutation((store) => {
    const email = normalizeEmail(input.email);
    const now = new Date().toISOString();
    const previous = store.profiles[email];
    const profile: PreviewProfile = {
      email,
      displayName: input.displayName?.trim() || previous?.displayName || email.split("@")[0] || email,
      avatarUrl: input.avatarUrl?.trim() || previous?.avatarUrl || "",
      provider: input.provider?.trim() || previous?.provider || "development",
      tier: previous?.tier || "free",
      isBanned: previous?.isBanned || false,
      banReason: previous?.banReason || null,
      createdAt: previous?.createdAt || now,
      lastSeenAt: now,
      lastLoginAt: now,
      loginCount: (previous?.loginCount || 0) + 1,
      updated_at: now,
      source: "preview_backend_store",
    };
    store.profiles[email] = profile;
    return profile;
  });
}

export async function getPreviewProfile(emailValue: string) {
  const store = await readStore();
  return store.profiles[normalizeEmail(emailValue)] || null;
}

export async function listPreviewProfiles() {
  const store = await readStore();
  return Object.values(store.profiles).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export async function updatePreviewProfile(emailValue: string, patch: Partial<Pick<PreviewProfile, "tier" | "isBanned" | "banReason">>, action?: string) {
  return withStoreMutation((store) => {
    const email = normalizeEmail(emailValue);
    const now = new Date().toISOString();
    const existing = store.profiles[email] ?? {
      email, displayName: email.split("@")[0] || email, avatarUrl: "", provider: "development", tier: "free" as const,
      isBanned: false, banReason: null, createdAt: now, lastSeenAt: now, lastLoginAt: now, loginCount: 0,
      updated_at: now, source: "preview_backend_store",
    };
    const safePatch = {
      ...patch,
      ...(typeof patch.banReason === "string" ? { banReason: patch.banReason.trim().slice(0, 500) || null } : {}),
    };
    const profile = { ...existing, ...safePatch, updated_at: now };
    store.profiles[email] = profile;
    if (action) store.adminEvents.unshift({ id: randomUUID(), action, targetEmail: email, createdAt: now });
    store.adminEvents = store.adminEvents.slice(0, 100);
    return profile;
  });
}

export async function recordPreviewAdminEvent(input: {
  id?: string;
  action: string;
  targetEmail?: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  return withStoreMutation((store) => {
    const event = {
      id: /^[A-Za-z0-9_-]{8,120}$/.test(input.id ?? "") ? input.id! : randomUUID(),
      action: input.action.trim().slice(0, 80),
      ...(input.targetEmail ? { targetEmail: normalizeEmail(input.targetEmail) } : {}),
      createdAt: new Date().toISOString(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    store.adminEvents.unshift(event);
    store.adminEvents = store.adminEvents.slice(0, 100);
    return event;
  });
}

export async function listPreviewAdminEvents() {
  const store = await readStore();
  return store.adminEvents.slice(0, 100);
}

export async function getPreviewUsage(emailValue: string, plan: PreviewPlan) {
  const store = await readStore();
  const email = normalizeEmail(emailValue);
  const saved = store.usage[email] || {};
  const features = Object.entries(PLAN_USAGE_LIMITS[plan]).map(([feature, policy]) => {
    const key = feature as PreviewUsageFeature;
    const expectedStart = currentWindowStart(policy.windowMs);
    const current = saved[key];
    const count = current?.windowStartedAt === expectedStart ? current.count : 0;
    return {
      feature: key,
      count,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      resetAt: new Date(new Date(expectedStart).getTime() + policy.windowMs).toISOString(),
    };
  });
  return { plan, features };
}

export async function consumePreviewUsage(emailValue: string, plan: PreviewPlan, feature: PreviewUsageFeature) {
  const policy = PLAN_USAGE_LIMITS[plan][feature];
  const email = normalizeEmail(emailValue);
  return withStoreMutation((store) => {
    const expectedStart = currentWindowStart(policy.windowMs);
    const saved = store.usage[email] || {};
    const current = saved[feature];
    const count = current?.windowStartedAt === expectedStart ? current.count : 0;
    const resetAt = new Date(new Date(expectedStart).getTime() + policy.windowMs).toISOString();
    if (count >= policy.limit) return { allowed: false, count, limit: policy.limit, resetAt };
    store.usage[email] = { ...saved, [feature]: { count: count + 1, windowStartedAt: expectedStart } };
    return { allowed: true, count: count + 1, limit: policy.limit, resetAt };
  });
}

export async function releasePreviewUsage(emailValue: string, feature: PreviewUsageFeature) {
  const email = normalizeEmail(emailValue);
  return withStoreMutation((store) => {
    const current = store.usage[email]?.[feature];
    if (!current || current.count <= 0) return;
    store.usage[email] = { ...(store.usage[email] || {}), [feature]: { ...current, count: current.count - 1 } };
  });
}

export async function resetPreviewUsage(emailValue: string, feature?: PreviewUsageFeature) {
  const email = normalizeEmail(emailValue);
  return withStoreMutation((store) => {
    if (feature) delete (store.usage[email] || {})[feature];
    else delete store.usage[email];
    store.adminEvents.unshift({ id: randomUUID(), action: feature ? `reset_${feature}_usage` : "reset_all_usage", targetEmail: email, createdAt: new Date().toISOString() });
  });
}

function normalizeCouponCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
}

function pruneExpiredCouponReservations(store: PreviewStore) {
  const now = Date.now();
  for (const [orderId, reservation] of Object.entries(store.couponReservations)) {
    const createdAt = new Date(reservation.createdAt).getTime();
    if (reservation.status === "reserved" && (!Number.isFinite(createdAt) || createdAt + COUPON_RESERVATION_TTL_MS <= now)) {
      delete store.couponReservations[orderId];
    }
  }
}

function positiveIntegerOrNull(value: unknown, fallback: number | null, label: string) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

export async function listPreviewCoupons() {
  const store = await readStore();
  return Object.values(store.coupons).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function savePreviewCoupon(input: Partial<Coupon> & { code: string; discountType: "percent" | "fixed"; discountValue: number }) {
  const code = normalizeCouponCode(input.code);
  if (!code) throw new Error("Coupon code is required");
  if ((input.discountType !== "percent" && input.discountType !== "fixed") || !Number.isFinite(input.discountValue) || input.discountValue <= 0 || (input.discountType === "percent" && input.discountValue > 90)) {
    throw new Error("Coupon discount must be valid and no more than 90%.");
  }
  const allowedPlans = new Set(["plus", "pro", "max", "advocate", "all"]);
  const allowedCycles = new Set(["monthly", "yearly", "one_time", "all"]);
  const requestedPlans = input.plans?.map(String) ?? null;
  const requestedCycles = input.billingCycles?.map(String) ?? null;
  if (requestedPlans?.some(value => !allowedPlans.has(value)) || requestedCycles?.some(value => !allowedCycles.has(value))) {
    throw new Error("Coupon plan or billing scope is invalid");
  }
  const expiresAt = input.expiresAt === null || input.expiresAt === ""
    ? null
    : input.expiresAt === undefined
      ? undefined
      : new Date(input.expiresAt).toISOString();

  return withStoreMutation((store) => {
    const existing = store.coupons[code];
    const now = new Date().toISOString();
    const coupon: Coupon = {
      id: existing?.id || randomUUID(), code, discountType: input.discountType, discountValue: Number(input.discountValue),
      plans: requestedPlans?.length ? requestedPlans as Coupon["plans"] : existing?.plans || ["all"],
      billingCycles: requestedCycles?.length ? requestedCycles as Coupon["billingCycles"] : existing?.billingCycles || ["all"],
      maxUses: positiveIntegerOrNull(input.maxUses, existing?.maxUses ?? null, "Coupon max uses"),
      perUserLimit: positiveIntegerOrNull(input.perUserLimit, existing?.perUserLimit ?? null, "Coupon per-user limit"),
      expiresAt: expiresAt === undefined ? existing?.expiresAt || null : expiresAt, active: input.active ?? existing?.active ?? true,
      redeemedCount: existing?.redeemedCount || 0, redemptionsByEmail: existing?.redemptionsByEmail || {}, createdAt: existing?.createdAt || now, updatedAt: now,
    };
    store.coupons[code] = coupon;
    return coupon;
  });
}

export async function disablePreviewCoupon(codeValue: string) {
  return withStoreMutation((store) => {
    const code = normalizeCouponCode(codeValue);
    const coupon = store.coupons[code];
    if (!coupon) throw new Error("Coupon code was not found");
    coupon.active = false;
    coupon.updatedAt = new Date().toISOString();
    store.coupons[code] = coupon;
    return coupon;
  });
}

export async function deletePreviewCoupon(codeValue: string) {
  return withStoreMutation((store) => {
    pruneExpiredCouponReservations(store);
    const code = normalizeCouponCode(codeValue);
    if (Object.values(store.couponReservations).some(reservation => reservation.code === code && reservation.status === "reserved")) {
      throw new Error("Coupon has an active payment reservation and cannot be deleted");
    }
    delete store.coupons[code];
  });
}

export async function validatePreviewCoupon(input: { code: string; plan: "plus" | "pro" | "max" | "advocate"; billingCycle: "monthly" | "yearly" | "one_time"; amount: number; email?: string }) {
  const store = await readStore();
  const coupon = store.coupons[normalizeCouponCode(input.code)];
  if (!coupon) throw new Error("Coupon code was not found");
  if (!coupon.active) throw new Error("This coupon is inactive");
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= Date.now()) throw new Error("This coupon has expired");
  if (!coupon.plans.includes("all") && !coupon.plans.includes(input.plan)) throw new Error(`This coupon does not apply to the ${input.plan} plan`);
  if (!coupon.billingCycles.includes("all") && !coupon.billingCycles.includes(input.billingCycle)) throw new Error(`This coupon does not apply to ${input.billingCycle} billing`);
  if (coupon.maxUses !== null && coupon.redeemedCount >= coupon.maxUses) throw new Error("This coupon has reached its redemption limit");
  const email = input.email ? normalizeEmail(input.email) : "";
  if (email && coupon.perUserLimit !== null && (coupon.redemptionsByEmail[email] || 0) >= coupon.perUserLimit) throw new Error("You have reached this coupon's per-user limit");
  const discountAmount = coupon.discountType === "percent" ? Math.floor(input.amount * (coupon.discountValue / 100)) : Math.min(input.amount - 100, Math.round(coupon.discountValue));
  return { coupon, discountAmount: Math.max(0, discountAmount), finalAmount: Math.max(100, input.amount - Math.max(0, discountAmount)) };
}

export async function redeemPreviewCoupon(codeValue: string, emailValue: string) {
  void codeValue;
  void emailValue;
  throw new Error("DIRECT_COUPON_REDEMPTION_DISABLED");
}

export async function reservePreviewCoupon(codeValue: string, orderId: string, emailValue: string) {
  return withStoreMutation((store) => {
    pruneExpiredCouponReservations(store);
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(orderId)) return false;
    if (store.couponReservations[orderId]) return false;
    const code = normalizeCouponCode(codeValue);
    const email = normalizeEmail(emailValue);
    const coupon = store.coupons[code];
    if (!coupon || !coupon.active || (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= Date.now())) return false;
    const reserved = Object.values(store.couponReservations).filter(item => item.code === code && item.status === "reserved");
    if (coupon.maxUses !== null && coupon.redeemedCount + reserved.length >= coupon.maxUses) return false;
    const userReserved = reserved.filter(item => item.email === email).length;
    if (coupon.perUserLimit !== null && (coupon.redemptionsByEmail[email] || 0) + userReserved >= coupon.perUserLimit) return false;
    store.couponReservations[orderId] = { code, email, status: "reserved", paymentId: null, createdAt: new Date().toISOString(), consumedAt: null };
    return true;
  });
}

export async function consumePreviewCouponReservation(orderId: string, paymentId: string, emailValue: string) {
  return withStoreMutation((store) => {
    pruneExpiredCouponReservations(store);
    const reservation = store.couponReservations[orderId];
    const email = normalizeEmail(emailValue);
    if (!reservation || reservation.email !== email) return false;
    if (reservation.status === "consumed") return reservation.paymentId === paymentId;
    const coupon = store.coupons[reservation.code];
    if (!coupon) return false;
    reservation.status = "consumed";
    reservation.paymentId = paymentId;
    reservation.consumedAt = new Date().toISOString();
    coupon.redeemedCount += 1;
    coupon.redemptionsByEmail[email] = (coupon.redemptionsByEmail[email] || 0) + 1;
    coupon.updatedAt = new Date().toISOString();
    store.couponReservations[orderId] = reservation;
    store.coupons[coupon.code] = coupon;
    return true;
  });
}

export async function releasePreviewCouponReservation(orderId: string) {
  return withStoreMutation((store) => {
    if (store.couponReservations[orderId]?.status === "reserved") delete store.couponReservations[orderId];
  });
}
