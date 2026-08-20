import { env } from "../../config/env";
import { isSessionConfigured } from "../local/authSessions.service";
import { isSupabaseMfaConfigured } from "../security/supabaseMfa.service";

export type SupabasePlatformPlan = "unknown" | "free" | "pro" | "team" | "enterprise";
export type SupabaseCapabilityState =
  | "available"
  | "configured"
  | "not_configured"
  | "not_verified"
  | "not_included"
  | "optional_add_on";

export type SupabaseCapabilityRegistryInput = {
  declaredPlan: SupabasePlatformPlan;
  planVerified: boolean;
  authConfigured: boolean;
  authReachable: boolean;
  mfaConfigured: boolean;
  customSmtpConfigured: boolean;
  databaseConfigured: boolean;
  databaseReachable: boolean;
  consentStoreReachable: boolean;
  storageReachable: boolean;
  privateDocumentBucketConfigured: boolean;
  realtimeVerified: boolean;
  sessionControlsConfigured: boolean;
  logDrainConfigured: boolean;
  pitrConfigured: boolean;
  rlsVerified: boolean;
  storagePoliciesVerified: boolean;
  restoreRunbookConfigured: boolean;
};

const paidPlans = new Set<SupabasePlatformPlan>(["pro", "team", "enterprise"]);

function state(value: boolean, falseState: SupabaseCapabilityState = "not_configured"): SupabaseCapabilityState {
  return value ? "configured" : falseState;
}

export function evaluateSupabaseCapabilityRegistry(input: SupabaseCapabilityRegistryInput) {
  const paidPlanVerified = input.planVerified && paidPlans.has(input.declaredPlan);
  const freePlanVerified = input.planVerified && input.declaredPlan === "free";
  const authAvailable = input.authConfigured && input.authReachable;
  const databaseAvailable = input.databaseConfigured && input.databaseReachable;

  return {
    platform: {
      declaredPlan: input.declaredPlan,
      planVerified: input.planVerified,
      paidPlanActive: paidPlanVerified,
    },
    capabilities: {
      authAvailable,
      totpMfaAvailable: authAvailable && input.mfaConfigured,
      emailOtpAvailable: authAvailable,
      customSmtpConfigured: input.customSmtpConfigured,
      databaseAvailable,
      consentStoreAvailable: databaseAvailable && input.consentStoreReachable,
      storageAvailable: input.storageReachable,
      privateDocumentBucketConfigured: input.privateDocumentBucketConfigured,
      realtimeAvailable: input.realtimeVerified,
      dailyBackupsExpectedByPlan: paidPlanVerified,
      sessionControlsConfigured: input.sessionControlsConfigured,
      logRetentionExpectedByPlan: paidPlanVerified,
      logDrainConfigured: input.logDrainConfigured,
      pitrConfigured: input.pitrConfigured,
      rlsVerified: input.rlsVerified,
      storagePoliciesVerified: input.storagePoliciesVerified,
    },
    states: {
      auth: state(authAvailable, input.authConfigured ? "not_verified" : "not_configured"),
      totpMfa: state(authAvailable && input.mfaConfigured, input.mfaConfigured ? "not_verified" : "not_configured"),
      emailOtp: state(authAvailable, input.authConfigured ? "not_verified" : "not_configured"),
      customSmtp: state(input.customSmtpConfigured),
      database: state(databaseAvailable, input.databaseConfigured ? "not_verified" : "not_configured"),
      consentStore: state(databaseAvailable && input.consentStoreReachable, databaseAvailable ? "not_configured" : "not_verified"),
      storage: state(input.storageReachable, "not_verified"),
      privateDocumentBucket: state(input.privateDocumentBucketConfigured),
      realtime: state(input.realtimeVerified, "not_verified"),
      dailyBackups: paidPlanVerified ? "available" : freePlanVerified ? "not_included" : "not_verified",
      sessionControls: state(input.sessionControlsConfigured),
      logRetention: paidPlanVerified ? "available" : freePlanVerified ? "not_included" : "not_verified",
      logDrain: state(input.logDrainConfigured, "optional_add_on"),
      pitr: state(input.pitrConfigured, "optional_add_on"),
      rls: state(input.rlsVerified, "not_verified"),
      storagePolicies: state(input.storagePoliciesVerified, "not_verified"),
      restoreRunbook: state(input.restoreRunbookConfigured),
    } satisfies Record<string, SupabaseCapabilityState>,
  };
}

async function probe(path: string, key: string, method: "GET" | "HEAD" = "HEAD", timeoutMs = 4_000) {
  if (!env.supabaseUrl.trim() || !key.trim()) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${env.supabaseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSupabaseCapabilityRegistry() {
  const publishableKey = env.supabasePublishableKey.trim();
  const serviceRoleKey = env.supabaseServiceRoleKey.trim();
  const authConfigured = Boolean(env.supabaseUrl.trim() && publishableKey && isSessionConfigured());
  const databaseConfigured = Boolean(env.supabaseUrl.trim() && serviceRoleKey);

  const [authReachable, databaseReachable, consentStoreReachable, storageReachable] = await Promise.all([
    probe("/auth/v1/settings", publishableKey, "GET"),
    probe("/rest/v1/", serviceRoleKey),
    probe("/rest/v1/legal_sathi_consent_events?select=id&limit=0", serviceRoleKey, "GET"),
    probe("/storage/v1/bucket", serviceRoleKey),
  ]);

  return evaluateSupabaseCapabilityRegistry({
    declaredPlan: env.supabasePlatformPlan,
    planVerified: env.supabasePlatformPlanVerified,
    authConfigured,
    authReachable,
    mfaConfigured: isSupabaseMfaConfigured(),
    customSmtpConfigured: env.supabaseCustomSmtpConfigured,
    databaseConfigured,
    databaseReachable,
    consentStoreReachable,
    storageReachable,
    privateDocumentBucketConfigured: Boolean(env.supabasePrivateDocumentBucket.trim()),
    realtimeVerified: env.supabaseRealtimeVerified,
    sessionControlsConfigured: env.supabaseSessionControlsConfigured,
    logDrainConfigured: env.supabaseLogDrainConfigured,
    pitrConfigured: env.supabasePitrConfigured,
    rlsVerified: env.supabaseRlsVerified,
    storagePoliciesVerified: env.supabaseStoragePoliciesVerified,
    restoreRunbookConfigured: env.supabaseRestoreRunbookConfigured,
  });
}
