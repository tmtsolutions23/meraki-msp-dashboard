/**
 * Timing-safe string comparison using HMAC digests.
 * Both inputs are HMAC-hashed to produce fixed-length (32-byte) digests,
 * eliminating the length oracle that a naive byte-by-byte comparison would leak.
 * The hardcoded HMAC key is intentional — the security property needed is
 * constant-length outputs for constant-time XOR, not key secrecy.
 * Compatible with both Edge Runtime and Node.js (uses Web Crypto API only).
 */
export async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode("timing-safe-compare-key"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const [ha, hb] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(a)),
    crypto.subtle.sign("HMAC", key, enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  // Constant-time XOR comparison of fixed-length HMAC digests
  let result = 0;
  for (let i = 0; i < va.length; i++) {
    result |= va[i] ^ vb[i];
  }
  // Both digests are identical length (32 bytes), so if XOR is 0 and
  // original inputs had the same length, the strings are equal
  return result === 0 && a.length === b.length;
}
