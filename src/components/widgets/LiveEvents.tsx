"use client";

import { useEffect, useState, useCallback } from "react";
import { Radio, AlertCircle, AlertTriangle, Info, Wifi, Shield, Settings, Thermometer } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";
import { timeAgo } from "@/lib/formatters";
import { categorize } from "@/lib/webhookStore";
import type { WebhookEvent } from "@/lib/webhookStore";

type Category = "all" | "device" | "uplink" | "security" | "config" | "sensor" | "other";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all",      label: "All" },
  { key: "device",   label: "Device" },
  { key: "uplink",   label: "Uplink" },
  { key: "security", label: "Security" },
  { key: "config",   label: "Config" },
  { key: "sensor",   label: "Sensor" },
  { key: "other",    label: "Other" },
];

const levelConfig = {
  critical:      { icon: AlertCircle,   color: "text-meraki-red",    bg: "bg-meraki-red/10",    border: "border-meraki-red/30" },
  warning:       { icon: AlertTriangle, color: "text-meraki-yellow", bg: "bg-meraki-yellow/10", border: "border-meraki-yellow/30" },
  informational: { icon: Info,          color: "text-meraki-teal",   bg: "bg-meraki-teal/10",   border: "border-meraki-teal/30" },
};

const categoryIcons: Record<string, typeof Radio> = {
  device:   Radio,
  uplink:   Wifi,
  security: Shield,
  config:   Settings,
  sensor:   Thermometer,
};

const LAST_SEEN_KEY = "meraki-webhook-last-seen";

interface Props {
  editMode?: boolean;
}

export default function LiveEvents({ editMode }: Props) {
  const { refreshKey } = useRefresh();
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Category>("all");
  const [unreadCount, setUnreadCount] = useState(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const url = filter === "all"
        ? "/api/webhooks/events"
        : `/api/webhooks/events?category=${filter}`;
      const res = await fetch(url, { signal });
      if (signal?.aborted) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data: WebhookEvent[] = await res.json();
      setEvents(data);

      // Calculate unread count (SSR-safe)
      const lastSeen = typeof window !== "undefined"
        ? Number(localStorage.getItem(LAST_SEEN_KEY) || "0")
        : 0;
      setUnreadCount(data.filter((e) => e.receivedAt > lastSeen).length);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, refreshKey]);

  // Mark as seen on explicit user interaction (clicking the badge)
  const markSeen = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    }
    setUnreadCount(0);
  }, []);

  const badge = unreadCount > 0 ? (
    <button
      onClick={markSeen}
      aria-label={`${unreadCount > 99 ? "99+" : unreadCount} unread events — click to mark as read`}
      className="flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-meraki-primary text-white text-xs font-bold hover:bg-meraki-primary/80 transition-colors"
    >
      <span aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>
    </button>
  ) : null;

  const filterBar = (
    <div className="flex gap-1 flex-wrap">
      {badge}
      {CATEGORIES.map((c) => (
        <button
          key={c.key}
          onClick={() => setFilter(c.key)}
          aria-pressed={filter === c.key}
          className={`text-xs px-2 py-0.5 rounded-full transition-colors whitespace-nowrap ${
            filter === c.key
              ? "bg-meraki-primary/15 text-meraki-primary font-semibold"
              : "text-meraki-muted hover:text-meraki-text"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );

  return (
    <WidgetCard
      title="Live Events"
      loading={loading}
      error={error}
      onRefresh={load}
      editMode={editMode}
      headerRight={filterBar}
    >
      {events.length === 0 && filter !== "all" ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-meraki-muted">
          <Radio size={28} />
          <p className="text-sm text-center">No {filter} events</p>
          <button
            onClick={() => setFilter("all")}
            className="text-xs text-meraki-primary hover:underline"
          >
            Clear filter
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-meraki-muted">
          <Radio size={28} />
          <p className="text-sm text-center">No webhook events received yet</p>
          <p className="text-xs text-center">Configure webhooks in your Meraki dashboard</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const cfg = levelConfig[event.alertLevel as keyof typeof levelConfig] ?? levelConfig.informational;
            const Icon = cfg.icon;
            const cat = categorize(event.alertType);
            const CatIcon = categoryIcons[cat] ?? Radio;
            return (
              <div
                key={event.id}
                className={`flex gap-3 p-3 rounded-lg border ${cfg.bg} ${cfg.border}`}
              >
                <Icon size={15} className={`${cfg.color} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-meraki-text leading-tight">
                      {event.alertType}
                    </p>
                    <span className="text-xs text-meraki-muted shrink-0">
                      {timeAgo(event.occurredAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <CatIcon size={10} className="text-meraki-muted" />
                    <span className="text-xs text-meraki-muted capitalize">{cat}</span>
                  </div>
                  {(event.deviceName || event.deviceSerial) && (
                    <p className="text-xs text-meraki-muted mt-0.5 truncate">
                      {event.deviceName || event.deviceSerial}
                      {event.networkName && ` · ${event.networkName}`}
                    </p>
                  )}
                  {event.organizationName && (
                    <p className="text-xs text-meraki-muted/70 mt-0.5 truncate">
                      {event.organizationName}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
