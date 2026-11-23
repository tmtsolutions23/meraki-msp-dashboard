/**
 * In-memory webhook event store.
 * Capped at MAX_EVENTS entries (FIFO eviction).
 * Events are lost on server restart — the Meraki API covers historical data.
 */

export interface WebhookEvent {
  id: string;
  alertType: string;
  alertLevel: string;
  occurredAt: string;
  deviceSerial: string;
  deviceName: string;
  networkName: string;
  organizationName: string;
  alertData: Record<string, unknown>;
  receivedAt: number; // Date.now() timestamp
}

/** Category derived from alertType for UI filtering */
export type WebhookCategory = "device" | "uplink" | "security" | "config" | "sensor" | "other";

const MAX_EVENTS = 500;
const events: WebhookEvent[] = [];

/** Map Meraki alertType strings to UI categories */
export function categorize(alertType: string): WebhookCategory {
  const t = alertType.toLowerCase();
  if (t.includes("device") || t.includes("offline") || t.includes("online") || t.includes("dormant")) return "device";
  if (t.includes("uplink") || t.includes("failover") || t.includes("wan")) return "uplink";
  if (t.includes("amp") || t.includes("security") || t.includes("intrusion") || t.includes("malware")) return "security";
  if (t.includes("config") || t.includes("settings") || t.includes("change")) return "config";
  if (t.includes("sensor") || t.includes("temperature") || t.includes("humidity") || t.includes("mt")) return "sensor";
  return "other";
}

/** Add an event. Trims oldest if over MAX_EVENTS. */
export function addEvent(event: WebhookEvent): void {
  events.unshift(event); // newest first
  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }
}

/** Get events, optionally filtered by timestamp and/or category. Returns a copy. */
export function getEvents(since?: number, category?: WebhookCategory): WebhookEvent[] {
  let result = [...events];
  if (since !== undefined) {
    result = result.filter((e) => e.receivedAt > since);
  }
  if (category) {
    result = result.filter((e) => categorize(e.alertType) === category);
  }
  return result;
}

/** Count events since a timestamp (for unread badge). */
export function getCount(since?: number): number {
  if (since === undefined) return events.length;
  return events.filter((e) => e.receivedAt > since).length;
}
