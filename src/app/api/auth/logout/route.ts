import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  // Only clear the cookie if one is actually present (prevents CSRF forced-logout)
  const token = request.cookies.get("meraki-session")?.value;
  if (token) {
    clearSessionCookie();
  }
  return NextResponse.json({ success: true });
}
