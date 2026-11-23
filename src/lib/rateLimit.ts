/**
 * Simple in-memory sliding-window rate limiter.
 * Limits requests per IP per endpoint.
 */

interface Entry {
  timestamps: number[];
}

const store = new Map<string, Entry>();

// Clean up stale entries every 60s — .unref() prevents the timer from keeping the process alive
const cleanup = setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => {
    entry.timestamps = entry.timestamps.filter((t: number) => now - t < 60_000);
    if (entry.timestamps.length === 0) store.delete(key);
  });
}, 60_000);
cleanup.unref();

/**
 * Returns true if the request should be allowed, false if rate-limited.
 * @param ip    - Client IP address
 * @param route - Route identifier (e.g. "/api/meraki/devices")
 * @param limit - Max requests per window (default 30)
 * @param windowMs - Window size in ms (default 60000 = 1 minute)
 */
export function rateLimit(
  ip: string,
  route: string,
  limit = 30,
  windowMs = 60_000
): boolean {
  const key = `${ip}:${route}`;
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= limit) {
    return false; // rate limited
  }

  entry.timestamps.push(now);
  store.set(key, entry);
  return true; // allowed
}

/**
 * Extract client IP from request headers.
 * Prefers x-real-ip (set by trusted reverse proxy), then rightmost x-forwarded-for
 * (the IP added by the last trusted proxy), falls back to 127.0.0.1.
 * NOTE: In production, configure your reverse proxy to set x-real-ip.
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim());
    // Use rightmost non-empty entry (added by the last proxy, harder to spoof)
    return parts[parts.length - 1] || parts[0] || "127.0.0.1";
  }
  return "127.0.0.1";
}

/**
 * Returns a 429 response if rate-limited, or null if allowed.
 */
export function checkRateLimit(request: Request, route: string, limit?: number): Response | null {
  const ip = getClientIp(request);
  if (!rateLimit(ip, route, limit)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      }
    );
  }
  return null;
}
