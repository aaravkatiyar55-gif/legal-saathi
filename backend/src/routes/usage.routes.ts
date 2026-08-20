import { Router } from "express";
import { requireActiveOnlineAccount } from "../middleware/accountAccess.middleware";
import { getVerifiedUser } from "../middleware/identity.middleware";
import { getPreviewUsage } from "../services/local/previewAccess.service";
import { MODEL_POLICY } from "../config/modelPlans";
import { currentPlanIdFromState, getPlanStateWithTransactions } from "../services/billing/planState.service";

export const usageRoutes = Router();

usageRoutes.get("/", requireActiveOnlineAccount, async (_request, response) => {
  const email = getVerifiedUser(response).email;
  const { planState, transactions } = await getPlanStateWithTransactions(email, response.locals.userProfile?.tier ?? "free", 20);
  const previewPlan = currentPlanIdFromState(planState);
  const previewUsage = await getPreviewUsage(email, previewPlan);

  response.json({
    ok: true,
    tier: previewPlan === "max" ? "advocate" : previewPlan,
    clientPlan: previewPlan,
    previewPlan,
    planState,
    modelPolicy: MODEL_POLICY,
    usage: previewUsage.features,
    credits: {
      total: planState.balances.included.total,
      remaining: planState.balances.totalRemaining,
      includedRemaining: planState.balances.included.remaining,
      purchasedRemaining: planState.balances.purchased.remaining,
      source: "authoritative_unit_ledger",
    },
    resets: {
      planCycle: planState.plan.cycleEndsAt,
      proWindow: previewUsage.features.find((item) => item.feature === "proChats")?.resetAt ?? null,
      ultraWindow: previewUsage.features.find((item) => item.feature === "ultraChats")?.resetAt ?? null,
      webWindow: previewUsage.features.find((item) => item.feature === "webSearches")?.resetAt ?? null,
    },
    transactions,
  });
});
