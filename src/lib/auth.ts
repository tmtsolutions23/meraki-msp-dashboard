import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const COOKIE_NAME = "meraki-session";
const MAX_AGE = 8 * 60 * 60; // 8 hours in seconds

function getSecret(): string {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) throw new Error("DASHBOARD_SECRET environment variable is not set");
  return secret;
}

/** Create an HMAC-signed token: `expiry.nonce.signature` */
function createToken(): string {
  const expiry = Date.now() + MAX_AGE * 1000;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${expiry}.${nonce}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/** Check if the password matches using timing-safe HMAC digest comparison */
export function checkPassword(input: string): boolean {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return false;

  const secret = getSecret();
  const inputDigest = createHmac("sha256", secret).update(input).digest();
  const passDigest = createHmac("sha256", secret).update(password).digest();
  try {
    return timingSafeEqual(inputDigest, passDigest);
  } catch {
    return false;
  }
}

/** Set the session cookie */
export function setSessionCookie(): void {
  const token = createToken();
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Clear the session cookie */
export function clearSessionCookie(): void {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

