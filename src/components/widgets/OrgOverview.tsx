"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Network, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";
import type { OrgSummary } from "@/lib/meraki";

export default function OrgOverview({ editMode }: { editMode?: boolean }) {
  const { refreshKey } = useRefresh();
  const [data, setData] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meraki/organizations?summary=true", { signal });
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
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, refreshKey]);

  const totals = data.reduce(
    (acc, s) => ({
      networks: acc.networks + s.networkCount,
      online:   acc.online   + s.deviceCounts.online,
      offline:  acc.offline  + s.deviceCounts.offline,
      alerting: acc.alerting + s.deviceCounts.alerting,
      total:    acc.total    + s.deviceCounts.total,
    }),
    { networks: 0, online: 0, offline: 0, alerting: 0, total: 0 }
  );

  return (
    <WidgetCard title="Organization Overview" loading={loading} error={error} onRefresh={load} editMode={editMode}>
      {
        <div className="flex flex-col gap-4">
          {/* Top-level stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatTile icon={<Building2 size={18} />} label="Organizations" value={data.length} color="text-meraki-primary" />
            <StatTile icon={<Network size={18} />}   label="Networks"      value={totals.networks} color="text-meraki-primary" />
            <StatTile icon={<Wifi size={18} />}      label="Online"        value={totals.online}   color="text-meraki-green" />
            <StatTile icon={<WifiOff size={18} />}   label="Offline"       value={totals.offline}  color="text-meraki-red" />
          </div>

          {totals.alerting > 0 && (
            <div className="flex items-center gap-2 bg-meraki-orange/10 border border-meraki-orange/30 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="text-meraki-orange shrink-0" />
              <span className="text-meraki-orange text-xs font-medium">
                {totals.alerting} device{totals.alerting !== 1 ? "s" : ""} alerting
              </span>
            </div>
          )}

          {/* Per-org breakdown */}
          <div className="space-y-1">
            {data.map((s) => (
              <OrgRow key={s.org.id} summary={s} />
            ))}
          </div>
        </div>
      }
    </WidgetCard>
  );
}

function StatTile({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-meraki-surface rounded-lg p-3 flex items-center gap-3 border border-meraki-border">
      <span className={color}>{icon}</span>
      <div>
        <p className="text-meraki-muted text-xs">{label}</p>
        <p className={`text-lg font-bold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

function OrgRow({ summary: s }: { summary: OrgSummary }) {
  const pct = s.deviceCounts.total > 0
    ? Math.round((s.deviceCounts.online / s.deviceCounts.total) * 100)
    : 0;

  return (
    <div className="flex items-center gap-3 py-2 border-b border-meraki-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-meraki-text truncate">{s.org.name}</p>
        <p className="text-xs text-meraki-muted">{s.networkCount} networks · {s.deviceCounts.total} devices</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${s.org.name} online devices`}
          className="w-16 h-1.5 bg-meraki-border rounded-full overflow-hidden"
        >
          <div
            className="h-full bg-meraki-green rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-meraki-muted w-8 text-right">{pct}%</span>
      </div>
    </div>
  );
}
