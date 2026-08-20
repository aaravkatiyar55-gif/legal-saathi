import "server-only";

import { randomUUID } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { NextRequest, NextResponse } from "next/server";
import { rewriteBackendCookiePath, splitCombinedSetCookieHeader } from "./cookiePath";
import {
  legalChatUpstreamTimeoutMs,
  legalChatWarmupTimeoutMs,
  shouldWakeBackendForAuth,
  shouldWakeBackendForLegalChat,
} from "./legalSathiProxyPolicy";
import { buildProxyUpstreamUrl } from "./proxyUrl";

export { shouldWakeBackendForAuth, shouldWakeBackendForLegalChat } from "./legalSathiProxyPolicy";

type ProxyOptions = {
  maxBodyBytes?: number;
  webhook?: boolean;
  forwardAuthorization?: boolean;
};

const defaultLocalBackend = "http://localhost:8000";
const authWakeupTimeoutMs = 18_000;
const upstreamRequestTimeoutMs = 38_000;
const googleAuth = new GoogleAuth();
let backendWakeupInFlight: Promise<void> | null = null;
let backendWakeupReadyUntil = 0;

function backendConfiguration() {
  const configured = process.env.LEGAL_SATHI_BACKEND_INTERNAL_URL?.trim();
  if (process.env.NODE_ENV === "production" && !configured) {
    throw new Error("BACKEND_INTERNAL_URL_NOT_CONFIGURED");
  }
  const baseUrl = new URL(configured || defaultLocalBackend);
  if (process.env.NODE_ENV === "production" && baseUrl.hostname === "localhost") {
    throw new Error("BACKEND_INTERNAL_URL_NOT_CONFIGURED");
  }
  return {
    baseUrl: baseUrl.toString().replace(/\/$/, ""),
    audience: (process.env.LEGAL_SATHI_BACKEND_AUDIENCE || baseUrl.origin).trim(),
    needsServiceIdentity: process.env.LEGAL_SATHI_USE_SERVICE_IDENTITY === "true",
  };
}

async function serviceAuthorization(audience: string) {
  const client = await googleAuth.getIdTokenClient(audience);
  const headers = await client.getRequestHeaders();
  return headers.get("Authorization") || "";
}

async function wakeBackend(baseUrl: string, timeoutMs: number) {
  if (backendWakeupReadyUntil > Date.now()) return;
  if (!backendWakeupInFlight) {
    backendWakeupInFlight = (async () => {
      const healthUrl = buildProxyUpstreamUrl(baseUrl, "/health", "");
      if (!healthUrl) return;
      try {
        await fetch(healthUrl, {
          method: "GET",
          headers: { accept: "application/json" },
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
        backendWakeupReadyUntil = Date.now() + 15_000;
      } catch {
        // The original mutation is still attempted once below. This is a
        // bounded wake-up wait, never an unsafe retry of the mutation itself.
      } finally {
        backendWakeupInFlight = null;
      }
    })();
  }
  await backendWakeupInFlight;
}

function copyResponseHeaders(upstream: Response, requestId: string) {
  const headers = new Headers();
  for (const name of ["content-type", "cache-control", "retry-after", "x-request-id", "content-disposition"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const getSetCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = typeof getSetCookie === "function"
    ? getSetCookie.call(upstream.headers)
    : splitCombinedSetCookieHeader(upstream.headers.get("set-cookie") || "");
  if (cookies.length > 0) cookies.forEach((cookie) => headers.append("set-cookie", rewriteBackendCookiePath(cookie)));
  headers.set("cache-control", "no-store");
  headers.set("x-request-id", upstream.headers.get("x-request-id") || requestId);
  return headers;
}

export async function proxyLegalSathiRequest(request: NextRequest, backendPath: string, options: ProxyOptions = {}) {
  try {
    const configuration = backendConfiguration();
    const maxBodyBytes = options.maxBodyBytes ?? 768 * 1024;
    const upstreamUrl = buildProxyUpstreamUrl(configuration.baseUrl, backendPath, request.nextUrl.search);
    if (!upstreamUrl) {
      return NextResponse.json({ ok: false, error: "REQUEST_QUERY_TOO_LARGE", message: "This request query is too large." }, { status: 414 });
    }
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > maxBodyBytes) {
      return NextResponse.json({ ok: false, error: "REQUEST_TOO_LARGE", message: "This request is too large." }, { status: 413 });
    }

    const method = request.method.toUpperCase();
    let body: ArrayBuffer | undefined;
    if (method !== "GET" && method !== "HEAD") {
      body = await request.arrayBuffer();
      if (body.byteLength > maxBodyBytes) {
        return NextResponse.json({ ok: false, error: "REQUEST_TOO_LARGE", message: "This request is too large." }, { status: 413 });
      }
    }

    const requestedId = request.headers.get("x-request-id") || "";
    const requestId = /^[A-Za-z0-9_-]{8,120}$/.test(requestedId) ? requestedId : randomUUID();
    const startedAt = Date.now();
    const headers = new Headers();
    for (const name of ["content-type", "cookie", "x-csrf-token", "x-request-id", "x-razorpay-signature", "x-razorpay-event-id"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (options.forwardAuthorization) {
      const authorization = request.headers.get("authorization");
      if (authorization) headers.set("authorization", authorization);
    }
    headers.set("x-request-id", requestId);
    if (configuration.needsServiceIdentity) {
      const serviceHeader = await serviceAuthorization(configuration.audience);
      if (!serviceHeader) throw new Error("BACKEND_SERVICE_IDENTITY_UNAVAILABLE");
      headers.set("x-serverless-authorization", serviceHeader);
    }
    headers.set("accept", request.headers.get("accept") || "application/json");

    // Render instances can sleep. Auth keeps its established 18s warm-up. A
    // first legal-chat mutation gets an 8s idempotent health warm-up and a 34s
    // upstream budget: 42s total, leaving margin below the browser's 45s
    // request deadline. Neither the auth nor chat mutation is retried.
    const warmAuth = shouldWakeBackendForAuth(method, backendPath);
    const warmLegalChat = shouldWakeBackendForLegalChat(method, backendPath);
    if (warmAuth || warmLegalChat) {
      await wakeBackend(configuration.baseUrl, warmLegalChat ? legalChatWarmupTimeoutMs : authWakeupTimeoutMs);
    }

    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: body ? Buffer.from(body) : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(options.webhook ? 12_000 : warmLegalChat ? legalChatUpstreamTimeoutMs : upstreamRequestTimeoutMs),
    });
    console.info("[LegalSaathi BFF]", { requestId, path: backendPath, status: upstream.status, durationMs: Date.now() - startedAt });
    return new NextResponse(upstream.body, { status: upstream.status, headers: copyResponseHeaders(upstream, requestId) });
  } catch (error) {
    const requestId = request.headers.get("x-request-id") || randomUUID();
    const setupError = error instanceof Error && /NOT_CONFIGURED|SERVICE_IDENTITY/.test(error.message);
    const timeout = error instanceof Error && error.name === "TimeoutError";
    console.warn("[LegalSaathi BFF]", { requestId, path: backendPath, category: setupError ? "configuration" : timeout ? "timeout" : "unavailable" });
    return NextResponse.json({
      ok: false,
      error: setupError ? "BACKEND_PROXY_NOT_CONFIGURED" : timeout ? "BACKEND_PROXY_TIMEOUT" : "BACKEND_PROXY_UNAVAILABLE",
      message: setupError ? "The private backend connection is not configured." : timeout ? "The Legal Saathi backend took too long to respond." : "The Legal Saathi backend could not be reached.",
      requestId,
    }, { status: setupError ? 503 : timeout ? 504 : 502, headers: { "cache-control": "no-store", "x-request-id": requestId } });
  }
}
