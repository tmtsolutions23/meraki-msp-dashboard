"use client";

import { useEffect, useState, useCallback, useId } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { ChevronDown } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";
import { useListboxKeys } from "@/lib/useListboxKeys";
import { useChartColors } from "@/context/ThemeContext";
import type { MerakiOrg, MerakiNetwork, BandwidthPoint } from "@/lib/meraki";

interface Props { org: MerakiOrg | null; editMode?: boolean }

const TIMESPANS = [
  { label: "2h",  timespan: 7200,  resolution: 60    },
  { label: "24h", timespan: 86400, resolution: 600   },
  { label: "7d",  timespan: 604800, resolution: 3600 },
] as const;

/** Format bandwidth in bytes to human-readable */
function fmtBandwidth(bytes: number): string {
  if (bytes === 0)              return "0 B";
  if (bytes < 1024)             return `${bytes.toFixed(0)} B`;
  if (bytes < 1048576)          return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824)       return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function fmtTime(iso: string, timespan: number): string {
  const d = new Date(iso);
  if (timespan <= 86400) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function BandwidthChart({ org, editMode }: Props) {
  const { refreshKey } = useRefresh();
  const cc = useChartColors();
  const listboxKeys = useListboxKeys();
  const uid = useId();
  const sentGradId = `sentGrad-${uid}`;
  const recvGradId = `recvGrad-${uid}`;
  const [networks,  setNetworks]  = useState<MerakiNetwork[]>([]);
  const [selected,  setSelected]  = useState<MerakiNetwork | null>(null);
  const [data,      setData]      = useState<BandwidthPoint[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [netLoading, setNetLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [tsIdx,     setTsIdx]     = useState(1); // default 24h
  const [netOpen,   setNetOpen]   = useState(false);

  const ts = TIMESPANS[tsIdx];

  // Load networks when org changes
  useEffect(() => {
    if (!org) { setNetworks([]); setSelected(null); return; }
    const ctrl = new AbortController();
    setNetLoading(true);
    fetch(`/api/meraki/networks?orgId=${encodeURIComponent(org.id)}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: MerakiNetwork[]) => {
        setNetworks(d);
        setSelected((prev) => {
          if (prev && d.some((n) => n.id === prev.id)) return prev;
          return d[0] ?? null;
        });
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") {
          setError("Failed to load networks");
        }
      })
      .finally(() => setNetLoading(false));
    return () => ctrl.abort();
  }, [org]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/meraki/bandwidth?networkId=${encodeURIComponent(selected.id)}&timespan=${ts.timespan}&resolution=${ts.resolution}`,
        { signal }
      );
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
  }, [selected, ts.timespan, ts.resolution]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, refreshKey]);

  const totals = data.reduce((acc, p) => ({ sent: acc.sent + p.sent, received: acc.received + p.received }), { sent: 0, received: 0 });

  const netSelector = (
    <div className="relative">
      <button
        onClick={() => setNetOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Escape" && setNetOpen(false)}
        aria-haspopup="listbox"
        aria-expanded={netOpen}
        aria-label={`Select network: ${selected?.name ?? "none"}`}
        className="flex items-center gap-1 text-xs bg-meraki-surface border border-meraki-border rounded-lg px-2 py-1 text-meraki-text hover:border-meraki-primary/50 transition-colors max-w-[160px]"
      >
        <span className="truncate">{netLoading ? "Loading…" : selected?.name ?? "Network"}</span>
        <ChevronDown size={11} className="text-meraki-muted shrink-0" />
      </button>
      {netOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNetOpen(false)} onKeyDown={(e) => e.key === "Escape" && setNetOpen(false)} />
          <ul role="listbox" aria-label="Networks" className="absolute right-0 top-full mt-1 w-56 bg-meraki-card border border-meraki-border rounded-xl shadow-xl z-50 overflow-auto max-h-48" onKeyDown={(e) => { if (e.key === "Escape") setNetOpen(false); else listboxKeys(e); }}>
            {networks.map((n) => (
              <li
                key={n.id}
                role="option"
                aria-selected={selected?.id === n.id}
                tabIndex={0}
                onClick={() => { setSelected(n); setNetOpen(false); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(n); setNetOpen(false); } }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer ${
                  selected?.id === n.id
                    ? "bg-meraki-primary/10 text-meraki-primary"
                    : "text-meraki-text hover:bg-meraki-surface"
                }`}
              >
                {n.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );

  return (
    <WidgetCard
      title="Bandwidth History"
      loading={loading}
      error={error}
      onRefresh={load}
      editMode={editMode}
      headerRight={
        <div className="flex items-center gap-2">
          {/* Timespan pills */}
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
          {org && netSelector}
        </div>
      }
    >
      {!org ? (
        <p className="text-meraki-muted text-sm text-center mt-4">Select an organization</p>
      ) : !selected ? (
        <p className="text-meraki-muted text-sm text-center mt-4">No networks available</p>
      ) : data.length === 0 ? (
        <p className="text-meraki-muted text-sm text-center mt-4">No bandwidth data available</p>
      ) : (
        <div className="flex flex-col gap-3 h-full">
          {/* Totals */}
          <div className="flex gap-4 text-xs">
            <span className="text-meraki-muted">
              <span aria-hidden="true">↑</span> <span className="text-meraki-teal font-medium">{fmtBandwidth(totals.sent)}</span> sent
            </span>
            <span className="text-meraki-muted">
              <span aria-hidden="true">↓</span> <span className="text-meraki-green font-medium">{fmtBandwidth(totals.received)}</span> received
            </span>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={sentGradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={cc.teal} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={cc.teal} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={recvGradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={cc.green} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={cc.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={cc.gridLine} vertical={false} />
              <XAxis
                dataKey="ts"
                tickFormatter={(v) => fmtTime(v, ts.timespan)}
                tick={{ fill: cc.tickFill, fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: cc.axisLine }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={fmtBandwidth}
                tick={{ fill: cc.tickFill, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => new Date(v).toLocaleString()}
                formatter={(v: number, name: string) => [fmtBandwidth(v), name === "sent" ? "Sent" : "Received"]}
                itemStyle={{ color: cc.muted }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(v) => (
                  <span className="text-xs text-meraki-muted capitalize">{v === "sent" ? "Sent" : "Received"}</span>
                )}
              />
              <Area
                type="monotone"
                dataKey="sent"
                stroke={cc.teal}
                strokeWidth={2}
                fill={`url(#${sentGradId})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="received"
                stroke={cc.green}
                strokeWidth={2}
                fill={`url(#${recvGradId})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </WidgetCard>
  );
}
