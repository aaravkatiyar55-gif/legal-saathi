import { NextRequest, NextResponse } from "next/server";
import { proxyLegalSathiRequest } from "@/lib/server/legalSathiProxy";
import { matchLegalSathiProxyRule } from "@/lib/server/legalSathiRoutePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ path: string[] }> };
async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  if (!Array.isArray(path) || path.length === 0 || path.some((part) => !part || part === "." || part === ".." || part.includes("\\"))) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "This API route is not available." }, { status: 404 });
  }
  const backendPath = `/${path.map(encodeURIComponent).join("/")}`;
  const decodedPath = `/${path.join("/")}`;
  const rule = matchLegalSathiProxyRule(decodedPath, request.method);
  if (!rule) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "This API route is not available." }, { status: 404 });
  }
  return proxyLegalSathiRequest(request, backendPath, {
    maxBodyBytes: rule.maxBodyBytes,
    forwardAuthorization: rule.forwardAuthorization,
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
