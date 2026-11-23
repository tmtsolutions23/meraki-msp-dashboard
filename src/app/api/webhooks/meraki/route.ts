import { NextRequest, NextResponse } from "next/server";
import { addEvent } from "@/lib/webhookStore";
import { checkRateLimit } from "@/lib/rateLimit";
import { timingSafeCompare } from "@/lib/timingSafe";

/** Truncate a string to a maximum length */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

export async function POST(request: NextRequest) {
  // Rate limit: 60 requests/minute per IP
  const limited = checkRateLimit(request, "/api/webhooks/meraki", 60);
  if (limited) return limited;

  const secret = process.env.MERAKI_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  // Reject oversized payloads before parsing
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 65536) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate shared secret
  const incomingSecret = typeof body.sharedSecret === "string" ? body.sharedSecret : "";
  if (!incomingSecret || !(await timingSafeCompare(incomingSecret, secret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Replay protection: reject webhooks with stale or missing sentAt
  const sentAt = typeof body.sentAt === "string" ? new Date(body.sentAt).getTime() : NaN;
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60 * 1000) {
    return NextResponse.json({ error: "Request expired or missing sentAt" }, { status: 403 });
  }

  // Validate occurredAt as a parseable date
  const occurredAtRaw = typeof body.occurredAt === "string" && !isNaN(Date.parse(body.occurredAt))
    ? body.occurredAt
    : new Date().toISOString();

  // Parse Meraki webhook payload with size bounds
  let safeAlertData: Record<string, unknown> = {};
  try {
    if (typeof body.alertData === "object" && body.alertData !== null) {
      const raw = JSON.stringify(body.alertData);
      safeAlertData = raw.length <= 4096 ? (body.alertData as Record<string, unknown>) : {};
    }
  } catch { /* malformed alertData — use empty object */ }

  const event = {
    id: crypto.randomUUID(),
    alertType: truncate(String(body.alertType ?? "unknown"), 256),
    alertLevel: truncate(String(body.alertLevel ?? "informational"), 64),
    occurredAt: occurredAtRaw,
    deviceSerial: truncate(String(body.deviceSerial ?? ""), 64),
    deviceName: truncate(String(body.deviceName ?? ""), 256),
    networkName: truncate(String(body.networkName ?? ""), 256),
    organizationName: truncate(String(body.organizationName ?? ""), 256),
    alertData: safeAlertData as Record<string, unknown>,
    receivedAt: Date.now(),
  };

  addEvent(event);
  return NextResponse.json({ success: true });
}
