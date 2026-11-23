# Meraki MSP Dashboard

A multi-organization **Cisco Meraki** monitoring dashboard for managed service providers. One screen shows every
customer org's devices, uplinks, clients, bandwidth, alerts and licenses, a live feed of Meraki webhook events, and
one-click **replacement quotes** for end-of-life hardware through Quoter (ScalePad).

Built for an MSP network team that manages many Meraki organizations and wants one pane of glass instead of clicking
through each org in the Meraki dashboard.

## Features

**Home view (all organizations)**
- Org overview: device counts and health across every org the API key can see.
- License overview: expiring and expired licenses across orgs.
- Live events: Meraki webhook alerts as they arrive, with category filters and an unread badge.

**Organization view**
- Device health grouped by model type, offline and alerting devices first. A device drawer shows the details.
- Uplink status per network (WAN up/down, failover).
- Bandwidth chart per network.
- Client counts.
- Alerts feed that links straight to the affected device or network.
- License status per org.
- Network list.

**End-of-life replacement quotes**
- A bundled table of Meraki EOL/EOS dates with a recommended replacement model and license for each device.
- For an EOL device, **Generate quote** finds the customer and replacement SKUs in Quoter and creates a draft quote.

**Dashboard**
- Drag-and-drop, resizable widget grid (react-grid-layout).
- Light and dark theme, auto-refresh.
- Keyboard-accessible lists.

## Security

- **Login:** single-PIN login with HMAC-signed, HttpOnly, SameSite=strict session cookies (8 h) and a timing-safe
  password check.
- **Rate limiting:** applied per IP and per route, with 5 login attempts per minute.
- **Webhooks:** the endpoint validates Meraki's shared secret.
- **Browser hardening:** per-request CSP nonces set in middleware, plus HSTS, `X-Frame-Options: DENY`, `nosniff` and a
  restrictive `Permissions-Policy`.
- **Secrets:** all credentials come from environment variables, and nothing is stored client-side.

## Stack

Next.js 14 (App Router, route handlers as an API proxy) · React 18 · TypeScript · Tailwind CSS · Recharts ·
react-grid-layout · Meraki Dashboard API v1 · Quoter API

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill it in
npm run dev                        # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `MERAKI_API_KEY` | Meraki Dashboard API key (read access to the orgs you want to see) |
| `DASHBOARD_PASSWORD` | PIN for logging in to the dashboard |
| `DASHBOARD_SECRET` | Random secret for signing session cookies (`openssl rand -hex 32`) |
| `MERAKI_WEBHOOK_SECRET` | Shared secret configured on the Meraki webhook receiver (optional) |
| `QUOTER_CLIENT_ID`, `QUOTER_CLIENT_SECRET` | Quoter API credentials (optional; enables replacement quotes) |

**Webhooks:** in the Meraki dashboard, add an HTTP server pointing to `https://<your-host>/api/webhooks/meraki` with the
same shared secret. Events are kept in memory (the most recent 500); history comes from the Meraki API. The design notes
are in [docs/plans](docs/plans).

Deploy anywhere that runs Next.js (Vercel, a container, a VM) behind HTTPS.

## License

[MIT](LICENSE)
