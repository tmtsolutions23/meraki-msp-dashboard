"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Users } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";
import { useChartColors } from "@/context/ThemeContext";
import type { MerakiOrg, NetworkClientCount, OrgClientsOverview } from "@/lib/meraki";

interface Props { org: MerakiOrg | null; editMode?: boolean }

const TIMESPANS = [
  { label: "1h",  value: 3600   },
  { label: "8h",  value: 28800  },
  { label: "24h", value: 86400  },
] as const;

export default function ClientCounts({ org, editMode }: Props) {
  const { refreshKey } = useRefresh();
  const cc = useChartColors();
  const [networks,  setNetworks]  = useState<NetworkClientCount[]>([]);
  const [overview,  setOverview]  = useState<OrgClientsOverview | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [tsIdx,     setTsIdx]     = useState(0); // default 1h

  const ts = TIMESPANS[tsIdx];

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const base = `/api/meraki/clients?orgId=${encodeURIComponent(org.id)}&timespan=${ts.value}`;
      const [netRes, ovRes] = await Promise.all([
        fetch(`${base}&mode=networks`,  { signal }),
        fetch(`${base}&mode=overview`, { signal }),
      ]);
      if (signal?.aborted) return;
      if (netRes.ok) {
        setNetworks(await netRes.json());
      } else {
        const body = await netRes.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${netRes.status}`);
      }
      if (ovRes.ok) {
        const ov = await ovRes.json();
        // Normalize — Meraki API may nest differently or omit fields
        setOverview({
          counts: {
            total: ov?.counts?.total ?? ov?.total ?? 0,
            withHeavyUsage: ov?.counts?.withHeavyUsage ?? ov?.withHeavyUsage ?? 0,
          },
          usages: {
            average: ov?.usages?.average ?? 0,
            withHeavyUsage: ov?.usages?.withHeavyUsage ?? 0,
          },
        });
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [org, ts.value]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, refreshKey]);

  const maxCount = Math.max(...networks.map((n) => n.clientCount), 1);
  const totalFromNetworks = networks.reduce((sum, n) => sum + n.clientCount, 0);

  const tsPills = (
    <div className="flex gap-1">
      {TIMESPANS.map((t, i) => (
        <button
          key={t.label}
          onClick={() => setTsIdx(i)}
          aria-pressed={tsIdx === i}
          className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
            tsIdx === i
              ? "bg-meraki-primary/15 text-meraki-primary font-semibold"
              : "text-meraki-muted hover:text-meraki-text"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <WidgetCard
      title={org ? `Client Counts — ${org.name}` : "Client Counts"}
      loading={loading}
      error={error}
      onRefresh={load}
      editMode={editMode}
      headerRight={org ? tsPills : undefined}
    >
      {!org ? (
        <p className="text-meraki-muted text-sm text-center mt-4">Select an organization</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Aggregate stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-meraki-surface rounded-lg p-3 flex items-center gap-3 border border-meraki-border">
              <Users size={18} className="text-meraki-primary" />
              <div>
                <p className="text-meraki-muted text-xs">Total Clients</p>
                <p className="text-lg font-bold text-meraki-primary">
                  {((overview?.counts?.total || totalFromNetworks) ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
            {overview && (overview.counts?.withHeavyUsage ?? 0) > 0 && (
              <div className="bg-meraki-surface rounded-lg p-3 flex items-center gap-3 border border-meraki-border">
                <Users size={18} className="text-meraki-orange" />
                <div>
                  <p className="text-meraki-muted text-xs">Heavy Users</p>
                  <p className="text-lg font-bold text-meraki-orange">
                    {(overview.counts?.withHeavyUsage ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bar chart */}
          {networks.length > 0 && (
            <div>
              <p className="text-xs text-meraki-muted font-medium uppercase tracking-wide mb-2">
                By Network (top {networks.length})
              </p>
              <ResponsiveContainer width="100%" height={Math.min(networks.length * 32 + 20, 240)}>
                <BarChart
                  layout="vertical"
                  data={networks}
                  margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="networkName"
                    tick={{ fill: cc.tickFill, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={120}
                    tickFormatter={(v: string) => v.length > 16 ? `${v.slice(0, 15)}…` : v}
                  />
                  <Tooltip
                    cursor={{ fill: cc.cursorFill }}
                    contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [v, "Clients"]}
                    itemStyle={{ color: cc.muted }}
                  />
                  <Bar dataKey="clientCount" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {networks.map((entry) => (
                      <Cell
                        key={entry.networkId}
                        fill={`rgba(120,190,32,${cc.barAlpha(entry.clientCount / maxCount)})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {networks.length === 0 && !loading && (
            <p className="text-meraki-muted text-sm text-center py-4">No client data for this period</p>
          )}
        </div>
      )}
    </WidgetCard>
  );
}
