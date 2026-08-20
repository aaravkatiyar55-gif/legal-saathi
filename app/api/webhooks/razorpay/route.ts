import { NextRequest } from "next/server";
import { proxyLegalSathiRequest } from "@/lib/server/legalSathiProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return proxyLegalSathiRequest(request, "/payments/razorpay/webhook", { maxBodyBytes: 256 * 1024, webhook: true });
}
