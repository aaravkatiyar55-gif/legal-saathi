import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/env";
import {
  normalizeProductPlan,
  PLAN_CYCLE_DAYS,
  PRODUCT_PLANS,
  ProductModelClass,
  ProductPlanId,
  ProductSpeed,
  ProductThinkingMode,
} from "../../config/productPolicy";
import { getSupabaseClient } from "../supabase/supabaseClient";

export type PlanAccount = {
  planId: ProductPlanId;
  planStartedAt: string;
  planExpiresAt: string;
  cycleStartedAt: string;
  cycleEndsAt: string;
  includedUnitsTotal: number;
  includedUnitsRemaining: number;
  purchasedUnitsRemaining: number;
  updatedAt: string;
};

export type UnitUsageMetadata = {
  requestId: string;
  requestFingerprint: string;
  selectedModel: ProductModelClass;
  resolvedModel: ProductModelClass;
  thinkingMode: ProductThinkingMode;
  speed: ProductSpeed;
  webEnabled: boolean;
  contextUsed: boolean;
  contextCharacters: number;
};

type UnitReservation = {
  requestId: string;
  email: string;
  estimatedUnits: number;
  includedReserved: number;
  purchasedReserved: number;
  chargedUnits: number;
  refundedUnits: number;
  status: "reserved" | "finalized" | "refunded";
  metadata: UnitUsageMetadata;
  createdAt: string;
  settledAt: string | null;
};

export type UnitTransaction = {
  id: string;
  email: string;
  type: "plan_allocation" | "topup_purchase" | "usage_charge" | "usage_refund" | "usage_reconciliation" | "plan_expired";
  units: number;
  requestId: string | null;
  referenceId: string | null;
  planId: ProductPlanId;
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
};

type LocalLedger = {
  version: 1;
  accounts: Record<string, PlanAccount>;
  reservations: Record<string, UnitReservation>;
  transactions: UnitTransaction[];
};

export class CreditLedgerUnavailableError extends Error {
  constructor(message = "Atomic credit storage is unavailable.") {
    super(message);
  }
}

export class InsufficientUnitsError extends Error {
  constructor(public readonly availableUnits: number, public readonly requiredUnits: number) {
    super("There are not enough units for this request.");
  }
}

export class CreditLedgerValidationError extends Error {}

const localLedgerPath = path.resolve(process.cwd(), env.productLedgerPath);
const cycleMs = PLAN_CYCLE_DAYS * 24 * 60 * 60 * 1000;
let localQueue: Promise<void> = Promise.resolve();

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CreditLedgerValidationError("A verified account is required for plan usage.");
  }
  return email;
}

function requireRequestId(value: string) {
  const requestId = value.trim();
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(requestId)) {
    throw new CreditLedgerValidationError("A valid request ID is required.");
  }
  return requestId;
}

function requirePositiveUnits(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 100_000) {
    throw new CreditLedgerValidationError("Unit amount is outside the allowed range.");
  }
  return value;
}

function localLedgerEnabled() {
  return env.nodeEnv !== "production" && env.productLedgerBackend === "local";
}

function defaultLedger(): LocalLedger {
  return { version: 1, accounts: {}, reservations: {}, transactions: [] };
}

async function readLocalLedger(): Promise<LocalLedger> {
  try {
    const parsed = JSON.parse(await fs.readFile(localLedgerPath, "utf8")) as Partial<LocalLedger>;
    return {
      version: 1,
      accounts: parsed.accounts ?? {},
      reservations: parsed.reservations ?? {},
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions.slice(0, 5_000) : [],
    };
  } catch {
    return defaultLedger();
  }
}

async function writeLocalLedger(ledger: LocalLedger) {
  await fs.mkdir(path.dirname(localLedgerPath), { recursive: true });
  const temporaryPath = `${localLedgerPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, localLedgerPath);
}

function withLocalLedger<T>(task: (ledger: LocalLedger) => T | Promise<T>) {
  const run = localQueue.then(async () => {
    const ledger = await readLocalLedger();
    const result = await task(ledger);
    ledger.transactions = ledger.transactions.slice(0, 5_000);
    await writeLocalLedger(ledger);
    return result;
  }, async () => {
    const ledger = await readLocalLedger();
    const result = await task(ledger);
    ledger.transactions = ledger.transactions.slice(0, 5_000);
    await writeLocalLedger(ledger);
    return result;
  });
  localQueue = run.then(() => undefined, () => undefined);
  return run;
}

function makePlanAccount(planId: ProductPlanId, now = new Date(), planDurationDays = PLAN_CYCLE_DAYS): PlanAccount {
  const policy = PRODUCT_PLANS[planId];
  const durationMs = Math.max(PLAN_CYCLE_DAYS, Math.min(366, Math.floor(planDurationDays))) * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + durationMs).toISOString();
  const cycleEndsAt = new Date(now.getTime() + Math.min(cycleMs, durationMs)).toISOString();
  return {
    planId,
    planStartedAt: now.toISOString(),
    planExpiresAt: expiresAt,
    cycleStartedAt: now.toISOString(),
    cycleEndsAt,
    includedUnitsTotal: policy.includedUnits,
    includedUnitsRemaining: policy.includedUnits,
    purchasedUnitsRemaining: 0,
    updatedAt: now.toISOString(),
  };
}

function appendTransaction(ledger: LocalLedger, transaction: Omit<UnitTransaction, "id" | "createdAt">) {
  ledger.transactions.unshift({ id: randomUUID(), createdAt: new Date().toISOString(), ...transaction });
}

function reconcileLocalAccount(ledger: LocalLedger, email: string, bootstrapTier: unknown) {
  const now = new Date();
  let account = ledger.accounts[email];
  if (!account) {
    account = makePlanAccount(normalizeProductPlan(bootstrapTier), now);
    ledger.accounts[email] = account;
    appendTransaction(ledger, {
      email,
      type: "plan_allocation",
      units: account.includedUnitsTotal,
      requestId: null,
      referenceId: "profile_bootstrap",
      planId: account.planId,
      metadata: { source: "profile_bootstrap" },
    });
    return account;
  }

  if (new Date(account.planExpiresAt).getTime() <= now.getTime()) {
    const previousPlan = account.planId;
    const purchasedUnits = Math.max(0, Math.floor(account.purchasedUnitsRemaining || 0));
    account = makePlanAccount("free", now);
    account.purchasedUnitsRemaining = purchasedUnits;
    ledger.accounts[email] = account;
    appendTransaction(ledger, {
      email,
      type: "plan_expired",
      units: 0,
      requestId: null,
      referenceId: null,
      planId: "free",
      metadata: { previousPlan },
    });
    return account;
  }

  if (new Date(account.cycleEndsAt).getTime() <= now.getTime()) {
    const policy = PRODUCT_PLANS[account.planId];
    account.cycleStartedAt = now.toISOString();
    account.cycleEndsAt = new Date(now.getTime() + cycleMs).toISOString();
    account.includedUnitsTotal = policy.includedUnits;
    account.includedUnitsRemaining = policy.includedUnits;
    account.updatedAt = now.toISOString();
    ledger.accounts[email] = account;
    appendTransaction(ledger, {
      email,
      type: "plan_allocation",
      units: policy.includedUnits,
      requestId: null,
      referenceId: "cycle_reset",
      planId: account.planId,
      metadata: { source: "cycle_reset" },
    });
  }
  return account;
}

function parseSupabaseAccount(value: unknown): PlanAccount {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
  if (!row) throw new CreditLedgerUnavailableError();
  const planId = normalizeProductPlan(row.plan_id ?? row.planId);
  const account: PlanAccount = {
    planId,
    planStartedAt: String(row.plan_started_at ?? row.planStartedAt ?? ""),
    planExpiresAt: String(row.plan_expires_at ?? row.planExpiresAt ?? ""),
    cycleStartedAt: String(row.cycle_started_at ?? row.cycleStartedAt ?? ""),
    cycleEndsAt: String(row.cycle_ends_at ?? row.cycleEndsAt ?? ""),
    includedUnitsTotal: Number(row.included_units_total ?? row.includedUnitsTotal),
    includedUnitsRemaining: Number(row.included_units_remaining ?? row.includedUnitsRemaining),
    purchasedUnitsRemaining: Number(row.purchased_units_remaining ?? row.purchasedUnitsRemaining),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ""),
  };
  if (![account.includedUnitsTotal, account.includedUnitsRemaining, account.purchasedUnitsRemaining].every(Number.isFinite)) {
    throw new CreditLedgerUnavailableError();
  }
  return account;
}

async function callLedgerRpc(name: string, args: Record<string, unknown>) {
  const supabase = getSupabaseClient();
  if (!supabase || env.productLedgerBackend !== "supabase") throw new CreditLedgerUnavailableError();
  const result = await supabase.rpc(name, args);
  if (result.error) throw new CreditLedgerUnavailableError();
  return result.data;
}

export async function getPlanAccount(emailValue: string, bootstrapTier: unknown) {
  const email = normalizeEmail(emailValue);
  if (localLedgerEnabled()) {
    return withLocalLedger((ledger) => ({ ...reconcileLocalAccount(ledger, email, bootstrapTier) }));
  }
  const data = await callLedgerRpc("legal_sathi_get_plan_state", {
    p_email: email,
    p_bootstrap_plan: normalizeProductPlan(bootstrapTier),
  });
  return parseSupabaseAccount(data);
}

export async function grantPlan(input: { email: string; planId: ProductPlanId; source: "payment" | "admin"; referenceId: string; durationDays?: number }) {
  const email = normalizeEmail(input.email);
  const planId = normalizeProductPlan(input.planId);
  const referenceId = requireRequestId(input.referenceId);
  if (planId === "free" && input.source === "payment") throw new CreditLedgerValidationError("Free plan cannot be granted by payment.");
  if (localLedgerEnabled()) {
    return withLocalLedger((ledger) => {
      const existing = ledger.transactions.find((item) => item.type === "plan_allocation" && item.referenceId === referenceId);
      if (existing) {
        if (existing.email !== email || existing.planId !== planId) throw new CreditLedgerValidationError("Plan grant reference is already bound.");
        return { ...reconcileLocalAccount(ledger, email, planId), idempotent: true };
      }
      const previous = ledger.accounts[email];
      const durationDays = input.durationDays === undefined ? PLAN_CYCLE_DAYS : Math.floor(Number(input.durationDays));
      if (!Number.isFinite(durationDays) || durationDays < PLAN_CYCLE_DAYS || durationDays > 366) {
        throw new CreditLedgerValidationError("Plan duration is invalid.");
      }
      const account = makePlanAccount(planId, new Date(), durationDays);
      account.purchasedUnitsRemaining = Math.max(0, previous?.purchasedUnitsRemaining ?? 0);
      ledger.accounts[email] = account;
      appendTransaction(ledger, {
        email,
        type: "plan_allocation",
        units: account.includedUnitsTotal,
        requestId: null,
        referenceId,
        planId,
        metadata: { source: input.source, durationDays },
      });
      return { ...account, idempotent: false };
    });
  }
  const data = await callLedgerRpc("legal_sathi_grant_plan", {
    p_email: email,
    p_plan_id: planId,
    p_source: input.source,
    p_reference_id: referenceId,
  });
  return { ...parseSupabaseAccount(data), idempotent: false };
}

export async function grantTopUp(input: { email: string; units: number; paymentId: string; bootstrapTier: unknown }) {
  const email = normalizeEmail(input.email);
  const units = requirePositiveUnits(input.units);
  const paymentId = requireRequestId(input.paymentId);
  if (localLedgerEnabled()) {
    return withLocalLedger((ledger) => {
      const account = reconcileLocalAccount(ledger, email, input.bootstrapTier);
      if (!PRODUCT_PLANS[account.planId].allowsTopUps) throw new CreditLedgerValidationError("Top-ups are not available on this plan.");
      const existing = ledger.transactions.find((item) => item.type === "topup_purchase" && item.referenceId === paymentId);
      if (existing) {
        if (existing.email !== email || existing.units !== units) throw new CreditLedgerValidationError("Top-up payment is already bound.");
        return { ...account, idempotent: true };
      }
      account.purchasedUnitsRemaining += units;
      account.updatedAt = new Date().toISOString();
      ledger.accounts[email] = account;
      appendTransaction(ledger, {
        email,
        type: "topup_purchase",
        units,
        requestId: null,
        referenceId: paymentId,
        planId: account.planId,
        metadata: { source: "verified_payment", testMode: true },
      });
      return { ...account, idempotent: false };
    });
  }
  const data = await callLedgerRpc("legal_sathi_grant_topup", {
    p_email: email,
    p_units: units,
    p_payment_id: paymentId,
  });
  return { ...parseSupabaseAccount(data), idempotent: false };
}

export async function reserveRequestUnits(input: { email: string; bootstrapTier: unknown; estimatedUnits: number; metadata: UnitUsageMetadata }) {
  const email = normalizeEmail(input.email);
  const requestId = requireRequestId(input.metadata.requestId);
  const estimatedUnits = requirePositiveUnits(input.estimatedUnits);
  if (localLedgerEnabled()) {
    return withLocalLedger((ledger) => {
      const existing = ledger.reservations[requestId];
      if (existing) {
        if (existing.email !== email || existing.estimatedUnits !== estimatedUnits) throw new CreditLedgerValidationError("Request ID is already bound to different usage.");
        const account = reconcileLocalAccount(ledger, email, input.bootstrapTier);
        const existingFingerprint = existing.metadata.requestFingerprint;
        if (!existingFingerprint || existingFingerprint !== input.metadata.requestFingerprint) {
          if (!existingFingerprint) return { reservation: { ...existing }, account: { ...account }, idempotent: true, retried: false };
          throw new CreditLedgerValidationError("Request ID is already bound to different usage.");
        }
        if (existing.status !== "refunded") {
          return { reservation: { ...existing }, account: { ...account }, idempotent: true, retried: false };
        }
        const available = account.includedUnitsRemaining + account.purchasedUnitsRemaining;
        if (available < estimatedUnits) throw new InsufficientUnitsError(available, estimatedUnits);
        const includedReserved = Math.min(account.includedUnitsRemaining, estimatedUnits);
        const purchasedReserved = estimatedUnits - includedReserved;
        account.includedUnitsRemaining -= includedReserved;
        account.purchasedUnitsRemaining -= purchasedReserved;
        account.updatedAt = new Date().toISOString();
        existing.includedReserved = includedReserved;
        existing.purchasedReserved = purchasedReserved;
        existing.chargedUnits = 0;
        existing.refundedUnits = 0;
        existing.status = "reserved";
        existing.metadata = { ...input.metadata, requestId };
        existing.settledAt = null;
        ledger.accounts[email] = account;
        ledger.reservations[requestId] = existing;
        return { reservation: { ...existing }, account: { ...account }, idempotent: false, retried: true };
      }
      const account = reconcileLocalAccount(ledger, email, input.bootstrapTier);
      const available = account.includedUnitsRemaining + account.purchasedUnitsRemaining;
      if (available < estimatedUnits) throw new InsufficientUnitsError(available, estimatedUnits);
      const includedReserved = Math.min(account.includedUnitsRemaining, estimatedUnits);
      const purchasedReserved = estimatedUnits - includedReserved;
      account.includedUnitsRemaining -= includedReserved;
      account.purchasedUnitsRemaining -= purchasedReserved;
      account.updatedAt = new Date().toISOString();
      const reservation: UnitReservation = {
        requestId,
        email,
        estimatedUnits,
        includedReserved,
        purchasedReserved,
        chargedUnits: 0,
        refundedUnits: 0,
        status: "reserved",
        metadata: { ...input.metadata, requestId },
        createdAt: new Date().toISOString(),
        settledAt: null,
      };
      ledger.accounts[email] = account;
      ledger.reservations[requestId] = reservation;
      return { reservation: { ...reservation }, account: { ...account }, idempotent: false, retried: false };
    });
  }
  const data = await callLedgerRpc("legal_sathi_reserve_units", {
    p_email: email,
    p_request_id: requestId,
    p_estimated_units: estimatedUnits,
    p_metadata: input.metadata,
  });
  const result = data as { allowed?: boolean; available_units?: number; account?: unknown; idempotent?: boolean; retried?: boolean };
  if (result?.allowed === false) throw new InsufficientUnitsError(Number(result.available_units || 0), estimatedUnits);
  return {
    reservation: null,
    account: parseSupabaseAccount(result?.account ?? data),
    idempotent: Boolean(result?.idempotent),
    retried: Boolean(result?.retried),
  };
}

export async function finalizeRequestUnits(input: { email: string; requestId: string; actualUnits: number }) {
  const email = normalizeEmail(input.email);
  const requestId = requireRequestId(input.requestId);
  const actualUnits = requirePositiveUnits(input.actualUnits);
  if (localLedgerEnabled()) {
    return withLocalLedger((ledger) => {
      const reservation = ledger.reservations[requestId];
      if (!reservation || reservation.email !== email) throw new CreditLedgerValidationError("Usage reservation was not found.");
      if (actualUnits > reservation.estimatedUnits) throw new CreditLedgerValidationError("Final usage exceeds its reservation.");
      const account = reconcileLocalAccount(ledger, email, "free");
      if (reservation.status === "finalized") return { reservation: { ...reservation }, account: { ...account }, idempotent: true };
      if (reservation.status === "refunded") throw new CreditLedgerValidationError("Refunded usage cannot be finalized.");
      const difference = reservation.estimatedUnits - actualUnits;
      if (difference > 0) {
        const purchasedRefund = Math.min(reservation.purchasedReserved, difference);
        const includedRefund = difference - purchasedRefund;
        account.purchasedUnitsRemaining += purchasedRefund;
        account.includedUnitsRemaining = Math.min(account.includedUnitsTotal, account.includedUnitsRemaining + includedRefund);
        appendTransaction(ledger, {
          email,
          type: "usage_reconciliation",
          units: difference,
          requestId,
          referenceId: null,
          planId: account.planId,
          metadata: { outcome: "final_cost_lower" },
        });
      }
      reservation.chargedUnits = actualUnits;
      reservation.refundedUnits = difference;
      reservation.status = "finalized";
      reservation.settledAt = new Date().toISOString();
      account.updatedAt = reservation.settledAt;
      ledger.accounts[email] = account;
      ledger.reservations[requestId] = reservation;
      appendTransaction(ledger, {
        email,
        type: "usage_charge",
        units: actualUnits,
        requestId,
        referenceId: null,
        planId: account.planId,
        metadata: {
          selectedModel: reservation.metadata.selectedModel,
          resolvedModel: reservation.metadata.resolvedModel,
          thinkingMode: reservation.metadata.thinkingMode,
          speed: reservation.metadata.speed,
          webEnabled: reservation.metadata.webEnabled,
          contextUsed: reservation.metadata.contextUsed,
          contextCharacters: reservation.metadata.contextCharacters,
          outcome: "success",
        },
      });
      return { reservation: { ...reservation }, account: { ...account }, idempotent: false };
    });
  }
  const data = await callLedgerRpc("legal_sathi_finalize_units", {
    p_email: email,
    p_request_id: requestId,
    p_actual_units: actualUnits,
  });
  return { reservation: null, account: parseSupabaseAccount(data), idempotent: false };
}

export async function refundRequestUnits(input: { email: string; requestId: string; outcome: "provider_failure" | "request_cancelled" | "internal_failure" }) {
  const email = normalizeEmail(input.email);
  const requestId = requireRequestId(input.requestId);
  if (localLedgerEnabled()) {
    return withLocalLedger((ledger) => {
      const reservation = ledger.reservations[requestId];
      if (!reservation || reservation.email !== email) return null;
      const account = reconcileLocalAccount(ledger, email, "free");
      if (reservation.status === "refunded") return { reservation: { ...reservation }, account: { ...account }, idempotent: true };
      if (reservation.status === "finalized") return { reservation: { ...reservation }, account: { ...account }, idempotent: true };
      account.includedUnitsRemaining = Math.min(account.includedUnitsTotal, account.includedUnitsRemaining + reservation.includedReserved);
      account.purchasedUnitsRemaining += reservation.purchasedReserved;
      account.updatedAt = new Date().toISOString();
      reservation.status = "refunded";
      reservation.refundedUnits = reservation.estimatedUnits;
      reservation.settledAt = account.updatedAt;
      ledger.accounts[email] = account;
      ledger.reservations[requestId] = reservation;
      appendTransaction(ledger, {
        email,
        type: "usage_refund",
        units: reservation.estimatedUnits,
        requestId,
        referenceId: null,
        planId: account.planId,
        metadata: { outcome: input.outcome },
      });
      return { reservation: { ...reservation }, account: { ...account }, idempotent: false };
    });
  }
  const data = await callLedgerRpc("legal_sathi_refund_units", {
    p_email: email,
    p_request_id: requestId,
    p_outcome: input.outcome,
  });
  return { reservation: null, account: parseSupabaseAccount(data), idempotent: false };
}

export async function listUnitTransactions(emailValue: string, limit = 50) {
  const email = normalizeEmail(emailValue);
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  if (localLedgerEnabled()) {
    const ledger = await readLocalLedger();
    return ledger.transactions.filter((item) => item.email === email).slice(0, boundedLimit);
  }
  const data = await callLedgerRpc("legal_sathi_list_unit_transactions", {
    p_email: email,
    p_limit: boundedLimit,
  });
  return Array.isArray(data) ? data : [];
}

export function isLocalCreditLedgerEnabled() {
  return localLedgerEnabled();
}
