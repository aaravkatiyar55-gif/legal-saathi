import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "ENDPOINT_RETIRED", message: "Use the authenticated Legal Saathi backend document endpoint." },
    { status: 410 },
  );
}
