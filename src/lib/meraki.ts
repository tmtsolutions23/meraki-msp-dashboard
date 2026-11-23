import axios, { AxiosInstance } from "axios";

const ALLOWED_HOSTS = ["api.meraki.com", "api.meraki.cn"];

function validateBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("MERAKI_BASE_URL must use https:");
    }
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      throw new Error(`MERAKI_BASE_URL hostname not allowed: ${parsed.hostname}. Allowed: ${ALLOWED_HOSTS.join(", ")}`);
    }
    return url;
  } catch (e) {
    if (e instanceof Error && e.message.includes("MERAKI_BASE_URL")) throw e;
    throw new Error(`Invalid MERAKI_BASE_URL: ${(e as Error).message}`);
  }
}

const BASE_URL = validateBaseUrl(
  process.env.MERAKI_BASE_URL ?? "https://api.meraki.com/api/v1"
);

let _client: AxiosInstance | null = null;

function createClient(): AxiosInstance {
  if (_client) return _client;
  const apiKey = process.env.MERAKI_API_KEY;
  if (!apiKey) {
    throw new Error("MERAKI_API_KEY environment variable is not set");
  }
  _client = axios.create({
    baseURL: BASE_URL,
    headers: {
      "X-Cisco-Meraki-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
  return _client;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MerakiOrg {
  id: string;
  name: string;
  url: string;
  api: { enabled: boolean };
  licensing: { model: string };
  cloud: { region: { name: string } };
}

export interface MerakiNetwork {
  id: string;
  organizationId: string;
  name: string;
  productTypes: string[];
  timeZone: string;
  tags: string[];
  enrollmentString: string | null;
  url: string;
  notes: string;
  isBoundToConfigTemplate: boolean;
}

export interface MerakiDevice {
  serial: string;
  name: string;
  mac: string;
  networkId: string;
  productType: string;
  model: string;
  address: string;
  lat: number;
  lng: number;
  notes: string;
  tags: string[];
  firmware: string;
  url: string;
}

export interface DeviceStatus {
  serial: string;
  name: string;
  mac: string;
  publicIp: string;
  networkId: string;
  status: "online" | "offline" | "alerting" | "dormant";
  lastReportedAt: string;
  productType: string;
  model: string;
  tags: string[];
  usingCellularFailover: boolean;
  wan1Ip: string | null;
  wan2Ip: string | null;
  gateway: string | null;
  ipType: string | null;
  primaryDns: string | null;
  secondaryDns: string | null;
}

export interface OrgUplink {
  organizationId: string;
  networkId: string;
  networkName: string;
  serial: string;
  model: string;
  name: string;
  highAvailability: { enabled: boolean; role: string };
  lastReportedAt: string;
  uplinks: {
    interface: string;
    status: string;
    ip: string;
    gateway: string;
    publicIp: string;
    primaryDns: string;
    secondaryDns: string;
    ipAssignedBy: string;
  }[];
}

export interface MerakiAlert {
  id: string;
  occurredAt: string;
  resolvedAt: string | null;
  category: string;
  type: string;
  severity: "critical" | "warning" | "informational";
  networkId: string;
  networkName: string;
  title: string;
  description: string;
  device: {
    serial: string;
    name: string;
    productType: string;
    model: string;
    mac: string;
    url: string;
  } | null;
}

export interface OrgSummary {
  org: MerakiOrg;
  networkCount: number;
  deviceCounts: { online: number; offline: number; alerting: number; dormant: number; total: number };
}

// ─── API Functions ─────────────────────────────────────────────────────────────

export async function getOrganizations(): Promise<MerakiOrg[]> {
  const client = createClient();
  const { data } = await client.get<MerakiOrg[]>("/organizations");
  return data;
}

export async function getOrganization(orgId: string): Promise<MerakiOrg> {
  const client = createClient();
  const { data } = await client.get<MerakiOrg>(`/organizations/${orgId}`);
  return data;
}

export async function getNetworks(orgId: string): Promise<MerakiNetwork[]> {
  const client = createClient();
  const { data } = await client.get<MerakiNetwork[]>(`/organizations/${orgId}/networks`);
  return data;
}

export async function getDeviceStatuses(orgId: string): Promise<DeviceStatus[]> {
  const client = createClient();
  const { data } = await client.get<DeviceStatus[]>(
    `/organizations/${orgId}/devices/statuses`,
    { params: { total_pages: "all" } }
  );
  return data;
}

export async function getUplinks(orgId: string): Promise<OrgUplink[]> {
  const client = createClient();
  const [{ data: uplinks }, networks] = await Promise.all([
    client.get<OrgUplink[]>(
      `/organizations/${orgId}/appliance/uplink/statuses`,
      { params: { total_pages: "all" } }
    ),
    getNetworks(orgId).catch(() => [] as MerakiNetwork[]),
  ]);
  // Enrich with network names — the uplink API only returns networkId
  const nameMap = new Map(networks.map((n) => [n.id, n.name]));
  return uplinks.map((u) => ({
    ...u,
    networkName: u.networkName || nameMap.get(u.networkId) || u.networkId,
    name: u.name || u.serial,
  }));
}

export async function getAlerts(orgId: string): Promise<MerakiAlert[]> {
  const client = createClient();
  const { data } = await client.get<Record<string, unknown>[]>(
    `/organizations/${orgId}/assurance/alerts`,
    { params: { total_pages: "all", perPage: 100 } }
  );
  // Normalize the assurance alerts API response to our interface
  return data.map((raw) => {
    const scope = raw.scope as { devices?: Record<string, unknown>[] } | undefined;
    const network = raw.network as { id?: string; name?: string } | undefined;
    const firstDevice = scope?.devices?.[0];

    return {
      id: String(raw.id ?? ""),
      occurredAt: String(raw.startedAt ?? raw.occurredAt ?? ""),
      resolvedAt: raw.resolvedAt ? String(raw.resolvedAt) : null,
      category: String(raw.categoryType ?? raw.category ?? ""),
      type: String(raw.type ?? ""),
      title: String(raw.title ?? raw.type ?? ""),
      description: String(raw.description ?? ""),
      severity: (raw.severity as MerakiAlert["severity"]) ?? "informational",
      networkId: String(network?.id ?? raw.networkId ?? ""),
      networkName: String(network?.name ?? raw.networkName ?? ""),
      device: firstDevice ? {
        serial: String(firstDevice.serial ?? ""),
        name: String(firstDevice.name ?? ""),
        productType: String(firstDevice.productType ?? ""),
        model: String(firstDevice.model ?? ""),
        mac: String(firstDevice.mac ?? ""),
        url: String(firstDevice.url ?? ""),
      } : null,
    };
  });
}

// ─── New Types ─────────────────────────────────────────────────────────────────

export interface DeviceDetail {
  serial: string;
  name: string;
  mac: string;
  networkId: string;
  productType: string;
  model: string;
  address: string;
  lat: number;
  lng: number;
  notes: string;
  tags: string[];
  firmware: string;
  url: string;
  lanIp: string | null;
  wan1Ip: string | null;
  wan2Ip: string | null;
}

export interface DeviceManagementInterface {
  wan1: {
    wanEnabled: string;
    usingStaticIp: boolean;
    staticIp: string | null;
    staticSubnetMask: string | null;
    staticGatewayIp: string | null;
    staticDns: string[];
    vlan: number | null;
  };
  wan2: {
    wanEnabled: string;
    usingStaticIp: boolean;
    staticIp: string | null;
    staticSubnetMask: string | null;
    staticGatewayIp: string | null;
    staticDns: string[];
    vlan: number | null;
  };
}

export interface NetworkEvent {
  occurredAt: string;
  networkId: string;
  type: string;
  description: string;
  clientId: string | null;
  clientDescription: string | null;
  clientMac: string | null;
  deviceSerial: string | null;
  deviceName: string | null;
  ssidNumber: number | null;
  alertId: string | null;
  alertType: string | null;
  data: Record<string, unknown>;
}

export interface DevicePerformance {
  perfScore: number;
}

export interface BandwidthPoint {
  ts: string;
  sent: number;
  received: number;
  total: number;
}

export interface NetworkClientCount {
  networkId: string;
  networkName: string;
  clientCount: number;
}

export interface OrgClientsOverview {
  counts: { total: number; withHeavyUsage: number };
  usages: { average: number; withHeavyUsage: number };
}

// ─── New API Functions ──────────────────────────────────────────────────────────

export async function getDevice(serial: string): Promise<DeviceDetail> {
  const client = createClient();
  const { data } = await client.get<DeviceDetail>(`/devices/${serial}`);
  return data;
}

export async function getDeviceManagementInterface(serial: string): Promise<DeviceManagementInterface> {
  const client = createClient();
  const { data } = await client.get<DeviceManagementInterface>(`/devices/${serial}/managementInterface`);
  return data;
}

export async function getDevicePerformance(serial: string): Promise<DevicePerformance> {
  const client = createClient();
  const { data } = await client.get<DevicePerformance>(`/devices/${serial}/appliance/performance`);
  return data;
}

export async function getNetworkEvents(
  networkId: string,
  deviceSerial?: string,
  perPage = 20
): Promise<NetworkEvent[]> {
  const client = createClient();
  const { data } = await client.get<{ message: string; events: NetworkEvent[] }>(
    `/networks/${networkId}/events`,
    { params: { perPage, ...(deviceSerial ? { deviceSerial } : {}) } }
  );
  return data.events ?? [];
}

interface UplinkUsagePoint {
  startTime: string;
  endTime: string;
  byInterface: { interface: string; sent: number | null; received: number | null }[];
}

export async function getNetworkBandwidthHistory(
  networkId: string,
  timespan = 86400,
  resolution = 600
): Promise<BandwidthPoint[]> {
  const client = createClient();
  // Use the appliance WAN uplink usage endpoint for real firewall throughput
  const { data } = await client.get<UplinkUsagePoint[]>(
    `/networks/${networkId}/appliance/uplinks/usageHistory`,
    { params: { timespan, resolution } }
  );
  // Aggregate all WAN interfaces (wan1 + wan2) per time bucket, values are in bytes
  return data.map((p) => {
    let sent = 0;
    let received = 0;
    for (const iface of p.byInterface ?? []) {
      sent += iface.sent ?? 0;
      received += iface.received ?? 0;
    }
    return {
      ts: p.startTime,
      sent,
      received,
      total: sent + received,
    };
  });
}

export async function getOrgClientsOverview(
  orgId: string,
  timespan = 3600
): Promise<OrgClientsOverview> {
  const client = createClient();
  const { data } = await client.get<OrgClientsOverview>(
    `/organizations/${orgId}/clients/overview`,
    { params: { timespan } }
  );
  return data;
}

export async function getNetworkClientCounts(
  orgId: string,
  timespan = 3600
): Promise<NetworkClientCount[]> {
  const networks = await getNetworks(orgId);
  const limited  = networks.slice(0, 12); // cap to avoid rate limits

  const merakiClient = createClient();
  const results = await Promise.allSettled(
    limited.map(async (n): Promise<NetworkClientCount> => {
      const { data } = await merakiClient.get<unknown[]>(
        `/networks/${n.id}/clients`,
        { params: { timespan, perPage: 1000 } }
      );
      return { networkId: n.id, networkName: n.name, clientCount: data.length };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<NetworkClientCount> => r.status === "fulfilled")
    .map((r) => r.value)
    .sort((a, b) => b.clientCount - a.clientCount);
}

import type { OrgLicenseInfo, OrgLicenseDetail } from "@/lib/licenseTypes";

interface LicenseOverviewRaw {
  status: string;
  expirationDate: string;
  licensedDeviceCounts: Record<string, number>;
}

/** Fetch license overview for a single org */
export async function getOrgLicenseOverview(orgId: string): Promise<OrgLicenseDetail> {
  const client = createClient();
  const { data } = await client.get<LicenseOverviewRaw>(
    `/organizations/${orgId}/licenses/overview`
  );

  const expDate = data.expirationDate && data.expirationDate !== "N/A"
    ? new Date(data.expirationDate) : null;
  const daysRemaining = expDate && !isNaN(expDate.getTime())
    ? Math.ceil((expDate.getTime() - Date.now()) / 86400000) : null;

  // Try to get per-device licenses for detailed breakdown
  let perDeviceLicenses: OrgLicenseDetail["perDeviceLicenses"] = [];
  try {
    const { data: licenses } = await client.get<Record<string, unknown>[]>(
      `/organizations/${orgId}/licenses`,
      { params: { perPage: 1000, total_pages: "all" } }
    );
    perDeviceLicenses = licenses.map((l) => ({
      id: String(l.id ?? ""),
      licenseType: String(l.licenseType ?? ""),
      licenseKey: String(l.licenseKey ?? ""),
      state: String(l.state ?? ""),
      deviceSerial: l.deviceSerial ? String(l.deviceSerial) : null,
      deviceName: l.deviceName ? String(l.deviceName) : null,
      expirationDate: String(l.expirationDate ?? ""),
      claimDate: String(l.claimDate ?? ""),
      durationInDays: Number(l.durationInDays ?? 0),
    }));
  } catch {
    // Per-device licenses not available (co-term orgs return 400)
  }

  return {
    status: data.status,
    expirationDate: data.expirationDate ?? "N/A",
    daysRemaining,
    licensedDeviceCounts: data.licensedDeviceCounts ?? {},
    perDeviceLicenses,
  };
}

/** Fetch license overview for all orgs, return only those expiring/expired */
export async function getLicenseAlerts(): Promise<OrgLicenseInfo[]> {
  const orgs = await getOrganizations();
  const client = createClient();

  const results = await Promise.allSettled(
    orgs.filter((o) => o.api?.enabled).map(async (org): Promise<OrgLicenseInfo | null> => {
      try {
        const { data } = await client.get<LicenseOverviewRaw>(
          `/organizations/${org.id}/licenses/overview`
        );
        if (!data.expirationDate || data.expirationDate === "N/A") return null;

        // Parse the Meraki date format: "Aug 31, 2026 UTC"
        const expDate = new Date(data.expirationDate);
        if (isNaN(expDate.getTime())) return null;
        const daysRemaining = Math.ceil((expDate.getTime() - Date.now()) / 86400000);

        // Only return expired or expiring within 180 days
        if (data.status === "OK" && daysRemaining > 180) return null;

        return {
          orgId: org.id,
          orgName: org.name,
          orgUrl: org.url,
          status: data.status,
          expirationDate: data.expirationDate,
          daysRemaining,
          licensedDeviceCounts: data.licensedDeviceCounts ?? {},
        };
      } catch {
        return null;
      }
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<OrgLicenseInfo | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r): r is OrgLicenseInfo => r !== null)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export async function getOrgSummaries(): Promise<OrgSummary[]> {
  const orgs = await getOrganizations();

  const summaries = await Promise.allSettled(
    orgs.map(async (org): Promise<OrgSummary> => {
      const [networks, statuses] = await Promise.allSettled([
        getNetworks(org.id),
        getDeviceStatuses(org.id),
      ]);

      const networkCount = networks.status === "fulfilled" ? networks.value.length : 0;

      const deviceCounts = { online: 0, offline: 0, alerting: 0, dormant: 0, total: 0 };
      if (statuses.status === "fulfilled") {
        for (const d of statuses.value) {
          deviceCounts.total++;
          deviceCounts[d.status] = (deviceCounts[d.status] ?? 0) + 1;
        }
      }

      return { org, networkCount, deviceCounts };
    })
  );

  return summaries
    .filter((r): r is PromiseFulfilledResult<OrgSummary> => r.status === "fulfilled")
    .map((r) => r.value);
}
