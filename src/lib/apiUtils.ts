/**
 * Shared API route utilities: input validation and error sanitization.
 */

// ── Error sanitization ────────────────────────────────────────────────────────

/**
 * Returns a safe, generic error message for API responses.
 * Logs the real error server-side so it stays out of HTTP responses.
 */
export function safeError(err: unknown, context: string): string {
  // Log full detail on the server only
  const safeMsg = err instanceof Error ? err.message : String(err);
  console.error(`[meraki-api] ${context}: ${safeMsg}`);
  if (err instanceof Error) {
    // Surface Meraki HTTP status codes without body content
    const match = err.message.match(/Request failed with status code (\d{3})/);
    if (match) return `Meraki API error (HTTP ${match[1]})`;
  }
  return "An internal error occurred";
}

// ── Input validation ──────────────────────────────────────────────────────────

// Meraki org/network IDs: alphanumeric, underscores, hyphens, 1-64 chars
const ID_RE = /^[A-Za-z0-9_\-]{1,64}$/;
// Device serials: e.g. Q2XX-XXXX-XXXX — alphanumeric + hyphens, 1-32 chars
const SERIAL_RE = /^[A-Za-z0-9\-]{1,32}$/;

export function validateId(value: string | null, name: string): string {
  if (!value || !ID_RE.test(value)) {
    throw new ValidationError(`Invalid or missing parameter: ${name}`);
  }
  return value;
}

export function validateSerial(value: string | null | undefined): string {
  if (!value || !SERIAL_RE.test(value)) {
    throw new ValidationError("Invalid or missing device serial");
  }
  return value;
}

/**
 * Parses a query parameter as a positive integer, clamped to [min, max].
 * Returns the fallback if the value is missing, NaN, or out of range.
 */
export function parseIntParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return Math.floor(n);
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Returns the correct HTTP response for a caught error.
 */
export function errorResponse(err: unknown, context: string): Response {
  if (err instanceof ValidationError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const msg = safeError(err, context);
  return new Response(JSON.stringify({ error: msg }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
