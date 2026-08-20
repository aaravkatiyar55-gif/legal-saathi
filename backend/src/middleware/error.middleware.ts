import { NextFunction, Request, Response } from "express";

export function errorMiddleware(
  error: Error & { type?: string; status?: number; body?: unknown },
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  const requestId = String(response.locals.requestId ?? "unknown-request");
  if (response.headersSent) {
    _next(error);
    return;
  }
  if (error.type === "entity.too.large" || error.status === 413) {
    response.status(413).json({ ok: false, error: "PAYLOAD_TOO_LARGE", message: "The request body is too large.", requestId });
    return;
  }
  if (error instanceof SyntaxError && error.body !== undefined) {
    response.status(400).json({ ok: false, error: "INVALID_JSON", message: "Send a valid JSON request body.", requestId });
    return;
  }
  console.error(`[Legal Saathi] Unhandled backend error requestId=${requestId} type=${error.name || "Error"}`);
  response.status(500).json({
    ok: false,
    error: "internal_server_error",
    message: "The backend could not complete this request.",
    requestId,
  });
}
