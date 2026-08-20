import { randomUUID } from "node:crypto";
import { MODEL_POLICY, toBackendTier } from "../../config/modelPlans";
import { PRODUCT_PLANS, ProductPlanId } from "../../config/productPolicy";
import { env } from "../../config/env";
import { grantPlan, getPlanAccount } from "../billing/creditLedger.service";
import { getPlanStateWithTransactions } from "../billing/planState.service";
import {
  getPreviewProfile,
  getPreviewUsage,
  recordPreviewAdminEvent,
  updatePreviewProfile,
} from "../local/previewAccess.service";
import { getSupabaseClient } from "../supabase/supabaseClient";
import { getUserProfile, setUserTier } from "../supabase/onlineUsers.service";

export type AdminPlanChangeResult = {
  profile: Record<string, unknown>;
  planState: Awaited<ReturnType<typeof getPlanStateWithTransactions>>["planState"];
  usage: {
    previewPlan: ProductPlanId;
    usage: Awaited<ReturnType<typeof getPreviewUsage>>["features"];
    credits: {
      total: number;
      remaining: number;
      includedRemaining: number;
      purchasedRemaining: number;
      source: "authoritative_unit_ledger";
    };
    transactions: Awaited<ReturnType<typeof getPlanStateWithTransactions>>["transactions"];
  };
  modelEntitlements: Awaited<ReturnType<typeof getPlanStateWithTransactions>>["planState"]["entitlements"];
  auditId: string;
};

export class AdminPlanChangeError extends Error {
  constructor(
    public readonly code: "INVALID_PLAN" | "USER_NOT_FOUND" | "SAME_PLAN" | "AUDIT_UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}

function normalizeRequestedPlan(value: unknown): ProductPlanId {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "free" || normalized === "plus" || normalized === "pro" || normalized === "max") return normalized;
  throw new AdminPlanChangeError("INVALID_PLAN", "Choose Free, Plus, Pro, or Max.");
}

function safeReferenceId(value: unknown) {
  const requestId = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{8,120}$/.test(requestId) ? requestId : randomUUID();
}

async function recordProductionAudit(input: {
  auditId: string;
  adminEmail: string;
  targetEmail: string;
  previousPlan: ProductPlanId;
  nextPlan: ProductPlanId;
}) {
  const client = getSupabaseClient();
  if (!client) throw new AdminPlanChangeError("AUDIT_UNAVAILABLE", "Admin audit storage is unavailable.");
  const result = await client.from("legal_sathi_admin_audit_events").insert({
    id: input.auditId,
    admin_email: input.adminEmail.trim().toLowerCase(),
    target_email: input.targetEmail.trim().toLowerCase(),
    action: "plan_change",
    metadata: { previousPlan: input.previousPlan, nextPlan: input.nextPlan },
  });
  if (result.error) throw new AdminPlanChangeError("AUDIT_UNAVAILABLE", "Admin audit storage is unavailable.");
}

export async function changeUserPlanAsAdmin(input: {
  targetEmail: string;
  requestedPlan: unknown;
  adminEmail: string;
  requestId?: unknown;
}): Promise<AdminPlanChangeResult> {
  const targetEmail = input.targetEmail.trim().toLowerCase();
  const planId = normalizeRequestedPlan(input.requestedPlan);
  const auditId = safeReferenceId(input.requestId);
  const local = env.nodeEnv !== "production";
  const existingProfile = local
    ? await getPreviewProfile(targetEmail)
    : await getUserProfile(targetEmail);
  if (!existingProfile) throw new AdminPlanChangeError("USER_NOT_FOUND", "The target account does not exist.");

  const previousAccount = await getPlanAccount(targetEmail, existingProfile.tier ?? "free");
  if (previousAccount.planId === planId) {
    throw new AdminPlanChangeError("SAME_PLAN", `${PRODUCT_PLANS[planId].name} is already the active plan.`);
  }

  await grantPlan({ email: targetEmail, planId, source: "admin", referenceId: auditId });

  const profile = local
    ? await updatePreviewProfile(targetEmail, { tier: toBackendTier(planId) })
    : await setUserTier(targetEmail, toBackendTier(planId), input.adminEmail);

  if (local) {
    await recordPreviewAdminEvent({
      id: auditId,
      action: "plan_change",
      targetEmail,
      metadata: { previousPlan: previousAccount.planId, nextPlan: planId, admin: input.adminEmail.trim().toLowerCase() },
    });
  } else {
    await recordProductionAudit({ auditId, adminEmail: input.adminEmail, targetEmail, previousPlan: previousAccount.planId, nextPlan: planId });
  }

  const { planState, transactions } = await getPlanStateWithTransactions(targetEmail, profile.tier, 20);
  const previewUsage = await getPreviewUsage(targetEmail, planId);
  return {
    profile: { ...profile, tier: toBackendTier(planState.plan.id) },
    planState,
    usage: {
      previewPlan: planState.plan.id,
      usage: previewUsage.features,
      credits: {
        total: planState.balances.included.total,
        remaining: planState.balances.totalRemaining,
        includedRemaining: planState.balances.included.remaining,
        purchasedRemaining: planState.balances.purchased.remaining,
        source: "authoritative_unit_ledger",
      },
      transactions,
    },
    modelEntitlements: planState.entitlements,
    auditId,
  };
}

export async function presentAdminUserWithAuthoritativePlan<T extends { email?: string | null; tier?: unknown }>(profile: T) {
  const email = String(profile.email ?? "").trim().toLowerCase();
  const account = await getPlanAccount(email, profile.tier ?? "free");
  return {
    ...profile,
    tier: toBackendTier(account.planId),
    activePlan: account.planId,
    includedUnitsRemaining: account.includedUnitsRemaining,
    purchasedUnitsRemaining: account.purchasedUnitsRemaining,
    modelPolicy: MODEL_POLICY,
  };
}
