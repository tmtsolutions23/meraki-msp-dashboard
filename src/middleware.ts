import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timingSafe";

const COOKIE_NAME = "meraki-session";

/** Paths that don't require authentication */
const PUBLIC_PATHS = ["/login", "/api/auth/login"];
/** Paths that bypass auth with exact matching only (no prefix) */
const PUBLIC_EXACT_PATHS = ["/api/webhooks/meraki"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
    || PUBLIC_EXACT_PATHS.includes(pathname);
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg")
  );
}

/** HMAC-SHA256 using Web Crypto API (Edge Runtime compatible) */
async function hmacSha256(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiryStr, nonce, sig] = parts;
  if (!expiryStr || !nonce || !sig) return false;

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;

  const payload = `${expiryStr}.${nonce}`;
  const expected = await hmacSha256(secret, payload);
  return await timingSafeCompare(sig, expected);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Generate a CSP nonce for inline scripts
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  // Build CSP header (skip in dev — webpack HMR requires eval/dynamic scripts)
  const cspHeader = isDev ? "" :
    `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';`;

  // Skip auth for public paths and static assets
  if (isPublicPath(pathname) || isStaticAsset(pathname)) {
    const response = NextResponse.next();
    response.headers.set("x-nonce", nonce);
    if (cspHeader) response.headers.set("Content-Security-Policy", cspHeader);
    return response;
  }

  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) {
    // Missing secret is a misconfiguration — block all access
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Server misconfiguration: DASHBOARD_SECRET is not set" },
        { status: 500 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token, secret))) {
    // For API routes, return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    // For pages, redirect to login with return URL
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.headers.set("x-nonce", nonce);
  if (cspHeader) response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
