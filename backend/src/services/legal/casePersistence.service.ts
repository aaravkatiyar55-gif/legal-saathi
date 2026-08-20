import { env } from "../../config/env";
import { CaseIntakeSummary, summarizeCaseIntake } from "../ai/openRouterProvider";
import { getSupabaseClient, SupabaseApiError, toSupabaseApiError } from "../supabase/supabaseClient";
import {
  assertLocalCaseCapacity,
  createLocalCaseFromSummary,
  getLocalCaseWithMemory,
  listLocalCases,
  restoreLocalCase,
  softDeleteLocalCase,
  updateLocalCaseWithSummary,
} from "../local/localDevStore.service";
import { assertCaseFolderCapacity } from "./caseCapacity.service";

export const caseIntakeDisclaimer =
  "This is AI-assisted legal information and case preparation support. Consult a qualified advocate before legal action.";

type CaseRow = {
  id: string;
  user_id: string | null;
  owner_email?: string | null;
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
  deleted_at?: string | null;
  analysis_status?: CaseAnalysisStatus;
  analysis_error_code?: string | null;
};

type CaseMemoryRow = {
  id: string;
  case_id: string;
  current_summary: string;
  facts_json: Record<string, unknown>;
  contradictions_json: unknown[];
  last_updated_at: string;
};

export type CaseAnalysisStatus = "not_requested" | "pending" | "completed" | "failed";

export type PrepareCaseAnalysisResult = {
  status: "not_found" | "input_required" | "completed";
  case: CaseRow | null;
  memory: CaseMemoryRow | null;
  alreadyPrepared: boolean;
};

const ANALYSIS_PENDING_SUMMARY = "Case saved. AI preparation pending.";
const ANALYSIS_FAILED_SUMMARY = "Analysis temporarily unavailable";
const EMPTY_CASE_SUMMARY = "Empty case folder ready.";
const ANALYSIS_PENDING_FLAG = "AI preparation is pending.";
const ANALYSIS_FAILED_FLAG = "AI preparation failed. Please try again.";

function titleFromSummary(summary: CaseIntakeSummary, title?: string) {
  if (title?.trim()) return title.trim();
  if (summary.shortSummary.trim()) return summary.shortSummary.trim().slice(0, 80);
  return "Untitled Legal Saathi Case";
}

function normalizeOwnerEmail(ownerEmail?: string) {
  return ownerEmail?.trim().toLowerCase() || null;
}

function toCaseInsert(summary: CaseIntakeSummary, title?: string, ownerEmail?: string) {
  const normalizedOwnerEmail = normalizeOwnerEmail(ownerEmail);
  return {
    // Local MVP ownership: store signed-in email in user_id because the MVP schema
    // already has this text column. Production must verify a real auth token/session
    // before trusting any owner identity supplied by the frontend.
    user_id: normalizedOwnerEmail,
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
  };
}

function canUseLocalCasesFallback() {
  return env.localCasesFallback && env.nodeEnv !== "production";
}

// Placeholder summary: persisted immediately so the case exists before any AI call.
function createPlaceholderSummary(caseText: string): CaseIntakeSummary {
  const storedStory = caseText.replace(/\u0000/g, " ").replace(/\r\n/g, "\n").trim().slice(0, 20_000);
  const hasIntake = Boolean(storedStory);
  return {
    caseType: "General legal preparation",
    userRole: "To be confirmed",
    shortSummary: hasIntake ? ANALYSIS_PENDING_SUMMARY : EMPTY_CASE_SUMMARY,
    importantFacts: storedStory ? [storedStory] : [],
    importantDates: [],
    parties: [],
    reliefWanted: [],
    missingInformation: hasIntake ? ["Structured preparation has not run yet."] : [],
    riskFlags: hasIntake ? [ANALYSIS_PENDING_FLAG] : [],
    questionsForUser: [],
  };
}

function analysisStatusFromCase(caseRow: CaseRow, memory?: CaseMemoryRow | null): CaseAnalysisStatus {
  const memoryStatus = memory?.facts_json?.analysisStatus;
  if (["not_requested", "pending", "completed", "failed"].includes(String(memoryStatus))) {
    return memoryStatus as CaseAnalysisStatus;
  }
  if (caseRow.short_summary === ANALYSIS_PENDING_SUMMARY || caseRow.risk_flags.includes(ANALYSIS_PENDING_FLAG)) return "pending";
  if (caseRow.short_summary === ANALYSIS_FAILED_SUMMARY || caseRow.risk_flags.includes(ANALYSIS_FAILED_FLAG)) return "failed";
  if (caseRow.short_summary === EMPTY_CASE_SUMMARY && caseRow.important_facts.length === 0) return "not_requested";
  return "completed";
}

function decorateCaseAnalysisState(caseRow: CaseRow, memory?: CaseMemoryRow | null): CaseRow {
  const status = analysisStatusFromCase(caseRow, memory);
  return {
    ...caseRow,
    analysis_status: status,
    analysis_error_code: status === "failed" ? "AI_PROVIDER_TEMPORARILY_UNAVAILABLE" : null,
  };
}

function failedSummaryFromCase(caseRow: CaseRow): CaseIntakeSummary {
  return {
    caseType: caseRow.case_type,
    userRole: caseRow.user_role,
    shortSummary: ANALYSIS_FAILED_SUMMARY,
    importantFacts: caseRow.important_facts,
    importantDates: caseRow.important_dates,
    parties: caseRow.parties,
    reliefWanted: caseRow.relief_wanted,
    missingInformation: Array.from(new Set([...caseRow.missing_information, "Structured preparation is temporarily unavailable."])),
    riskFlags: Array.from(new Set([...caseRow.risk_flags.filter((flag) => flag !== ANALYSIS_PENDING_FLAG), ANALYSIS_FAILED_FLAG])),
    questionsForUser: caseRow.questions_for_user,
  };
}

function isSupabaseNetworkError(error: unknown) {
  return error instanceof SupabaseApiError && error.supabase.type === "network";
}

const ownerCaseQueues = new Map<string, Promise<void>>();

function withOwnerCaseLock<T>(ownerEmail: string, task: () => Promise<T>) {
  const key = normalizeOwnerEmail(ownerEmail) || "";
  const previous = ownerCaseQueues.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  ownerCaseQueues.set(key, run.then(() => undefined, () => undefined));
  return run;
}

async function assertSupabaseCaseCapacity(ownerEmail: string, maximumActiveCases: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const result = await supabase.from("cases").select("id", { count: "exact", head: true })
    .eq("user_id", normalizeOwnerEmail(ownerEmail) || "")
    .is("deleted_at", null);
  if (result.error) throw toSupabaseApiError("cases select", "cases", result.error);
  assertCaseFolderCapacity(result.count ?? 0, maximumActiveCases);
}

export async function assertCaseCreationCapacity(ownerEmail: string, maximumActiveCases: number) {
  if (canUseLocalCasesFallback()) return assertLocalCaseCapacity(ownerEmail, maximumActiveCases);
  return assertSupabaseCaseCapacity(ownerEmail, maximumActiveCases);
}

// ─── Supabase case enrichment (called async after initial persist) ────────────
async function enrichSupabaseCaseWithSummary(
  caseId: string,
  ownerEmail: string,
  summary: CaseIntakeSummary,
  analysisStatus: CaseAnalysisStatus,
) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const now = new Date().toISOString();
  const caseResult = await supabase.from("cases").update({
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
    updated_at: now,
  })
    .eq("id", caseId)
    .eq("user_id", normalizeOwnerEmail(ownerEmail) || "")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (caseResult.error) throw toSupabaseApiError("cases update", "cases", caseResult.error);
  if (!caseResult.data) return null;

  const existingMemory = await supabase
    .from("case_memory")
    .select("facts_json")
    .eq("case_id", caseId)
    .maybeSingle<{ facts_json: Record<string, unknown> }>();
  if (existingMemory.error) throw toSupabaseApiError("cases update", "case_memory", existingMemory.error);
  const memoryResult = await supabase.from("case_memory").update({
    current_summary: summary.shortSummary,
    facts_json: {
      ...(existingMemory.data?.facts_json ?? {}),
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
    },
    last_updated_at: now,
  }).eq("case_id", caseId);
  if (memoryResult.error) throw toSupabaseApiError("cases update", "case_memory", memoryResult.error);
  return true;
}

// ─── Main create function ────────────────────────────────────────────────────
// Architecture (BLOCK 1 requirement):
//   Step 1: Validate owner, plan, and input.
//   Step 2: Persist case IMMEDIATELY with a placeholder summary.
//   Step 3: Return the saved case to the caller.
//   Step 4: Run AI preparation only through prepareCaseAnalysis().
//           A provider failure never removes the saved case or consumes another slot.
//
// If AI fails, the case still exists and the user can open it and retry analysis.
export async function createCaseFromIntake(
  caseText: string,
  title?: string,
  ownerEmail?: string,
  _language: unknown = "en",
  maximumActiveCases = Number.MAX_SAFE_INTEGER,
) {
  const normalizedOwner = normalizeOwnerEmail(ownerEmail);
  if (!normalizedOwner) throw new Error("CASE_OWNER_REQUIRED");
  const placeholder = createPlaceholderSummary(caseText);
  const aiAnalysisPending = Boolean(caseText.trim());

  // ── Local dev fallback path ─────────────────────────────────────────────
  if (canUseLocalCasesFallback()) {
    const saved = await createLocalCaseFromSummary(placeholder, title, normalizedOwner, maximumActiveCases, caseText);
    return {
      ...saved,
      case: decorateCaseAnalysisState(saved.case as CaseRow, saved.memory as CaseMemoryRow),
      aiAnalysisPending,
      analysisStatus: aiAnalysisPending ? "pending" as const : "not_requested" as const,
    };
  }

  // ── Supabase path ───────────────────────────────────────────────────────
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const saved = await withOwnerCaseLock(normalizedOwner, async () => {
    await assertSupabaseCaseCapacity(normalizedOwner, maximumActiveCases);
    const caseResult = await supabase
      .from("cases")
      .insert(toCaseInsert(placeholder, title, normalizedOwner))
      .select("*")
      .single<CaseRow>();

    if (caseResult.error) {
      throw toSupabaseApiError("cases insert", "cases", caseResult.error);
    }

    const memoryResult = await supabase
      .from("case_memory")
      .insert({
        case_id: caseResult.data.id,
        current_summary: placeholder.shortSummary,
        facts_json: {
          importantFacts: placeholder.importantFacts,
          importantDates: placeholder.importantDates,
          parties: placeholder.parties,
          reliefWanted: placeholder.reliefWanted,
          missingInformation: placeholder.missingInformation,
          riskFlags: placeholder.riskFlags,
          questionsForUser: placeholder.questionsForUser,
          userProvidedIntakeText: caseText.trim().slice(0, 20_000),
          analysisStatus: aiAnalysisPending ? "pending" : "not_requested",
          analysisAttemptedAt: null,
          analysisErrorCode: null,
        },
        contradictions_json: [],
      })
      .select("*")
      .single<CaseMemoryRow>();

    if (memoryResult.error) {
      await supabase.from("cases").delete().eq("id", caseResult.data.id);
      throw toSupabaseApiError("case_memory insert", "case_memory", memoryResult.error);
    }

    return { case: caseResult.data, memory: memoryResult.data };
  });

  return {
    ...saved,
    case: decorateCaseAnalysisState(saved.case, saved.memory),
    aiAnalysisPending,
    analysisStatus: aiAnalysisPending ? "pending" as const : "not_requested" as const,
  };
}

type CaseSummarizer = (caseText: string, language?: unknown) => Promise<CaseIntakeSummary>;
const caseAnalysisJobs = new Map<string, Promise<PrepareCaseAnalysisResult>>();

async function updateStoredCaseAnalysis(
  caseId: string,
  ownerEmail: string,
  summary: CaseIntakeSummary,
  analysisStatus: "completed" | "failed",
) {
  if (canUseLocalCasesFallback()) {
    const updated = await updateLocalCaseWithSummary(caseId, ownerEmail, summary, analysisStatus);
    if (!updated) return null;
    return getCaseWithMemory(caseId, ownerEmail, false);
  }

  const updated = await enrichSupabaseCaseWithSummary(caseId, ownerEmail, summary, analysisStatus);
  if (!updated) return null;
  return getCaseWithMemory(caseId, ownerEmail, false);
}

async function logSuccessfulCaseAnalysis() {
  if (canUseLocalCasesFallback()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.from("usage_logs").insert({
    action_type: "case_intake_summary",
    provider: "openrouter",
    model_name: env.openRouterModel,
    input_tokens: null,
    output_tokens: null,
  });
}

export function getCaseAnalysisStatus(caseRow: CaseRow, memory?: CaseMemoryRow | null) {
  return analysisStatusFromCase(caseRow, memory);
}

export async function prepareCaseAnalysis(
  caseId: string,
  ownerEmail: string,
  language: unknown = "en",
  summarize: CaseSummarizer = summarizeCaseIntake,
): Promise<PrepareCaseAnalysisResult> {
  const normalizedOwner = normalizeOwnerEmail(ownerEmail);
  if (!normalizedOwner) throw new Error("CASE_OWNER_REQUIRED");
  const jobKey = `${normalizedOwner}:${caseId}`;
  const running = caseAnalysisJobs.get(jobKey);
  if (running) return running;

  const job = (async (): Promise<PrepareCaseAnalysisResult> => {
    const stored = await getCaseWithMemory(caseId, normalizedOwner, false);
    if (!stored.case) {
      return { status: "not_found", case: null, memory: null, alreadyPrepared: false };
    }

    const caseRow = stored.case as CaseRow;
    const memory = stored.memory as CaseMemoryRow | null;
    if (analysisStatusFromCase(caseRow, memory) === "completed") {
      return { status: "completed", case: decorateCaseAnalysisState(caseRow, memory), memory, alreadyPrepared: true };
    }

    const storedIntake = typeof memory?.facts_json?.userProvidedIntakeText === "string"
      ? memory.facts_json.userProvidedIntakeText
      : caseRow.important_facts.join("\n");
    const caseText = storedIntake.trim().slice(0, 20_000);
    if (!caseText) {
      return { status: "input_required", case: decorateCaseAnalysisState(caseRow, memory), memory, alreadyPrepared: false };
    }

    try {
      const summary = await summarize(caseText, language);
      const updated = await updateStoredCaseAnalysis(caseId, normalizedOwner, summary, "completed");
      if (!updated?.case) {
        return { status: "not_found", case: null, memory: null, alreadyPrepared: false };
      }
      await logSuccessfulCaseAnalysis().catch(() => undefined);
      return {
        status: "completed",
        case: decorateCaseAnalysisState(updated.case as CaseRow, updated.memory as CaseMemoryRow | null),
        memory: updated.memory as CaseMemoryRow | null,
        alreadyPrepared: false,
      };
    } catch (error) {
      const failedSummary = failedSummaryFromCase(caseRow);
      await updateStoredCaseAnalysis(caseId, normalizedOwner, failedSummary, "failed").catch(() => undefined);
      throw error;
    }
  })();

  caseAnalysisJobs.set(jobKey, job);
  try {
    return await job;
  } finally {
    if (caseAnalysisJobs.get(jobKey) === job) caseAnalysisJobs.delete(jobKey);
  }
}

export async function listLatestCases(ownerEmail?: string, includeAll = false) {
  if (canUseLocalCasesFallback()) {
    const cases = await listLocalCases(ownerEmail, includeAll);
    return cases.map((caseRow) => decorateCaseAnalysisState(caseRow as CaseRow));
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    if (canUseLocalCasesFallback()) return listLocalCases(ownerEmail, includeAll);
    throw new Error("Supabase is not configured");
  }

  let query = supabase.from("cases").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(50);
  const normalizedOwnerEmail = normalizeOwnerEmail(ownerEmail);

  if (!includeAll) {
    if (!normalizedOwnerEmail) return [];
    query = query.eq("user_id", normalizedOwnerEmail);
  }

  const result = await query;

  if (result.error) {
    const supabaseError = toSupabaseApiError("cases select", "cases", result.error);
    if (canUseLocalCasesFallback() && isSupabaseNetworkError(supabaseError)) {
      return listLocalCases(ownerEmail, includeAll);
    }
    throw supabaseError;
  }

  return (result.data as CaseRow[]).map((caseRow) => decorateCaseAnalysisState(caseRow));
}

export async function getCaseWithMemory(caseId: string, ownerEmail?: string, includeAll = false) {
  if (canUseLocalCasesFallback()) {
    const result = await getLocalCaseWithMemory(caseId, ownerEmail, includeAll);
    return {
      case: result.case ? decorateCaseAnalysisState(result.case as CaseRow, result.memory as CaseMemoryRow | null) : null,
      memory: result.memory as CaseMemoryRow | null,
    };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    if (canUseLocalCasesFallback()) return getLocalCaseWithMemory(caseId, ownerEmail, includeAll);
    throw new Error("Supabase is not configured");
  }

  let caseQuery = supabase.from("cases").select("*").eq("id", caseId).is("deleted_at", null);
  const normalizedOwnerEmail = normalizeOwnerEmail(ownerEmail);

  if (!includeAll) {
    if (!normalizedOwnerEmail) {
      return { case: null, memory: null };
    }
    caseQuery = caseQuery.eq("user_id", normalizedOwnerEmail);
  }

  const caseResult = await caseQuery.maybeSingle<CaseRow>();

  if (caseResult.error) {
    const supabaseError = toSupabaseApiError("cases select", "cases", caseResult.error);
    if (canUseLocalCasesFallback() && isSupabaseNetworkError(supabaseError)) {
      return getLocalCaseWithMemory(caseId, ownerEmail, includeAll);
    }
    throw supabaseError;
  }

  const memoryResult = await supabase
    .from("case_memory")
    .select("*")
    .eq("case_id", caseId)
    .order("last_updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<CaseMemoryRow>();

  if (memoryResult.error) {
    throw toSupabaseApiError("case_memory select", "case_memory", memoryResult.error);
  }

  return {
    case: caseResult.data ? decorateCaseAnalysisState(caseResult.data, memoryResult.data ?? null) : null,
    memory: memoryResult.data ?? null,
  };
}

export async function deleteCaseById(caseId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const memoryResult = await supabase.from("case_memory").delete().eq("case_id", caseId);

  if (memoryResult.error) {
    throw toSupabaseApiError("case_memory delete", "case_memory", memoryResult.error);
  }

  const caseResult = await supabase.from("cases").delete().eq("id", caseId).select("id").maybeSingle<{ id: string }>();

  if (caseResult.error) {
    throw toSupabaseApiError("cases delete", "cases", caseResult.error);
  }

  return {
    deletedCaseId: caseResult.data?.id ?? null,
    deletedRelated: {
      case_memory: true,
      // usage_logs currently has no case_id column in the MVP schema, so there is
      // nothing linked safely to delete there.
      usage_logs: "not linked in MVP schema",
    },
  };
}

export async function softDeleteCaseForOwner(caseId: string, ownerEmail: string) {
  if (canUseLocalCasesFallback()) return softDeleteLocalCase(caseId, ownerEmail);
  
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  
  const normalizedOwner = normalizeOwnerEmail(ownerEmail);
  if (!normalizedOwner) throw new Error("CASE_OWNER_REQUIRED");

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("cases")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", caseId)
    .eq("user_id", normalizedOwner)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw toSupabaseApiError("cases update", "cases", error);
  if (!data) return null;
  
  return { id: data.id, deletedAt: now };
}

export async function restoreCaseForOwner(caseId: string, ownerEmail: string, maximumActiveCases = Number.MAX_SAFE_INTEGER) {
  if (canUseLocalCasesFallback()) return restoreLocalCase(caseId, ownerEmail, maximumActiveCases);
  
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  
  const normalizedOwner = normalizeOwnerEmail(ownerEmail);
  if (!normalizedOwner) throw new Error("CASE_OWNER_REQUIRED");

  return withOwnerCaseLock(normalizedOwner, async () => {
    await assertSupabaseCaseCapacity(normalizedOwner, maximumActiveCases);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("cases")
      .update({ deleted_at: null, updated_at: now })
      .eq("id", caseId)
      .eq("user_id", normalizedOwner)
      .not("deleted_at", "is", null)
      .select("*")
      .maybeSingle();

    if (error) throw toSupabaseApiError("cases update", "cases", error);
    return data;
  });
}
