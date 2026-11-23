# Meraki Webhooks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Meraki webhook support with an in-memory event store, webhook ingestion endpoint, events API, and a new Live Events dashboard widget with category filtering and unread badge.

**Architecture:** POST `/api/webhooks/meraki` receives Meraki webhook payloads, validates shared secret, stores in a capped in-memory array. GET `/api/webhooks/events` serves stored events to the authenticated dashboard. A new `LiveEvents` widget displays events with category filters and an unread count badge.

**Tech Stack:** Next.js 14 App Router, TypeScript, React, Tailwind CSS, lucide-react icons

---

### Task 1: Webhook Event Store

**Files:**
- Create: `src/lib/webhookStore.ts`

**Step 1: Create the webhook event store module**

```typescript
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

/** Get events, optionally filtered by timestamp and/or category. */
export function getEvents(since?: number, category?: WebhookCategory): WebhookEvent[] {
  let result = events;
  if (since) {
    result = result.filter((e) => e.receivedAt > since);
  }
  if (category) {
    result = result.filter((e) => categorize(e.alertType) === category);
  }
  return result;
}

/** Count events since a timestamp (for unread badge). */
export function getCount(since?: number): number {
  if (!since) return events.length;
  return events.filter((e) => e.receivedAt > since).length;
}
```

**Step 2: Commit**

```bash
git add src/lib/webhookStore.ts
git commit -m "feat: add in-memory webhook event store"
```

---

### Task 2: Webhook Ingestion Endpoint

**Files:**
- Create: `src/app/api/webhooks/meraki/route.ts`
- Modify: `src/middleware.ts` (add to PUBLIC_PATHS)

**Step 1: Create the webhook receiver route**

Create `src/app/api/webhooks/meraki/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { addEvent } from "@/lib/webhookStore";

/**
 * Timing-safe comparison to prevent timing attacks on the shared secret.
 * Same pattern as middleware.ts.
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  let result = 0;
  for (let i = 0; i < aBuf.length; i++) {
    result |= aBuf[i] ^ bBuf[i];
  }
  return result === 0;
}

export async function POST(request: NextRequest) {
  const secret = process.env.MERAKI_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate shared secret
  const incomingSecret = typeof body.sharedSecret === "string" ? body.sharedSecret : "";
  if (!incomingSecret || !timingSafeCompare(incomingSecret, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Parse Meraki webhook payload
  const event = {
    id: crypto.randomUUID(),
    alertType: String(body.alertType ?? "unknown"),
    alertLevel: String(body.alertLevel ?? "informational"),
    occurredAt: String(body.occurredAt ?? new Date().toISOString()),
    deviceSerial: String(body.deviceSerial ?? ""),
    deviceName: String(body.deviceName ?? ""),
    networkName: String(body.networkName ?? ""),
    organizationName: String(body.organizationName ?? ""),
    alertData: typeof body.alertData === "object" && body.alertData !== null
      ? (body.alertData as Record<string, unknown>)
      : {},
    receivedAt: Date.now(),
  };

  addEvent(event);
  return NextResponse.json({ success: true });
}
```

**Step 2: Add webhook path to PUBLIC_PATHS in middleware**

In `src/middleware.ts`, change line 6:

```typescript
// Before:
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

// After:
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/webhooks/meraki"];
```

**Step 3: Commit**

```bash
git add src/app/api/webhooks/meraki/route.ts src/middleware.ts
git commit -m "feat: add webhook ingestion endpoint with shared secret validation"
```

---

### Task 3: Webhook Events API

**Files:**
- Create: `src/app/api/webhooks/events/route.ts`

**Step 1: Create the events endpoint**

Create `src/app/api/webhooks/events/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getEvents, getCount, type WebhookCategory } from "@/lib/webhookStore";

const VALID_CATEGORIES = new Set<WebhookCategory>([
  "device", "uplink", "security", "config", "sensor", "other",
]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Parse ?since= (timestamp in ms)
  const sinceParam = searchParams.get("since");
  const since = sinceParam ? Number(sinceParam) : undefined;
  if (sinceParam && (!Number.isFinite(since!) || since! < 0)) {
    return NextResponse.json({ error: "Invalid 'since' parameter" }, { status: 400 });
  }

  // Parse ?category=
  const categoryParam = searchParams.get("category");
  const category = categoryParam && VALID_CATEGORIES.has(categoryParam as WebhookCategory)
    ? (categoryParam as WebhookCategory)
    : undefined;

  // Parse ?countOnly= for badge polling
  const countOnly = searchParams.get("countOnly") === "true";

  if (countOnly) {
    return NextResponse.json({ count: getCount(since) });
  }

  const events = getEvents(since, category);
  return NextResponse.json(events);
}
```

**Step 2: Commit**

```bash
git add src/app/api/webhooks/events/route.ts
git commit -m "feat: add authenticated webhook events API with filtering"
```

---

### Task 4: Live Events Widget

**Files:**
- Create: `src/components/widgets/LiveEvents.tsx`

**Step 1: Create the LiveEvents widget**

Create `src/components/widgets/LiveEvents.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Radio, AlertCircle, AlertTriangle, Info, Wifi, Shield, Settings, Thermometer } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";

interface WebhookEvent {
  id: string;
  alertType: string;
  alertLevel: string;
  occurredAt: string;
  deviceSerial: string;
  deviceName: string;
  networkName: string;
  organizationName: string;
  alertData: Record<string, unknown>;
  receivedAt: number;
}

type Category = "all" | "device" | "uplink" | "security" | "config" | "sensor" | "other";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all",      label: "All" },
  { key: "device",   label: "Device" },
  { key: "uplink",   label: "Uplink" },
  { key: "security", label: "Security" },
  { key: "config",   label: "Config" },
  { key: "sensor",   label: "Sensor" },
];

const levelConfig = {
  critical:      { icon: AlertCircle,   color: "text-meraki-red",    bg: "bg-meraki-red/10",    border: "border-meraki-red/30" },
  warning:       { icon: AlertTriangle, color: "text-meraki-yellow", bg: "bg-meraki-yellow/10", border: "border-meraki-yellow/30" },
  informational: { icon: Info,          color: "text-meraki-teal",   bg: "bg-meraki-teal/10",   border: "border-meraki-teal/30" },
};

const categoryIcons: Record<string, typeof Radio> = {
  device:   Radio,
  uplink:   Wifi,
  security: Shield,
  config:   Settings,
  sensor:   Thermometer,
};

function categorize(alertType: string): string {
  const t = alertType.toLowerCase();
  if (t.includes("device") || t.includes("offline") || t.includes("online") || t.includes("dormant")) return "device";
  if (t.includes("uplink") || t.includes("failover") || t.includes("wan")) return "uplink";
  if (t.includes("amp") || t.includes("security") || t.includes("intrusion") || t.includes("malware")) return "security";
  if (t.includes("config") || t.includes("settings") || t.includes("change")) return "config";
  if (t.includes("sensor") || t.includes("temperature") || t.includes("humidity") || t.includes("mt")) return "sensor";
  return "other";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const LAST_SEEN_KEY = "meraki-webhook-last-seen";

interface Props {
  editMode?: boolean;
}

export default function LiveEvents({ editMode }: Props) {
  const { refreshKey } = useRefresh();
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Category>("all");
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const url = filter === "all"
        ? "/api/webhooks/events"
        : `/api/webhooks/events?category=${filter}`;
      const res = await fetch(url, { signal });
      if (signal?.aborted) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data: WebhookEvent[] = await res.json();
      setEvents(data);

      // Calculate unread count
      const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) || "0");
      setUnreadCount(data.filter((e) => e.receivedAt > lastSeen).length);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, refreshKey]);

  // Mark as seen when user views events
  const markSeen = useCallback(() => {
    localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    setUnreadCount(0);
  }, []);

  // Mark seen on first load with events
  useEffect(() => {
    if (events.length > 0 && !loading) {
      markSeen();
    }
  }, [events, loading, markSeen]);

  const badge = unreadCount > 0 ? (
    <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-meraki-primary text-white text-xs font-bold">
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  ) : null;

  const filterBar = (
    <div className="flex gap-1">
      {badge}
      {CATEGORIES.map((c) => (
        <button
          key={c.key}
          onClick={() => setFilter(c.key)}
          aria-pressed={filter === c.key}
          className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
            filter === c.key
              ? "bg-meraki-primary/15 text-meraki-primary"
              : "text-meraki-muted hover:text-meraki-text"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );

  return (
    <WidgetCard
      title="Live Events"
      loading={loading}
      onRefresh={load}
      editMode={editMode}
      headerRight={filterBar}
    >
      {error ? (
        <p role="alert" className="text-meraki-red text-sm">{error}</p>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-meraki-muted">
          <Radio size={28} />
          <p className="text-sm text-center">No webhook events received yet</p>
          <p className="text-xs text-center">Configure webhooks in your Meraki dashboard</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const cfg = levelConfig[event.alertLevel as keyof typeof levelConfig] ?? levelConfig.informational;
            const Icon = cfg.icon;
            const cat = categorize(event.alertType);
            const CatIcon = categoryIcons[cat] ?? Radio;
            return (
              <div
                key={event.id}
                className={`flex gap-3 p-3 rounded-lg border ${cfg.bg} ${cfg.border}`}
              >
                <Icon size={15} className={`${cfg.color} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-meraki-text leading-tight">
                      {event.alertType}
                    </p>
                    <span className="text-xs text-meraki-muted shrink-0">
                      {timeAgo(event.occurredAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <CatIcon size={10} className="text-meraki-muted" />
                    <span className="text-xs text-meraki-muted capitalize">{cat}</span>
                  </div>
                  {(event.deviceName || event.deviceSerial) && (
                    <p className="text-xs text-meraki-muted mt-0.5 truncate">
                      {event.deviceName || event.deviceSerial}
                      {event.networkName && ` · ${event.networkName}`}
                    </p>
                  )}
                  {event.organizationName && (
                    <p className="text-xs text-meraki-muted/70 mt-0.5 truncate">
                      {event.organizationName}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/widgets/LiveEvents.tsx
git commit -m "feat: add Live Events widget with category filtering and unread badge"
```

---

### Task 5: Integrate Widget into Dashboard

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Step 1: Add import**

After the BandwidthChart import (line 19), add:

```typescript
import LiveEvents    from "@/components/widgets/LiveEvents";
```

**Step 2: Add "live-events" to DEFAULT_LAYOUTS**

Add to each breakpoint after the bandwidth-chart entry:

- `lg`: `{ i: "live-events", x: 0, y: 35, w: 12, h: 11, minW: 3, minH: 7 }`
- `md`: `{ i: "live-events", x: 0, y: 46, w: 10, h: 11 }`
- `sm`: `{ i: "live-events", x: 0, y: 79, w: 6, h: 11 }`
- `xs`: `{ i: "live-events", x: 0, y: 79, w: 4, h: 11, minW: 2 }`
- `xxs`: `{ i: "live-events", x: 0, y: 79, w: 2, h: 11, minW: 2 }`

**Step 3: Add to WIDGET_LABELS**

```typescript
"live-events":     "Live Events",
```

**Step 4: Add to renderWidget switch**

```typescript
case "live-events":    return <LiveEvents editMode={editMode} />;
```

**Step 5: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: integrate Live Events widget into dashboard grid"
```

---

### Task 6: Update Environment Configuration

**Files:**
- Modify: `.env.local.example`
- Modify: `.env` (add webhook secret)

**Step 1: Add MERAKI_WEBHOOK_SECRET to .env.local.example**

Append after the DASHBOARD_SECRET line:

```
# Meraki Webhook Secret
# Set this to the same shared secret configured in your Meraki dashboard webhook settings
MERAKI_WEBHOOK_SECRET=your_webhook_shared_secret_here
```

**Step 2: Generate and add a webhook secret to .env**

```bash
# Generate a random secret
openssl rand -hex 32
```

Add the generated value to `.env`:

```
MERAKI_WEBHOOK_SECRET=<generated_value>
```

**Step 3: Commit (only .env.local.example — .env is gitignored)**

```bash
git add .env.local.example
git commit -m "docs: add MERAKI_WEBHOOK_SECRET to env example"
```

---

### Task 7: Verify and Test

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Test webhook ingestion**

```bash
# Should return 403 (wrong secret)
curl -X POST http://localhost:3000/api/webhooks/meraki \
  -H "Content-Type: application/json" \
  -d '{"sharedSecret":"wrong","alertType":"test"}'

# Should return 200 (correct secret — use value from .env)
curl -X POST http://localhost:3000/api/webhooks/meraki \
  -H "Content-Type: application/json" \
  -d '{"sharedSecret":"VALUE_FROM_ENV","alertType":"Device went offline","alertLevel":"critical","deviceName":"MX-Office","networkName":"HQ-Network","organizationName":"Test Org","occurredAt":"2026-03-11T12:00:00Z"}'
```

**Step 3: Test events API**

```bash
# Should return events (requires auth cookie — test in browser console)
# Navigate to dashboard, open dev tools console:
fetch("/api/webhooks/events").then(r => r.json()).then(console.log)
```

**Step 4: Verify the Live Events widget appears on the dashboard**

- Log into the dashboard
- Scroll down — Live Events widget should appear below the bandwidth chart
- It should show the test event sent via curl
- Category filter pills should work
- Edit mode should allow repositioning

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Meraki webhook integration with Live Events widget"
```
