"use client";

import { useEffect, useState, useCallback } from "react";
import { Globe } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";
import type { OrgUplink, MerakiOrg } from "@/lib/meraki";

interface Props {
  org: MerakiOrg | null;
  editMode?: boolean;
}

export default function UplinkStatus({ org, editMode }: Props) {
  const { refreshKey } = useRefresh();
  const [data, setData] = useState<OrgUplink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meraki/uplinks?orgId=${org.id}`, { signal });
      if (signal?.aborted) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
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

  const degraded = data.filter((u) =>
    u.uplinks.some((ul) => ul.status !== "active")
  );

  return (
    <WidgetCard
      title={org ? `WAN Uplinks — ${org.name}` : "WAN Uplinks"}
      loading={loading}
      error={error}
      onRefresh={load}
      editMode={editMode}
    >
      {!org ? (
        <p className="text-meraki-muted text-sm text-center mt-4">Select an organization</p>
      ) : data.length === 0 ? (
        <p className="text-meraki-muted text-sm text-center mt-4">No appliance uplink data</p>
      ) : (
        <div className="space-y-3">
          {degraded.length > 0 && (
            <p className="text-xs text-meraki-orange font-medium">
              {degraded.length} site{degraded.length !== 1 ? "s" : ""} with degraded uplinks
            </p>
          )}
          {data.map((appliance) => (
            <div key={appliance.serial} className="border border-meraki-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-meraki-surface">
                <Globe size={12} className="text-meraki-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-meraki-text truncate block">
                    {appliance.networkName}
                  </span>
                  {appliance.name && appliance.name !== appliance.networkName && (
                    <span className="text-xs text-meraki-muted truncate block">{appliance.name}</span>
                  )}
                </div>
                <span className="text-xs text-meraki-muted shrink-0">{appliance.model}</span>
              </div>
              {appliance.uplinks.map((ul) => (
                <div key={ul.interface} className="flex items-center gap-3 px-3 py-2 border-t border-meraki-border/50">
                  <span className="text-xs text-meraki-muted w-10">{ul.interface}</span>
                  <span className="text-xs text-meraki-muted flex-1 truncate">{ul.publicIp || ul.ip}</span>
                  <UplinkStatusBadge status={ul.status} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

function UplinkStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:       "text-meraki-green",
    ready:        "text-meraki-green",
    "not connected": "text-meraki-red",
    failed:       "text-meraki-red",
    connecting:   "text-meraki-yellow",
  };
  const color = map[status.toLowerCase()] ?? "text-meraki-muted";
  return <span className={`text-xs font-medium capitalize ${color}`}>{status}</span>;
}
