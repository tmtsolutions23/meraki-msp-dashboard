# Meraki Webhooks Integration Design

**Date**: 2026-03-11
**Status**: Approved

## Overview

Add Meraki webhook support as a supplement to existing API polling. Webhook events provide real-time awareness of device state changes, uplink failovers, security events, and configuration changes. The API continues to serve as the primary data source for all dashboard widgets.

## Requirements

- Receive all Meraki webhook alert categories (device, uplink, config, security, sensor)
- Validate webhooks using shared secret (timing-safe comparison)
- Store events in-memory (max 500, FIFO eviction, lost on restart)
- New "Live Events" widget (8th widget) with category filter pills
- Unread badge on widget header (count since last view)
- No new dependencies — reuse existing patterns and infrastructure

## Architecture

### Webhook Ingestion

**`POST /api/webhooks/meraki`** (public, no auth)
- Receives Meraki webhook POST payloads
- Validates `sharedSecret` field against `MERAKI_WEBHOOK_SECRET` env var using timing-safe comparison
- Parses and stores event in the in-memory store
- Returns 200 OK immediately

**`GET /api/webhooks/events`** (auth required)
- Returns stored events as JSON
- Query params: `?since=<timestamp>` for new events, `?category=<type>` for filtering

### In-Memory Event Store

**`src/lib/webhookStore.ts`**
- Module-level singleton array
- Max 500 events, oldest dropped first
- Event shape: `{ id, alertType, alertLevel, occurredAt, deviceSerial, deviceName, networkName, organizationName, alertData, receivedAt }`
- Exports: `addEvent()`, `getEvents(since?, category?)`, `getCount(since?)`

### Live Events Widget

**`src/components/widgets/LiveEvents.tsx`**
- 8th grid widget, positioned below alerts feed by default
- Fetches from `/api/webhooks/events` on existing refresh cycle (`useRefresh()`)
- Category filter pills: All, Device, Uplink, Security, Config, Sensor
- Severity color coding matching AlertsFeed conventions
- Unread badge: green count on widget header, tracked via `localStorage` key `meraki-webhook-last-seen`
- Empty state message directing user to configure webhooks in Meraki dashboard

### Integration Points

- **Middleware**: Add `/api/webhooks/meraki` to `PUBLIC_PATHS`
- **Dashboard.tsx**: Add widget to grid layouts (all breakpoints), widget registry, visibility toggle
- **`.env.local.example`**: Document `MERAKI_WEBHOOK_SECRET`
- **No changes** to RefreshContext, ThemeContext, or existing widgets

## Security

- Shared secret validation with timing-safe comparison (reuses existing `timingSafeCompare` pattern)
- Webhook endpoint is public (Meraki can't send session cookies) but secret-gated
- Events endpoint requires auth (existing session cookie)
- No rate limiting on webhook endpoint (Meraki controls send rate)
- TLS required in production (Vercel/Cloudflare provide this)

## Trade-offs

- **In-memory vs persistent storage**: Events lost on restart, but API covers historical data. Zero new dependencies.
- **Polling vs SSE/WebSocket**: Widget polls on refresh interval. Simpler architecture, consistent with other widgets. Slight delay (30s-5m) acceptable for dashboard use.
- **Shared secret vs HMAC signature**: Meraki uses shared secret in payload, not header-based HMAC. Simple but requires TLS.
