import { createClient, PostgrestError } from "@supabase/supabase-js";
import { env } from "../../config/env";

export type SupabaseStep =
  | "cases insert"
  | "cases delete"
  | "case_memory insert"
  | "case_memory delete"
  | "usage_logs insert"
  | "cases select"
  | "cases update"
  | "case_memory select"
  | "cases soft_delete"
  | "cases restore";

export type SafeSupabaseError = {
  table: string;
  type?: "network" | "missing_table" | "query" | "configuration";
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  setupHint?: string;
};

export class SupabaseApiError extends Error {
  step: SupabaseStep;
  supabase: SafeSupabaseError;

  constructor(step: SupabaseStep, table: string, error: Partial<PostgrestError>) {
    super("Supabase API request failed");
    const message = redactSecrets(String(error.message ?? ""));
    const details = error.details ? redactSecrets(String(error.details)) : undefined;
    const combined = `${message}\n${details ?? ""}`.toLowerCase();
    const isNetworkError =
      combined.includes("fetch failed") ||
      combined.includes("enotfound") ||
      combined.includes("econnrefused") ||
      combined.includes("network");
    const isMissingTable =
      String(error.code ?? "") === "42P01" ||
      combined.includes("does not exist") ||
      combined.includes("relation") && combined.includes("does not exist");

    this.step = step;
    this.supabase = {
      table,
      type: isNetworkError ? "network" : isMissingTable ? "missing_table" : "query",
      code: error.code,
      message,
      details,
      hint: error.hint ? redactSecrets(String(error.hint)) : undefined,
      setupHint: isNetworkError
        ? "Check SUPABASE_URL spelling, DNS/network access, and restart the backend after changing env."
        : isMissingTable
          ? `Table '${table}' may be missing. Run the approved Supabase SQL migration manually.`
          : undefined,
    };
  }
}

function hasValue(value: string) {
  return Boolean(value.trim()) && value !== "replace_later";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSecrets(value: string) {
  let redacted = value.slice(0, 500);
  const serviceKey = env.supabaseServiceRoleKey.trim();

  if (serviceKey && serviceKey !== "replace_later") {
    redacted = redacted.replace(new RegExp(escapeRegExp(serviceKey), "g"), "[REDACTED]");
  }

  return redacted
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /(api[_-]?key|token|authorization|secret|service[_-]?role[_-]?key)(["'\s:=]+)(["']?)[A-Za-z0-9._~+/=-]{8,}/gi,
      "$1$2$3[REDACTED]",
    )
    .replace(/\b[A-Za-z0-9._~+/=-]{40,}\b/g, "[REDACTED]");
}

export function isSupabaseConfigured() {
  return hasValue(env.supabaseUrl) && hasValue(env.supabaseServiceRoleKey);
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function toSupabaseApiError(step: SupabaseStep, table: string, error: Partial<PostgrestError>) {
  return new SupabaseApiError(step, table, error);
}
