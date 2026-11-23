"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ChevronDown } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";
import { useChartColors } from "@/context/ThemeContext";
import type { DeviceStatus, MerakiOrg } from "@/lib/meraki";

interface Props {
  org: MerakiOrg | null;
  onDeviceClick: (device: DeviceStatus) => void;
  editMode?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  online:   "#36B37E",
  offline:  "#DE350B",
  alerting: "#FF8B00",
  dormant:  "#6B7C8F",
};

const STATUS_CLASS: Record<string, string> = {
  online:   "bg-meraki-green",
  offline:  "bg-meraki-red",
  alerting: "bg-meraki-orange",
  dormant:  "bg-meraki-muted",
};

const TYPE_LABELS: Record<string, string> = {
  appliance: "Appliances",
  switch:    "Switches",
  wireless:  "Wireless APs",
  camera:    "Cameras",
  sensor:    "Sensors",
  cellularGateway: "Cellular Gateways",
};

export default function DeviceHealth({ org, onDeviceClick, editMode }: Props) {
  const { refreshKey } = useRefresh();
  const cc = useChartColors();
  const [data, setData]   = useState<DeviceStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meraki/devices?orgId=${org.id}`, { signal });
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

  // Reset expanded groups when org changes
  useEffect(() => { setExpanded(new Set()); }, [org]);

  const counts = data.reduce<Record<string, number>>(
    (acc, d) => ({ ...acc, [d.status]: (acc[d.status] ?? 0) + 1 }),
    {}
  );
  const chartData = Object.entries(counts).map(([status, count]) => ({ name: status, value: count }));

  // Group by productType, sorted: types with problems first
  const groups = useMemo(() => {
    const map = new Map<string, DeviceStatus[]>();
    for (const d of data) {
      const type = d.productType || "other";
      if (!map.has(type)) map.set(type, []);
      map.get(type)!.push(d);
    }
    // Sort devices within each group: problems first
    const statusOrder: Record<string, number> = { offline: 0, alerting: 1, online: 2, dormant: 3 };
    Array.from(map.values()).forEach((devices) => {
      devices.sort((a: DeviceStatus, b: DeviceStatus) => (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4));
    });
    // Sort groups: those with offline/alerting devices first, then by count desc
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const aProblems = a.filter((d: DeviceStatus) => d.status === "offline" || d.status === "alerting").length;
      const bProblems = b.filter((d: DeviceStatus) => d.status === "offline" || d.status === "alerting").length;
      if (aProblems !== bProblems) return bProblems - aProblems;
      return b.length - a.length;
    });
  }, [data]);

  const toggleGroup = (type: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <WidgetCard
      title={org ? `Device Health — ${org.name}` : "Device Health"}
      loading={loading}
      error={error}
      onRefresh={load}
      editMode={editMode}
    >
      {!org ? (
        <p className="text-meraki-muted text-sm text-center mt-4">Select an organization</p>
      ) : (
        <div className="flex flex-col gap-3 h-full">
          {/* Pie chart — extra top margin to prevent clipping */}
          {chartData.length > 0 && (
            <div className="pt-2">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={2}
                  >
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={STATUS_COLORS[entry.name] ?? cc.muted}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: cc.tooltipBg, border: `1px solid ${cc.tooltipBorder}`, borderRadius: 8 }}
                    labelStyle={{ color: cc.labelFill }}
                    itemStyle={{ color: cc.muted }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(v) => (
                      <span className="text-xs text-meraki-muted capitalize">{v}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Grouped device list — scrollable */}
          <div className="flex-1 min-h-0 -mx-4 -mb-4 overflow-auto px-4 pb-4">
            <div className="space-y-1">
              {groups.map(([type, devices]) => {
                const isOpen = expanded.has(type);
                const problemsInGroup = devices.filter(d => d.status === "offline" || d.status === "alerting").length;
                const label = TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);

                return (
                  <div key={type}>
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(type)}
                      className="w-full flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-meraki-surface transition-colors text-left"
                    >
                      <ChevronDown
                        size={12}
                        className={`text-meraki-muted shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                      />
                      <span className="text-xs font-semibold text-meraki-text flex-1">{label}</span>
                      {problemsInGroup > 0 && (
                        <span className="text-xs text-meraki-red font-medium">{problemsInGroup} issue{problemsInGroup !== 1 ? "s" : ""}</span>
                      )}
                      <span className="text-xs text-meraki-muted">{devices.length}</span>
                    </button>

                    {/* Expanded device list */}
                    {isOpen && (
                      <div className="ml-4 space-y-0.5">
                        {devices.map((d) => (
                          <button
                            key={d.serial}
                            onClick={() => onDeviceClick(d)}
                            className="w-full flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-meraki-surface transition-colors group text-left"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_CLASS[d.status] ?? "bg-meraki-muted"}`} />
                            <span className="text-meraki-text truncate flex-1 group-hover:text-meraki-primary transition-colors">
                              {d.name || d.serial}
                            </span>
                            <span className="text-meraki-muted shrink-0">{d.model}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
