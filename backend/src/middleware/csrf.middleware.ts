import { NextFunction, Request, Response } from "express";
import { requireSessionCsrf } from "../services/local/authSessions.service";

export async function requireCsrfForSession(request: Request, response: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    next();
    return;
  }
  try {
    if (await requireSessionCsrf(request)) {
      next();
      return;
    }
    response.status(403).json({ ok: false, error: "CSRF_REQUIRED", message: "Refresh your session and try again." });
  } catch {
    response.status(403).json({ ok: false, error: "CSRF_REQUIRED", message: "Refresh your session and try again." });
  }
}
