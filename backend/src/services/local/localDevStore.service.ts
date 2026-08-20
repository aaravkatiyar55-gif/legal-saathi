import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { CaseIntakeSummary } from "../ai/openRouterProvider";
import { UserTier } from "../supabase/onlineUsers.service";
import { assertCaseFolderCapacity } from "../legal/caseCapacity.service";

type LocalCaseRow = {
  id: string;
  user_id: string | null;
  owner_email: string | null;
  title: string;
  case_type: string;
  user_role: string;
  short_summary: string;
  important_facts: string[];
  important_dates: string[];
  parties: string[];
  relief_wanted: string[];
  missing_information: string[];
  risk_flags: string[];
  questions_for_user: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type LocalCaseMemoryRow = {
  id: string;
  case_id: string;
  current_summary: string;
  facts_json: Record<string, unknown>;
  contradictions_json: unknown[];
  last_updated_at: string;
};

type LocalCasesFile = {
  cases: LocalCaseRow[];
  memories: LocalCaseMemoryRow[];
};

type LocalUserProfile = {
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: string;
  tier: UserTier;
  isBanned: boolean;
  banReason: string | null;
  createdAt: string;
  lastSeenAt: string;
  lastLoginAt: string;
  loginCount: number;
  updated_at: string;
  source: "local_payment_test" | "local_profile_fallback";
};

type LocalUserProfilesFile = {
  profiles: Record<string, LocalUserProfile>;
};

type LocalPaymentRecord = {
  email: string;
  purchase_type: "plan" | "topup";
  plan: "plus" | "pro" | "max" | "advocate" | null;
  package_id: string | null;
  units: number;
  product_catalog_version: string;
  billing_cycle: "monthly" | "yearly" | "one_time";
  amount: number;
  currency: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  status: "created" | "authorized" | "captured" | "failed" | "refunded" | "disputed";
  coupon_code: string | null;
  created_at: string;
  paid_at: string | null;
  updated_at: string;
  reconciliation_required: boolean;
};

type LocalPaymentsFile = {
  payments: Record<string, LocalPaymentRecord>;
  webhook_events?: Record<string, { eventId: string; eventType: string; orderId: string; paymentId: string | null; receivedAt: string }>;
};

const localRoot = path.resolve(process.cwd(), ".local");
const casesPath = path.resolve(process.cwd(), process.env.LOCAL_CASES_STORE_PATH || path.join(".local", "cases.json"));
const userProfilesPath = path.join(localRoot, "user-profiles.json");
const paymentsPath = path.join(localRoot, "payments.json");
let paymentQueue: Promise<void> = Promise.resolve();
let caseQueue: Promise<void> = Promise.resolve();

function withPaymentLock<T>(task: () => Promise<T>) {
  const run = paymentQueue.then(task, task);
  paymentQueue = run.then(() => undefined, () => undefined);
  return run;
}

function withCaseLock<T>(task: () => Promise<T>) {
  const run = caseQueue.then(task, task);
  caseQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function ensureLocalRoot() {
  await fs.mkdir(localRoot, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile<T>(filePath: string, data: T) {
  await ensureLocalRoot();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporaryPath, filePath);
}

function normalizeEmail(value?: string) {
  return value?.trim().toLowerCase() || "";
}

function titleFromSummary(summary: CaseIntakeSummary, title?: string) {
  if (title?.trim()) return title.trim();
  if (summary.shortSummary.trim()) return summary.shortSummary.trim().slice(0, 80);
  return "Untitled Legal Saathi Case";
}

export async function listLocalCases(ownerEmail?: string, includeAll = false) {
  const store = await readJsonFile<LocalCasesFile>(casesPath, { cases: [], memories: [] });
  const email = normalizeEmail(ownerEmail);
  if (!includeAll && !email) {
    return [];
  }
  return store.cases
    .filter((caseItem) => !caseItem.deleted_at)
    .filter((caseItem) => includeAll || caseItem.user_id === email || caseItem.owner_email === email)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 50);
}

function activeCaseCount(store: LocalCasesFile, ownerEmail: string) {
  return store.cases.filter((item) => !item.deleted_at && (item.user_id === ownerEmail || item.owner_email === ownerEmail)).length;
}

export async function getLocalActiveCaseCount(ownerEmail: string) {
  const store = await readJsonFile<LocalCasesFile>(casesPath, { cases: [], memories: [] });
  return activeCaseCount(store, normalizeEmail(ownerEmail));
}

export async function assertLocalCaseCapacity(ownerEmail: string, maximumActiveCases: number) {
  return withCaseLock(async () => {
    const store = await readJsonFile<LocalCasesFile>(casesPath, { cases: [], memories: [] });
    assertCaseFolderCapacity(activeCaseCount(store, normalizeEmail(ownerEmail)), maximumActiveCases);
  });
}

export async function createLocalCaseFromSummary(
  summary: CaseIntakeSummary,
  title?: string,
  ownerEmail?: string,
  maximumActiveCases = Number.MAX_SAFE_INTEGER,
  userProvidedIntakeText = "",
) {
  return withCaseLock(async () => {
    const store = await readJsonFile<LocalCasesFile>(casesPath, { cases: [], memories: [] });
    const now = new Date().toISOString();
    const email = normalizeEmail(ownerEmail);
    assertCaseFolderCapacity(activeCaseCount(store, email), maximumActiveCases);
    const caseRow: LocalCaseRow = {
      id: randomUUID(),
      user_id: email || null,
      owner_email: email || null,
      title: titleFromSummary(summary, title),
      case_type: summary.caseType,
      user_role: summary.userRole,
      short_summary: summary.shortSummary,
      important_facts: summary.importantFacts,
      important_dates: summary.importantDates,
      parties: summary.parties,
      relief_wanted: summary.reliefWanted,
      missing_information: summary.missingInformation,
      risk_flags: summary.riskFlags,
      questions_for_user: summary.questionsForUser,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    const memoryRow: LocalCaseMemoryRow = {
      id: randomUUID(),
      case_id: caseRow.id,
      current_summary: summary.shortSummary,
      facts_json: {
        importantFacts: summary.importantFacts,
        importantDates: summary.importantDates,
        parties: summary.parties,
        reliefWanted: summary.reliefWanted,
        missingInformation: summary.missingInformation,
        riskFlags: summary.riskFlags,
        questionsForUser: summary.questionsForUser,
        userProvidedIntakeText: userProvidedIntakeText.trim().slice(0, 20_000),
        analysisStatus: userProvidedIntakeText.trim() ? "pending" : "not_requested",
        analysisAttemptedAt: null,
        analysisErrorCode: null,
      },
      contradictions_json: [],
      last_updated_at: now,
    };
    store.cases.unshift(caseRow);
    store.memories.unshift(memoryRow);
    await writeJsonFile(casesPath, store);
    return { case: caseRow, memory: memoryRow };
  });
}

// Applies AI-generated summary fields to an already-persisted local case.
// Owner-scoped: only updates if the case belongs to ownerEmail.
// Called fire-and-forget; failures are non-fatal.
export async function updateLocalCaseWithSummary(
  caseId: string,
  ownerEmail: string,
  summary: CaseIntakeSummary,
  analysisStatus: "completed" | "failed" = "completed",
) {
  return withCaseLock(async () => {
    const store = await readJsonFile<LocalCasesFile>(casesPath, { cases: [], memories: [] });
    const email = normalizeEmail(ownerEmail);
    const caseRow = store.cases.find(
      (item) => item.id === caseId && !item.deleted_at && (item.user_id === email || item.owner_email === email),
    );
    if (!caseRow) return null;
    const now = new Date().toISOString();
    caseRow.case_type = summary.caseType;
    caseRow.user_role = summary.userRole;
    caseRow.short_summary = summary.shortSummary;
    caseRow.important_facts = summary.importantFacts;
    caseRow.important_dates = summary.importantDates;
    caseRow.parties = summary.parties;
    caseRow.relief_wanted = summary.reliefWanted;
    caseRow.missing_information = summary.missingInformation;
    caseRow.risk_flags = summary.riskFlags;
    caseRow.questions_for_user = summary.questionsForUser;
    caseRow.updated_at = now;
    // Update the most recent memory entry for this case
    const memory = store.memories
      .filter((m) => m.case_id === caseId)
      .sort((a, b) => new Date(b.last_updated_at).getTime() - new Date(a.last_updated_at).getTime())[0];
    if (memory) {
      memory.current_summary = summary.shortSummary;
      memory.facts_json = {
        ...memory.facts_json,
        importantFacts: summary.importantFacts,
        importantDates: summary.importantDates,
        parties: summary.parties,
        reliefWanted: summary.reliefWanted,
        missingInformation: summary.missingInformation,
        riskFlags: summary.riskFlags,
        questionsForUser: summary.questionsForUser,
        analysisStatus,
        analysisAttemptedAt: now,
        analysisErrorCode: analysisStatus === "failed" ? "AI_PROVIDER_TEMPORARILY_UNAVAILABLE" : null,
      };
      memory.last_updated_at = now;
    }
    await writeJsonFile(casesPath, store);
    return caseRow;
  });
}

export async function getLocalCaseWithMemory(caseId: string, ownerEmail?: string, includeAll = false) {
  const store = await readJsonFile<LocalCasesFile>(casesPath, { cases: [], memories: [] });
  const email = normalizeEmail(ownerEmail);
  if (!includeAll && !email) {
    return { case: null, memory: null };
  }
  const caseRow =
    store.cases.find((item) => {
      if (item.id !== caseId || item.deleted_at) return false;
      return includeAll || item.user_id === email || item.owner_email === email;
    }) ?? null;
  if (!caseRow) return { case: null, memory: null };
  const memory = store.memories
    .filter((item) => item.case_id === caseId)
    .sort((left, right) => new Date(right.last_updated_at).getTime() - new Date(left.last_updated_at).getTime())[0] ?? null;
  return { case: caseRow, memory };
}

export async function softDeleteLocalCase(caseId: string, ownerEmail: string) {
  return withCaseLock(async () => {
    const store = await readJsonFile<LocalCasesFile>(casesPath, { cases: [], memories: [] });
    const email = normalizeEmail(ownerEmail);
    const caseRow = store.cases.find((item) => item.id === caseId && !item.deleted_at && (item.user_id === email || item.owner_email === email));
    if (!caseRow) return null;
    const now = new Date().toISOString();
    caseRow.deleted_at = now;
    caseRow.updated_at = now;
    await writeJsonFile(casesPath, store);
    return { id: caseRow.id, deletedAt: now };
  });
}

export async function restoreLocalCase(caseId: string, ownerEmail: string, maximumActiveCases = Number.MAX_SAFE_INTEGER) {
  return withCaseLock(async () => {
    const store = await readJsonFile<LocalCasesFile>(casesPath, { cases: [], memories: [] });
    const email = normalizeEmail(ownerEmail);
    const caseRow = store.cases.find((item) => item.id === caseId && Boolean(item.deleted_at) && (item.user_id === email || item.owner_email === email));
    if (!caseRow) return null;
    assertCaseFolderCapacity(activeCaseCount(store, email), maximumActiveCases);
    caseRow.deleted_at = null;
    caseRow.updated_at = new Date().toISOString();
    await writeJsonFile(casesPath, store);
    return caseRow;
  });
}

export async function setLocalUserTier(emailValue: string, tierValue: UserTier) {
  const email = normalizeEmail(emailValue);
  const store = await readJsonFile<LocalUserProfilesFile>(userProfilesPath, { profiles: {} });
  const now = new Date().toISOString();
  const existing = store.profiles[email];
  store.profiles[email] = {
    email,
    displayName: existing?.displayName ?? email,
    avatarUrl: existing?.avatarUrl ?? "",
    provider: existing?.provider ?? "development",
    tier: tierValue,
    isBanned: false,
    banReason: null,
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
    lastLoginAt: existing?.lastLoginAt ?? now,
    loginCount: existing?.loginCount ?? 1,
    updated_at: now,
    source: "local_payment_test",
  };
  await writeJsonFile(userProfilesPath, store);
  return store.profiles[email];
}

export async function upsertLocalUserProfile(input: {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  provider?: string;
}) {
  const email = normalizeEmail(input.email);
  const store = await readJsonFile<LocalUserProfilesFile>(userProfilesPath, { profiles: {} });
  const now = new Date().toISOString();
  const existing = store.profiles[email];
  store.profiles[email] = {
    email,
    displayName: input.displayName?.trim() || existing?.displayName || email,
    avatarUrl: input.avatarUrl?.trim() || existing?.avatarUrl || "",
    provider: input.provider?.trim() || existing?.provider || "development",
    tier: existing?.tier ?? "free",
    isBanned: false,
    banReason: null,
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
    lastLoginAt: now,
    loginCount: (existing?.loginCount ?? 0) + 1,
    updated_at: now,
    source: existing?.source ?? "local_profile_fallback",
  };
  await writeJsonFile(userProfilesPath, store);
  return store.profiles[email];
}

export async function getLocalUserProfile(emailValue: string) {
  const email = normalizeEmail(emailValue);
  const store = await readJsonFile<LocalUserProfilesFile>(userProfilesPath, { profiles: {} });
  const existing = store.profiles[email];
  if (existing) return existing;
  return upsertLocalUserProfile({ email });
}

export async function saveLocalPaymentOrder(record: Omit<LocalPaymentRecord, "created_at" | "paid_at" | "status" | "razorpay_payment_id" | "updated_at" | "reconciliation_required">) {
  return withPaymentLock(async () => {
    const store = await readJsonFile<LocalPaymentsFile>(paymentsPath, { payments: {}, webhook_events: {} });
    if (store.payments[record.razorpay_order_id]) throw new Error("PAYMENT_ORDER_ALREADY_EXISTS");
    store.payments[record.razorpay_order_id] = {
      ...record,
      razorpay_payment_id: null,
      status: "created",
      created_at: new Date().toISOString(),
      paid_at: null,
      updated_at: new Date().toISOString(),
      reconciliation_required: false,
    };
    await writeJsonFile(paymentsPath, store);
    return store.payments[record.razorpay_order_id];
  });
}

export async function getLocalPaymentOrder(orderId: string) {
  const store = await readJsonFile<LocalPaymentsFile>(paymentsPath, { payments: {}, webhook_events: {} });
  return store.payments[orderId] ?? null;
}

export async function markLocalPaymentVerified(orderId: string, paymentId: string) {
  return withPaymentLock(async () => {
    const store = await readJsonFile<LocalPaymentsFile>(paymentsPath, { payments: {}, webhook_events: {} });
    const record = store.payments[orderId];
    if (!record) return null;
    const replayedOnAnotherOrder = Object.values(store.payments).some(item => item.razorpay_order_id !== orderId && item.razorpay_payment_id === paymentId);
    if (replayedOnAnotherOrder) throw new Error("PAYMENT_ID_REPLAYED");
    if (record.status === "captured") {
      if (record.razorpay_payment_id !== paymentId) throw new Error("PAYMENT_ORDER_ALREADY_FINALIZED");
      return { record, transitioned: false };
    }
    record.razorpay_payment_id = paymentId;
    if (record.status === "refunded" || record.status === "disputed") throw new Error("PAYMENT_ORDER_ALREADY_FINALIZED");
    record.status = "captured";
    record.paid_at = new Date().toISOString();
    record.updated_at = record.paid_at;
    store.payments[orderId] = record;
    await writeJsonFile(paymentsPath, store);
    return { record, transitioned: true };
  });
}

export async function listLocalPayments(emailValue: string, limit = 50) {
  const email = normalizeEmail(emailValue);
  const store = await readJsonFile<LocalPaymentsFile>(paymentsPath, { payments: {}, webhook_events: {} });
  return Object.values(store.payments)
    .filter((item) => item.email === email)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, Math.max(1, Math.min(100, Math.floor(limit))));
}

export async function recordLocalPaymentEvent(input: {
  eventId: string;
  eventType: string;
  orderId: string;
  paymentId?: string | null;
  status: "authorized" | "captured" | "failed" | "refunded" | "disputed";
}) {
  return withPaymentLock(async () => {
    const store = await readJsonFile<LocalPaymentsFile>(paymentsPath, { payments: {}, webhook_events: {} });
    store.webhook_events ||= {};
    const existingEvent = store.webhook_events[input.eventId];
    if (existingEvent) return { record: store.payments[existingEvent.orderId] ?? null, duplicate: true, transitioned: false };
    const record = store.payments[input.orderId];
    if (!record) return { record: null, duplicate: false, transitioned: false };
    const terminal = record.status === "captured" || record.status === "refunded" || record.status === "disputed";
    const shouldTransition = input.status === "refunded" || input.status === "disputed"
      ? record.status === "captured" || record.status === "authorized"
      : input.status === "captured"
        ? record.status === "created" || record.status === "authorized"
        : !terminal;
    if (shouldTransition) {
      record.status = input.status;
      if (input.paymentId) record.razorpay_payment_id = input.paymentId;
      if (input.status === "captured") record.paid_at = new Date().toISOString();
      if (input.status === "refunded" || input.status === "disputed") record.reconciliation_required = true;
      record.updated_at = new Date().toISOString();
      store.payments[input.orderId] = record;
    }
    store.webhook_events[input.eventId] = {
      eventId: input.eventId,
      eventType: input.eventType,
      orderId: input.orderId,
      paymentId: input.paymentId ?? null,
      receivedAt: new Date().toISOString(),
    };
    await writeJsonFile(paymentsPath, store);
    return { record, duplicate: false, transitioned: shouldTransition };
  });
}
