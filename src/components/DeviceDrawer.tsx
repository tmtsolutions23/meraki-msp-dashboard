"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  X, Cpu, AlertTriangle, Clock, Tag,
  Activity, RefreshCw, ExternalLink, Server,
} from "lucide-react";
import type { DeviceStatus } from "@/lib/meraki";
import { timeAgo } from "@/lib/formatters";

interface DeviceDrawerProps {
  device: DeviceStatus | null;
  networkId: string | null;
  onClose: () => void;
}

interface DeviceBundle {
  device: {
    serial: string; name: string; mac: string; networkId: string;
    productType: string; model: string; address: string;
    notes: string; tags: string[]; firmware: string; url: string;
    lanIp: string | null; wan1Ip: string | null; wan2Ip: string | null;
  } | null;
  mgmt: {
    wan1: { wanEnabled: string; usingStaticIp: boolean };
    wan2: { wanEnabled: string; usingStaticIp: boolean };
  } | null;
  performance: { perfScore: number } | null;
}

interface NetworkEvent {
  occurredAt: string;
  type: string;
  description: string;
  clientDescription: string | null;
  data: Record<string, unknown>;
}

/** Only allow http(s) URLs to prevent javascript: / data: injection from API data */
function isSafeUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}


export default function DeviceDrawer({ device, networkId, onClose }: DeviceDrawerProps) {
  const [bundle, setBundle]         = useState<DeviceBundle | null>(null);
  const [events, setEvents]         = useState<NetworkEvent[]>([]);
  const [loading, setLoading]       = useState(false);
  const [evtLoading, setEvtLoading] = useState(false);
  const devCtrlRef = useRef<AbortController | null>(null);
  const evtCtrlRef = useRef<AbortController | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const loadDevice = useCallback(async (signal: AbortSignal) => {
    if (!device) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/meraki/device/${encodeURIComponent(device.serial)}`, { signal });
      if (!signal.aborted && res.ok) setBundle(await res.json());
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("loadDevice:", (e as Error).message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [device]);

  const loadEvents = useCallback(async (signal: AbortSignal) => {
    if (!networkId || !device) return;
    setEvtLoading(true);
    try {
      const url = `/api/meraki/events?networkId=${encodeURIComponent(networkId)}&serial=${encodeURIComponent(device.serial)}&perPage=20`;
      const res = await fetch(url, { signal });
      if (!signal.aborted && res.ok) setEvents(await res.json());
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("loadEvents:", (e as Error).message);
    } finally {
      if (!signal.aborted) setEvtLoading(false);
    }
  }, [device, networkId]);

  useEffect(() => {
    if (!device) return;
    setBundle(null);
    setEvents([]);

    const devCtrl = new AbortController();
    const evtCtrl = new AbortController();
    devCtrlRef.current = devCtrl;
    evtCtrlRef.current = evtCtrl;
    loadDevice(devCtrl.signal);
    loadEvents(evtCtrl.signal);

    return () => {
      devCtrlRef.current?.abort();
      evtCtrlRef.current?.abort();
    };
  }, [device, loadDevice, loadEvents]);

  const drawerRef = useRef<HTMLElement>(null);

  // Close on Escape + focus management + focus trap
  useEffect(() => {
    if (!device) return;
    closeButtonRef.current?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      // Focus trap: cycle Tab within the drawer
      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [device, onClose]);

  const open = !!device;
  const statusColor = {
    online:   "text-meraki-green  bg-meraki-green/10  border-meraki-green/30",
    offline:  "text-meraki-red    bg-meraki-red/10    border-meraki-red/30",
    alerting: "text-meraki-orange bg-meraki-orange/10 border-meraki-orange/30",
    dormant:  "text-meraki-muted  bg-meraki-muted/10  border-meraki-muted/30",
  }[device?.status ?? "dormant"];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-label="Close device details"
        role="button"
        tabIndex={open ? 0 : -1}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClose(); }
        }}
      />

      {/* Drawer (light) */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        {...(!open && { inert: true as unknown as boolean })}
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-meraki-card border-l border-meraki-border flex flex-col shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-meraki-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id="drawer-title" className="text-base font-bold text-meraki-text truncate">
                {device?.name || device?.serial}
              </h2>
              {device && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${statusColor}`}>
                  {device.status}
                </span>
              )}
            </div>
            <p className="text-xs text-meraki-muted mt-0.5">{device?.model} · {device?.serial}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                devCtrlRef.current?.abort();
                evtCtrlRef.current?.abort();
                const dc = new AbortController();
                const ec = new AbortController();
                devCtrlRef.current = dc;
                evtCtrlRef.current = ec;
                loadDevice(dc.signal);
                loadEvents(ec.signal);
              }}
              className="text-meraki-muted hover:text-meraki-primary transition-colors"
              aria-label="Refresh device details"
            >
              <RefreshCw size={14} className={loading || evtLoading ? "animate-spin" : ""} />
            </button>
            <button ref={closeButtonRef} onClick={onClose} aria-label="Close" className="text-meraki-muted hover:text-meraki-text transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!device ? null : loading ? (
            <div role="status" aria-label="Loading device details" className="flex items-center justify-center py-16">
              <div aria-hidden="true" className="w-6 h-6 border-2 border-meraki-primary border-t-transparent rounded-full animate-spin" />
              <span className="sr-only">Loading device details…</span>
            </div>
          ) : (
            <div className="p-5 space-y-6">

              {/* Quick stats row */}
              <div className="grid grid-cols-2 gap-3">
                <InfoTile icon={<Server size={14} />} label="Product Type" value={device.productType} />
                <InfoTile icon={<Cpu size={14} />}    label="Firmware"     value={bundle?.device?.firmware ?? "—"} />
                {bundle?.performance && (
                  <InfoTile
                    icon={<Activity size={14} />}
                    label="Perf Score"
                    value={`${bundle.performance.perfScore}/100`}
                    valueColor={
                      bundle.performance.perfScore >= 80 ? "text-meraki-green"
                      : bundle.performance.perfScore >= 50 ? "text-meraki-yellow"
                      : "text-meraki-red"
                    }
                  />
                )}
                <InfoTile
                  icon={<Clock size={14} />}
                  label="Last Seen"
                  value={timeAgo(device.lastReportedAt)}
                />
              </div>

              {/* Network / Address */}
              <Section title="Network">
                <Row label="LAN IP"      value={bundle?.device?.lanIp ?? "—"} />
                <Row label="WAN1"        value={device.wan1Ip ?? "—"} />
                {device.wan2Ip && <Row label="WAN2" value={device.wan2Ip} />}
                <Row label="Public IP"   value={device.publicIp || "—"} />
                <Row label="Gateway"     value={device.gateway ?? "—"} />
                <Row label="Primary DNS" value={device.primaryDns ?? "—"} />
                {device.usingCellularFailover && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-meraki-orange">
                    <AlertTriangle size={12} />
                    Using cellular failover
                  </div>
                )}
              </Section>

              {/* Device details */}
              {bundle?.device && (
                <Section title="Device Details">
                  <Row label="MAC"      value={bundle.device.mac} />
                  <Row label="Address"  value={bundle.device.address || "—"} />
                  {bundle.device.notes && <Row label="Notes" value={bundle.device.notes} />}
                  {bundle.device.tags.length > 0 && (
                    <div className="flex items-start gap-2 py-1.5">
                      <span className="text-xs text-meraki-muted w-28 shrink-0 flex items-center gap-1">
                        <Tag size={10} /> Tags
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {bundle.device.tags.map((t) => (
                          <span key={t} className="text-xs bg-meraki-surface text-meraki-muted rounded-full px-2 py-0.5">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {isSafeUrl(bundle.device.url) && (
                    <a
                      href={bundle.device.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-meraki-primary hover:underline mt-1"
                    >
                      Open in Meraki Dashboard <ExternalLink size={10} aria-hidden="true" /><span className="sr-only">(opens in new tab)</span>
                    </a>
                  )}
                </Section>
              )}

              {/* Recent Events */}
              <Section
                title="Recent Events"
                loading={evtLoading}
                count={events.length}
              >
                {events.length === 0 && !evtLoading ? (
                  <p className="text-xs text-meraki-muted py-2">No recent events</p>
                ) : (
                  <div className="space-y-2">
                    {events.map((evt) => (
                      <div key={`${evt.occurredAt}-${evt.type}`} className="flex gap-3 py-1.5 border-b border-meraki-border/50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-meraki-text capitalize">
                            {evt.type.replace(/_/g, " ")}
                          </p>
                          {evt.description && (
                            <p className="text-xs text-meraki-muted mt-0.5 line-clamp-2">{evt.description}</p>
                          )}
                        </div>
                        <span className="text-xs text-meraki-muted shrink-0 mt-0.5">
                          {timeAgo(evt.occurredAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function Section({
  title,
  children,
  loading,
  count,
}: {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
  count?: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs font-semibold text-meraki-muted uppercase tracking-wider">{title}</h3>
        {count !== undefined && (
          <span className="text-xs bg-meraki-surface text-meraki-muted rounded-full px-1.5">{count}</span>
        )}
        {loading && <span role="status" aria-label="Loading"><span aria-hidden="true" className="w-3 h-3 border border-meraki-primary border-t-transparent rounded-full animate-spin inline-block" /></span>}
      </div>
      <div className="bg-meraki-surface rounded-xl border border-meraki-border px-4 py-1 divide-y divide-meraki-border/50">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 gap-3">
      <span className="text-xs text-meraki-muted shrink-0">{label}</span>
      <span className="text-xs text-meraki-text text-right font-mono truncate">{value}</span>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
  valueColor = "text-meraki-text",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-meraki-surface border border-meraki-border rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-meraki-muted mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}
