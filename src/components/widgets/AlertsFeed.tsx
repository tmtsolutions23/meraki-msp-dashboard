"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, AlertCircle, Info, CheckCircle, ExternalLink } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";
import { timeAgo } from "@/lib/formatters";
import type { MerakiAlert, MerakiOrg } from "@/lib/meraki";

interface Props {
  org: MerakiOrg | null;
  editMode?: boolean;
}

const severityConfig = {
  critical:      { icon: AlertCircle,   color: "text-meraki-red",    bg: "bg-meraki-red/10",    border: "border-meraki-red/30" },
  warning:       { icon: AlertTriangle, color: "text-meraki-yellow", bg: "bg-meraki-yellow/10", border: "border-meraki-yellow/30" },
  informational: { icon: Info,          color: "text-meraki-teal",   bg: "bg-meraki-teal/10",   border: "border-meraki-teal/30" },
};

export default function AlertsFeed({ org, editMode }: Props) {
  const { refreshKey } = useRefresh();
  const [alerts, setAlerts] = useState<MerakiAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active">("active");

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meraki/alerts?orgId=${org.id}`, { signal });
      if (signal?.aborted) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setAlerts(await res.json());
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

  const visible = filter === "active"
    ? alerts.filter((a) => !a.resolvedAt)
    : alerts;

  const filterBtn = (
    <div className="flex gap-1">
      {(["active", "all"] as const).map((f) => (
        <button
          key={f}
          onClick={() => setFilter(f)}
          aria-pressed={filter === f}
          className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
            filter === f
              ? "bg-meraki-primary/15 text-meraki-primary font-semibold"
              : "text-meraki-muted hover:text-meraki-text"
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  );

  return (
    <WidgetCard
      title={org ? `Alerts — ${org.name}` : "Alerts"}
      loading={loading}
      error={error}
      onRefresh={load}
      editMode={editMode}
      headerRight={filterBtn}
    >
      {!org ? (
        <p className="text-meraki-muted text-sm text-center mt-4">Select an organization</p>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-meraki-muted">
          <CheckCircle size={28} />
          <p className="text-sm">No {filter === "active" ? "active " : ""}alerts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((alert) => {
            const cfg = severityConfig[alert.severity] ?? severityConfig.informational;
            const Icon = cfg.icon;
            // Link to device page → network page → org dashboard (first available)
            const linkUrl = alert.device?.url
              || (alert.networkId ? `https://dashboard.meraki.com/o/-/manage/organization/overview#t=network&nid=${alert.networkId}` : null)
              || org?.url
              || "";

            const inner = (
              <>
                <Icon size={15} className={`${cfg.color} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-meraki-text leading-tight group-hover:text-meraki-primary transition-colors">
                      {alert.title || alert.type}
                    </p>
                    <span className="text-xs text-meraki-muted shrink-0 flex items-center gap-1">
                      {timeAgo(alert.occurredAt)}
                      {linkUrl && <ExternalLink size={9} className="text-meraki-muted/50" />}
                    </span>
                  </div>
                  {alert.device && (
                    <p className="text-xs text-meraki-muted mt-0.5 truncate">
                      {alert.device.name || alert.device.serial}
                      {alert.device.productType && ` · ${alert.device.productType}`}
                    </p>
                  )}
                  {alert.networkName && (
                    <p className="text-xs text-meraki-muted/70 mt-0.5 truncate">
                      {alert.networkName}
                    </p>
                  )}
                  {alert.resolvedAt && (
                    <p className="text-xs text-meraki-green mt-0.5">
                      Resolved {timeAgo(alert.resolvedAt)}
                    </p>
                  )}
                </div>
              </>
            );

            const cls = `flex gap-3 p-3 rounded-lg border transition-colors ${cfg.bg} ${cfg.border} group hover:brightness-95`;

            return linkUrl ? (
              <a
                key={alert.id}
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${cls} cursor-pointer`}
              >
                {inner}
              </a>
            ) : (
              <div key={alert.id} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
