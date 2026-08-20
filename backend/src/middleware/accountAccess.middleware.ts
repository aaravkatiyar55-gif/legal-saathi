import { NextFunction, Request, Response } from "express";
import { authenticateRequest, getVerifiedUser } from "./identity.middleware";
import { env } from "../config/env";
import { getUserProfile, OnlineUserStoreError } from "../services/supabase/onlineUsers.service";
import { ensurePreviewProfile, getPreviewProfile } from "../services/local/previewAccess.service";
import { isLoopbackDevelopmentRequest } from "../security/requestOrigin";
import { CreditLedgerUnavailableError } from "../services/billing/creditLedger.service";
import { getPlanState } from "../services/billing/planState.service";

async function attachPlanState(response: Response) {
  const email = getVerifiedUser(response).email;
  response.locals.planState = await getPlanState(email, response.locals.userProfile?.tier ?? "free");
}

export function readRequestAccountEmail(_request: Request, response?: Response) {
  return response ? getVerifiedUser(response).email : "";
}

export async function requireActiveOnlineAccount(request: Request, response: Response, next: NextFunction) {
  try {
    response.locals.authUser = await authenticateRequest(request);
    if (isLoopbackDevelopmentRequest(request) && env.localCasesFallback) {
      const email = getVerifiedUser(response).email;
      response.locals.userProfile = await getPreviewProfile(email) || await ensurePreviewProfile({ email });
      if (response.locals.userProfile.isBanned) {
        response.status(403).json({ ok: false, error: "ACCOUNT_BANNED", message: "Your account is restricted. Please contact support." });
        return;
      }
      await attachPlanState(response);
      next();
      return;
    }
    const profile = await getUserProfile(getVerifiedUser(response).email);
    if (profile?.isBanned) {
      response.status(403).json({
        ok: false,
        error: "ACCOUNT_BANNED",
        message: "Your account is restricted. Please contact support.",
      });
      return;
    }
    response.locals.userProfile = profile;
    await attachPlanState(response);
    next();
  } catch (error) {
    if (error instanceof CreditLedgerUnavailableError) {
      response.status(503).json({ ok: false, error: "PLAN_STATE_UNAVAILABLE", message: "Plan and unit enforcement is temporarily unavailable." });
      return;
    }
    if (error instanceof OnlineUserStoreError || response.locals.authUser) {
      if (isLoopbackDevelopmentRequest(request) && env.localCasesFallback && response.locals.authUser) {
        const email = getVerifiedUser(response).email;
        response.locals.userProfile = await getPreviewProfile(email) || await ensurePreviewProfile({ email });
        await attachPlanState(response);
        next();
        return;
      }
      response.status(503).json({ ok: false, error: "Account status could not be verified" });
      return;
    }
    response.status(401).json({
      ok: false,
      error: "AUTH_REQUIRED",
      message: error instanceof Error ? error.message : "Google sign-in is required",
    });
  }
}
