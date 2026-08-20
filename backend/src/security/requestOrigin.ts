import type { Request } from "express";
import { env } from "../config/env";

const allowedDevelopmentOrigins = new Set([
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
]);

export function isLoopbackAddress(address: string | undefined) {
  const value = address ?? "";
  return value === "::1" || value === "127.0.0.1" || value.startsWith("::ffff:127.");
}

export function isLoopbackDevelopmentRequest(request: Request) {
  if (env.nodeEnv === "production" || !isLoopbackAddress(request.socket.remoteAddress)) return false;
  const origin = request.header("origin") ?? "";
  return !origin || allowedDevelopmentOrigins.has(origin);
}
