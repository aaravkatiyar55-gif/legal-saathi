import { NextFunction, Request, Response } from "express";
import { UserTier } from "../services/supabase/onlineUsers.service";

const tierRank: Record<UserTier, number> = { free: 0, plus: 1, pro: 2, advocate: 3 };

export function requireMinimumTier(minimumTier: UserTier) {
  return (_request: Request, response: Response, next: NextFunction) => {
    const currentTier = (response.locals.userProfile?.tier ?? "free") as UserTier;
    if ((tierRank[currentTier] ?? 0) < tierRank[minimumTier]) {
      response.status(403).json({
        ok: false,
        error: "TIER_REQUIRED",
        message: `${minimumTier} tier or higher is required for this feature.`,
      });
      return;
    }
    next();
  };
}
