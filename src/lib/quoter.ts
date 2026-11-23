/**
 * Quoter (ScalePad) API client.
 * OAuth2 client credentials flow, token auto-refresh, rate-paced requests.
 */

const BASE_URL = "https://api.quoter.com/v1";
const MAX_RPS = 4; // stay under Quoter's 5/sec limit
const REQ_INTERVAL = Math.ceil(1000 / MAX_RPS);

// ── Token cache ──────────────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Date.now() + ms
}

let tokenCache: TokenCache | null = null;

function getCredentials() {
  const clientId = process.env.QUOTER_CLIENT_ID;
  const clientSecret = process.env.QUOTER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isQuoterConfigured(): boolean {
  return getCredentials() !== null;
}

async function authenticate(): Promise<string> {
  const creds = getCredentials();
  if (!creds) throw new Error("Quoter API credentials not configured");

  // Return cached token if still valid (with 60s buffer)
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  // Try refresh token first
  if (tokenCache?.refreshToken) {
    try {
      const res = await fetch(`${BASE_URL}/auth/oauth/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: tokenCache.refreshToken,
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        tokenCache = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? tokenCache.refreshToken,
          expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
        };
        return tokenCache.accessToken;
      }
    } catch { /* fall through to full auth */ }
  }

  // Full client credentials auth
  const res = await fetch(`${BASE_URL}/auth/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Quoter auth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  tokenCache = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return tokenCache.accessToken;
}

// ── Rate-paced API helper ────────────────────────────────────────────────────

let lastRequestAt = 0;

async function quoterFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await authenticate();

  // Pace requests
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + REQ_INTERVAL - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  // If 401, clear cache and retry once
  if (res.status === 401 && tokenCache) {
    tokenCache = null;
    const newToken = await authenticate();
    lastRequestAt = Date.now();
    return fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${newToken}`,
        ...options.headers,
      },
    });
  }

  return res;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface QuoterCustomer {
  id: number;
  name: string;
}

export interface QuoterItem {
  id: number;
  name: string;
  sku: string;
  price: number;
}

export interface QuoterQuote {
  id: number;
  url?: string;
  name?: string;
}

/** Search for a customer by name. Returns best match or null. */
export async function findCustomer(orgName: string): Promise<QuoterCustomer | null> {
  const res = await quoterFetch(`/customers?search=${encodeURIComponent(orgName)}&per_page=10`);
  if (!res.ok) return null;

  const data = await res.json();
  const customers: QuoterCustomer[] = data.data ?? data ?? [];
  if (customers.length === 0) return null;

  // Prefer exact name match, otherwise first result
  const exact = customers.find(
    (c) => c.name.toLowerCase() === orgName.toLowerCase()
  );
  return exact ?? customers[0];
}

/** Search for an item by SKU/name. Returns best match or null. */
export async function findItem(search: string): Promise<QuoterItem | null> {
  const res = await quoterFetch(`/items?search=${encodeURIComponent(search)}&per_page=10`);
  if (!res.ok) return null;

  const data = await res.json();
  const items: QuoterItem[] = data.data ?? data ?? [];
  if (items.length === 0) return null;

  // Prefer exact SKU match
  const exact = items.find(
    (item) => item.sku?.toLowerCase() === search.toLowerCase()
      || item.name?.toLowerCase() === search.toLowerCase()
  );
  return exact ?? items[0];
}

/** Create a new quote for a customer. */
export async function createQuote(
  customerId: number,
  name: string
): Promise<QuoterQuote> {
  const res = await quoterFetch("/quotes", {
    method: "POST",
    body: JSON.stringify({
      customer_id: customerId,
      name,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create quote (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.data ?? data;
}

/** Add a line item to a quote. */
export async function addLineItem(
  quoteId: number,
  itemId: number,
  quantity: number,
  description?: string
): Promise<void> {
  const res = await quoterFetch("/line_items", {
    method: "POST",
    body: JSON.stringify({
      quote_id: quoteId,
      item_id: itemId,
      quantity,
      ...(description ? { description } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to add line item (${res.status}): ${body}`);
  }
}
