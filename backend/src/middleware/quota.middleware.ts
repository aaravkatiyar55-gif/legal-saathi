import { NextFunction, Request, Response } from "express";
import { getVerifiedUser } from "./identity.middleware";
import { env } from "../config/env";
import { getSupabaseClient } from "../services/supabase/supabaseClient";
import { UserTier } from "../services/supabase/onlineUsers.service";
import { consumePreviewUsage, releasePreviewUsage } from "../services/local/previewAccess.service";
import { toPreviewPlan } from "../config/modelPlans";
import { hasPlanAccess, MODEL_POLICY, PLAN_USAGE_LIMITS, PreviewModel } from "../config/modelPlans";
import { isLoopbackDevelopmentRequest } from "../security/requestOrigin";
import { currentPlanIdFromState } from "../services/billing/planState.service";
import { PRODUCT_PLANS, ProductPlanId } from "../config/productPolicy";

type QuotaFeature = "chat" | "caseFolders";
type TierQuota = { limit: number; windowMs: number };

const quotaByTier: Record<UserTier, Record<QuotaFeature, TierQuota>> = {
  free: {
    chat: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
    caseFolders: { limit: 1, windowMs: 30 * 24 * 60 * 60 * 1000 },
  },
  plus: {
    chat: { limit: 30, windowMs: 24 * 60 * 60 * 1000 },
    caseFolders: { limit: 2, windowMs: 7 * 24 * 60 * 60 * 1000 },
  },
  pro: {
    chat: { limit: 50, windowMs: 2 * 60 * 60 * 1000 },
    caseFolders: { limit: 4, windowMs: 7 * 24 * 60 * 60 * 1000 },
  },
  advocate: {
    chat: { limit: 100, windowMs: 60 * 60 * 1000 },
    caseFolders: { limit: 10, windowMs: 7 * 24 * 60 * 60 * 1000 },
  },
};

function fixedWindowStart(windowMs: number) {
  return new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
}

function refundOnUnsuccessfulResponse(response: Response, refund: () => Promise<unknown>) {
  let settled = false;
  const finalize = () => {
    if (settled) return;
    settled = true;
    if (!response.writableFinished || response.statusCode >= 400) {
      void refund().catch(() => console.warn("[Usage] quota refund failed", { category: "quota_refund_failure" }));
    }
  };
  response.once("finish", finalize);
  response.once("close", finalize);
}

export function requireUsageQuota(feature: QuotaFeature) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (isLoopbackDevelopmentRequest(request) && env.localCasesFallback) {
      const email = getVerifiedUser(response).email;
      const plan = toPreviewPlan(response.locals.userProfile?.tier);
      const localFeature = feature === "chat" ? "chat" : "caseFolders";
      const result = await consumePreviewUsage(email, plan, localFeature);
      if (!result.allowed) {
        response.status(429).json({ ok: false, error: "USAGE_LIMIT_REACHED", message: `Your ${plan} ${feature} limit has been reached.`, resetAt: result.resetAt });
        return;
      }
      refundOnUnsuccessfulResponse(response, () => releasePreviewUsage(email, localFeature));
      next();
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      response.status(503).json({ ok: false, error: "Usage enforcement is not configured" });
      return;
    }
    const email = getVerifiedUser(response).email;
    const tier = (response.locals.userProfile?.tier ?? "free") as UserTier;
    const quota = quotaByTier[tier] ?? quotaByTier.free;
    const config = quota[feature];
    const windowStartedAt = fixedWindowStart(config.windowMs);
    const consumed = await supabase.rpc("consume_usage_quota", {
      p_email: email,
      p_feature: feature,
      p_window_started_at: windowStartedAt,
      p_limit: config.limit,
    });
    if (consumed.error) {
      response.status(503).json({ ok: false, error: "USAGE_ENFORCEMENT_UNAVAILABLE", message: "Usage enforcement is temporarily unavailable." });
      return;
    }
    if (consumed.data !== true) {
      response.status(429).json({
        ok: false,
        error: "USAGE_LIMIT_REACHED",
        message: `Your ${tier} ${feature} limit has been reached.`,
        resetAt: new Date(new Date(windowStartedAt).getTime() + config.windowMs).toISOString(),
      });
      return;
    }

    refundOnUnsuccessfulResponse(response, async () => {
      const released = await supabase.rpc("release_usage_quota", {
        p_email: email,
        p_feature: feature,
        p_window_started_at: windowStartedAt,
      });
      if (released.error) throw new Error("QUOTA_RELEASE_FAILED");
    });
    next();
  };
}

export const quotaMiddleware = requireUsageQuota("chat");

export type WebSearchQuotaReservation = {
  allowed: true;
  limit: number;
  remaining: number;
  resetAt: string;
  settle: (chargeable: boolean) => Promise<void>;
} | {
  allowed: false;
  status: 429 | 503;
  error: "WEB_QUOTA_REACHED" | "WEB_QUOTA_UNAVAILABLE";
  message: string;
  resetAt?: string;
};

function webQuotaPolicy(plan: ProductPlanId) {
  return PRODUCT_PLANS[plan].usageWindows.webSearches;
}

export async function reserveWebSearchQuota(
  request: Request,
  response: Response,
  options: { automatic: boolean },
): Promise<WebSearchQuotaReservation> {
  const plan = response.locals.planState
    ? currentPlanIdFromState(response.locals.planState)
    : toPreviewPlan(response.locals.userProfile?.tier);
  const policy = webQuotaPolicy(plan);
  const resetAtFor = (windowStartedAt: string) => new Date(new Date(windowStartedAt).getTime() + policy.windowMs).toISOString();

  // Automatic current-law freshness checks on Free never reduce the user's
  // manually initiated monthly allowance.
  if (options.automatic && plan === "free") {
    const windowStartedAt = fixedWindowStart(policy.windowMs);
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: resetAtFor(windowStartedAt),
      settle: async () => undefined,
    };
  }

  const email = getVerifiedUser(response).email;
  if (isLoopbackDevelopmentRequest(request) && env.localCasesFallback) {
    const result = await consumePreviewUsage(email, plan, "webSearches");
    if (!result.allowed) {
      return {
        allowed: false,
        status: 429,
        error: "WEB_QUOTA_REACHED",
        message: "The Web-search allowance for the active plan has been used for this window.",
        resetAt: result.resetAt,
      };
    }
    let settled = false;
    return {
      allowed: true,
      limit: result.limit,
      remaining: Math.max(0, result.limit - result.count),
      resetAt: result.resetAt,
      settle: async (chargeable) => {
        if (settled) return;
        settled = true;
        if (!chargeable) await releasePreviewUsage(email, "webSearches");
      },
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      allowed: false,
      status: 503,
      error: "WEB_QUOTA_UNAVAILABLE",
      message: "Web-search allowance enforcement is temporarily unavailable.",
    };
  }
  const windowStartedAt = fixedWindowStart(policy.windowMs);
  const consumed = await supabase.rpc("consume_usage_quota", {
    p_email: email,
    p_feature: "webSearches",
    p_window_started_at: windowStartedAt,
    p_limit: policy.limit,
  });
  if (consumed.error) {
    return {
      allowed: false,
      status: 503,
      error: "WEB_QUOTA_UNAVAILABLE",
      message: "Web-search allowance enforcement is temporarily unavailable.",
    };
  }
  if (consumed.data !== true) {
    return {
      allowed: false,
      status: 429,
      error: "WEB_QUOTA_REACHED",
      message: "The Web-search allowance for the active plan has been used for this window.",
      resetAt: resetAtFor(windowStartedAt),
    };
  }
  let settled = false;
  return {
    allowed: true,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - 1),
    resetAt: resetAtFor(windowStartedAt),
    settle: async (chargeable) => {
      if (settled) return;
      settled = true;
      if (chargeable) return;
      const released = await supabase.rpc("release_usage_quota", {
        p_email: email,
        p_feature: "webSearches",
        p_window_started_at: windowStartedAt,
      });
      if (released.error) throw new Error("WEB_QUOTA_RELEASE_FAILED");
    },
  };
}

export async function requireModelEntitlement(request: Request, response: Response, next: NextFunction) {
  const requested = String(request.body?.context?.requestConfiguration?.model || "auto").toLowerCase() as PreviewModel;
  const model = requested in MODEL_POLICY ? requested : "auto";
  const plan = response.locals.planState ? currentPlanIdFromState(response.locals.planState) : toPreviewPlan(response.locals.userProfile?.tier);
  const policy = MODEL_POLICY[model];
  if (!hasPlanAccess(plan, policy.minimumPlan)) {
    response.status(403).json({
      ok: false,
      error: "MODEL_PLAN_LOCKED",
      message: `${policy.label} requires the ${policy.minimumPlan === "max" ? "Max" : policy.minimumPlan[0].toUpperCase() + policy.minimumPlan.slice(1)} plan.`,
    });
    return;
  }
  if (model !== "pro" && model !== "ultra") {
    next();
    return;
  }
  const feature = model === "pro" ? "proChats" : "ultraChats";
  const email = getVerifiedUser(response).email;
  if (isLoopbackDevelopmentRequest(request) && env.localCasesFallback) {
    const result = await consumePreviewUsage(email, plan, feature);
    if (!result.allowed) {
      response.status(429).json({
        ok: false,
        error: "MODEL_QUOTA_REACHED",
        message: `Your ${policy.label} message quota is used for this window.`,
        resetAt: result.resetAt,
      });
      return;
    }
    refundOnUnsuccessfulResponse(response, () => releasePreviewUsage(email, feature));
    next();
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    response.status(503).json({ ok: false, error: "MODEL_QUOTA_NOT_CONFIGURED", message: "Model quota enforcement is not configured." });
    return;
  }
  const policyWindow = PLAN_USAGE_LIMITS[plan][feature];
  const windowStartedAt = fixedWindowStart(policyWindow.windowMs);
  const consumed = await supabase.rpc("consume_usage_quota", {
    p_email: email,
    p_feature: feature,
    p_window_started_at: windowStartedAt,
    p_limit: policyWindow.limit,
  });
  if (consumed.error) {
    response.status(503).json({ ok: false, error: "MODEL_QUOTA_UNAVAILABLE", message: "Model quota enforcement is temporarily unavailable." });
    return;
  }
  if (consumed.data !== true) {
    response.status(429).json({
      ok: false,
      error: "MODEL_QUOTA_REACHED",
      message: `Your ${policy.label} message quota is used for this window.`,
      resetAt: new Date(new Date(windowStartedAt).getTime() + policyWindow.windowMs).toISOString(),
    });
    return;
  }
  refundOnUnsuccessfulResponse(response, async () => {
    const released = await supabase.rpc("release_usage_quota", {
      p_email: email,
      p_feature: feature,
      p_window_started_at: windowStartedAt,
    });
    if (released.error) throw new Error("MODEL_QUOTA_RELEASE_FAILED");
  });
  next();
}
