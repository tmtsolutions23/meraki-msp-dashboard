"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Network, Users, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";
import type { MerakiOrg, MerakiNetwork, DeviceStatus } from "@/lib/meraki";

interface Props {
  org: MerakiOrg | null;
  editMode?: boolean;
}

interface NetworkClients {
  networkId: string;
  networkName: string;
  clientCount: number;
}

export default function OrgSummary({ org, editMode }: Props) {
  const { refreshKey } = useRefresh();
  const [networks, setNetworks] = useState<MerakiNetwork[]>([]);
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [netClients, setNetClients] = useState<NetworkClients[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const [netRes, devRes, clientRes] = await Promise.all([
        fetch(`/api/meraki/networks?orgId=${encodeURIComponent(org.id)}`, { signal }),
        fetch(`/api/meraki/devices?orgId=${encodeURIComponent(org.id)}`, { signal }),
        fetch(`/api/meraki/clients?orgId=${encodeURIComponent(org.id)}&mode=networks&timespan=3600`, { signal }),
      ]);
      if (signal?.aborted) return;

      if (netRes.ok) setNetworks(await netRes.json());
      if (devRes.ok) setDevices(await devRes.json());
      if (clientRes.ok) setNetClients(await clientRes.json());

      // If all three fail, show an error
      if (!netRes.ok && !devRes.ok && !clientRes.ok) {
        const body = await netRes.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${netRes.status}`);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, refreshKey]);

  const deviceCounts = devices.reduce<Record<string, number>>(
    (acc, d) => ({ ...acc, [d.status]: (acc[d.status] ?? 0) + 1 }),
    {}
  );
  const totalClients = netClients.reduce((sum, n) => sum + n.clientCount, 0);

  return (
    <WidgetCard
      title={org?.name ?? "Organization"}
      loading={loading}
      error={error}
      onRefresh={load}
      editMode={editMode}
    >
      {!org ? (
        <p className="text-meraki-muted text-sm text-center mt-4">Select an organization</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            <StatTile icon={<Network size={16} />} label="Networks" value={networks.length} color="text-meraki-primary" />
            <StatTile icon={<Wifi size={16} />} label="Online" value={deviceCounts["online"] ?? 0} color="text-meraki-green" />
            <StatTile icon={<Users size={16} />} label="Clients" value={totalClients} color="text-meraki-teal" />
          </div>

          {(deviceCounts["offline"] ?? 0) > 0 && (
            <div className="flex items-center gap-2 bg-meraki-red/10 border border-meraki-red/30 rounded-lg px-3 py-1.5">
              <WifiOff size={12} className="text-meraki-red" />
              <span className="text-xs text-meraki-red font-medium">
                {deviceCounts["offline"]} device{deviceCounts["offline"] !== 1 ? "s" : ""} offline
              </span>
            </div>
          )}
          {(deviceCounts["alerting"] ?? 0) > 0 && (
            <div className="flex items-center gap-2 bg-meraki-orange/10 border border-meraki-orange/30 rounded-lg px-3 py-1.5">
              <AlertTriangle size={12} className="text-meraki-orange" />
              <span className="text-xs text-meraki-orange font-medium">
                {deviceCounts["alerting"]} device{deviceCounts["alerting"] !== 1 ? "s" : ""} alerting
              </span>
            </div>
          )}

          {/* Networks with client counts */}
          <div>
            <p className="text-xs text-meraki-muted font-medium uppercase tracking-wide mb-2">
              Networks ({networks.length})
            </p>
            <div className="space-y-1">
              {networks.map((net) => {
                const clients = netClients.find((nc) => nc.networkId === net.id)?.clientCount ?? 0;
                return (
                  <div key={net.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg border border-meraki-border/50 bg-meraki-surface">
                    <Network size={11} className="text-meraki-primary shrink-0" />
                    <span className="text-xs text-meraki-text truncate flex-1">{net.name}</span>
                    {clients > 0 && (
                      <span className="text-xs text-meraki-teal font-medium shrink-0">
                        {clients} client{clients !== 1 ? "s" : ""}
                      </span>
                    )}
                    <div className="flex gap-0.5 shrink-0">
                      {net.productTypes.map((pt) => (
                        <span key={pt} className="text-[10px] bg-meraki-primary/10 text-meraki-primary rounded px-1 py-0.5">
                          {pt}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {networks.length === 0 && !loading && (
                <p className="text-xs text-meraki-muted py-2 text-center">No networks</p>
              )}
            </div>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

function StatTile({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number; color: string;
}) {
  return (
    <div className="bg-meraki-surface rounded-lg p-2.5 flex items-center gap-2 border border-meraki-border">
      <span className={color}>{icon}</span>
      <div>
        <p className="text-meraki-muted text-[10px]">{label}</p>
        <p className={`text-base font-bold ${color}`}>{value}</p>
      </div>
    </div>
  );
}
