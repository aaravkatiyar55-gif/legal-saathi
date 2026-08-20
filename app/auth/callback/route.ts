import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const destination = new URL("/", request.url);
  destination.searchParams.set("auth", "request-new-code");
  destination.hash = "auth-recovery";
  return NextResponse.redirect(destination, 303);
}
