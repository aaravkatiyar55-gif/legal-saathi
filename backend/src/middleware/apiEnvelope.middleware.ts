import type { NextFunction, Request, Response } from "express";

const allowedErrorFields = [
  "guidance",
  "disclaimer",
  "couponInvalid",
  "resetAt",
  "retryAfter",
  "configured",
  "liveTest",
  "requestedModelClass",
  "resolvedModelClass",
  "webUsed",
  "ragUsed",
] as const;

function errorCode(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (/^[A-Z][A-Z0-9_]{1,80}$/.test(raw)) return raw;
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return normalized || "REQUEST_FAILED";
}

function publicMessage(body: Record<string, unknown>) {
  const candidate = typeof body.message === "string"
    ? body.message
    : typeof body.error === "string" && /\s/.test(body.error)
      ? body.error
      : "The request could not be completed.";
  return candidate
    .replace(/(?:[A-Za-z]:\\|\/)(?:[^\s"']+[\\/]){1,}[^\s"']*/g, "[redacted path]")
    .replace(/\b(?:sk-|eyJ|ghp_|github_pat_)[A-Za-z0-9_.-]+\b/g, "[redacted]")
    .slice(0, 320);
}

export function apiEnvelopeMiddleware(_request: Request, response: Response, next: NextFunction) {
  const originalJson = response.json.bind(response);
  response.json = ((body: unknown) => {
    if (!body || typeof body !== "object" || (body as { ok?: unknown }).ok !== false) return originalJson(body);
    const source = body as Record<string, unknown>;
    const safe: Record<string, unknown> = {
      ok: false,
      error: errorCode(source.error),
      message: publicMessage(source),
      requestId: String(response.locals.requestId ?? "unknown-request"),
    };
    for (const key of allowedErrorFields) {
      if (source[key] !== undefined) safe[key] = source[key];
    }
    return originalJson(safe);
  }) as Response["json"];
  next();
}
