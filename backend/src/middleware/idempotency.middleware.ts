import type { NextFunction, Request, Response } from "express";
import { getVerifiedUser } from "./identity.middleware";

const inFlight = new Set<string>();
const completed = new Map<string, number>();
const SUCCESS_REPLAY_WINDOW_MS = 5 * 60 * 1000;

function pruneExpired() {
  const now = Date.now();
  for (const [key, expiresAt] of completed) {
    if (expiresAt <= now) completed.delete(key);
  }
  if (completed.size > 10_000) {
    for (const key of completed.keys()) {
      completed.delete(key);
      if (completed.size <= 8_000) break;
    }
  }
}

export function rejectDuplicateRequest(request: Request, response: Response, next: NextFunction) {
  pruneExpired();
  const requestId = String(response.locals.requestId ?? "");
  const identity = getVerifiedUser(response);
  const key = `${identity.email}\n${request.path}\n${requestId}`;
  if (inFlight.has(key) || completed.has(key)) {
    response.status(409).json({ ok: false, error: "DUPLICATE_REQUEST", message: "This request was already accepted. Start a fresh retry if needed." });
    return;
  }
  inFlight.add(key);
  let settled = false;
  const finalize = () => {
    if (settled) return;
    settled = true;
    inFlight.delete(key);
    if (response.writableFinished && response.statusCode < 400) completed.set(key, Date.now() + SUCCESS_REPLAY_WINDOW_MS);
  };
  response.once("finish", finalize);
  response.once("close", finalize);
  next();
}
