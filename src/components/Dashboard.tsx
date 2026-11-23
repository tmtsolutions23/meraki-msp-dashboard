"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Layout, Layouts, Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  Settings, ChevronDown, RefreshCw, LayoutGrid, Play, Pause, Sun, Moon, LogOut, Home,
} from "lucide-react";

import { RefreshProvider, useRefresh } from "@/context/RefreshContext";
import { useListboxKeys } from "@/lib/useListboxKeys";
import { useTheme } from "@/context/ThemeContext";
import OrgOverview    from "@/components/widgets/OrgOverview";
import OrgSummary     from "@/components/widgets/OrgSummary";
import DeviceHealth   from "@/components/widgets/DeviceHealth";
import AlertsFeed     from "@/components/widgets/AlertsFeed";
import UplinkStatus   from "@/components/widgets/UplinkStatus";
import NetworkList    from "@/components/widgets/NetworkList";
import BandwidthChart from "@/components/widgets/BandwidthChart";
import LiveEvents     from "@/components/widgets/LiveEvents";
import LicenseStatus  from "@/components/widgets/LicenseStatus";
import LicenseOverall from "@/components/widgets/LicenseOverall";
import DeviceDrawer   from "@/components/DeviceDrawer";

import type { MerakiOrg, DeviceStatus } from "@/lib/meraki";

const ResponsiveGridLayout = WidthProvider(Responsive);

// ── Home view layouts (no org selected) ──────────────────────────────────────
const HOME_LAYOUTS: Layouts = {
  lg:  [
    { i: "org-overview",    x: 0, y: 0, w: 6,  h: 14, minW: 4, minH: 9 },
    { i: "license-overall", x: 6, y: 0, w: 6,  h: 14, minW: 4, minH: 9 },
  ],
  md:  [
    { i: "org-overview",    x: 0, y: 0,  w: 10, h: 14 },
    { i: "license-overall", x: 0, y: 14, w: 10, h: 14 },
  ],
  sm:  [
    { i: "org-overview",    x: 0, y: 0,  w: 6, h: 14 },
    { i: "license-overall", x: 0, y: 14, w: 6, h: 14 },
  ],
  xs:  [
    { i: "org-overview",    x: 0, y: 0,  w: 4, h: 14, minW: 2 },
    { i: "license-overall", x: 0, y: 14, w: 4, h: 14, minW: 2 },
  ],
  xxs: [
    { i: "org-overview",    x: 0, y: 0,  w: 2, h: 14, minW: 2 },
    { i: "license-overall", x: 0, y: 14, w: 2, h: 14, minW: 2 },
  ],
};

const HOME_LABELS: Record<string, string> = {
  "org-overview":    "Org Overview",
  "license-overall": "License Renewals",
};

// ── Org view layouts (org selected) ──────────────────────────────────────────
const ORG_LAYOUTS: Layouts = {
  lg: [
    { i: "org-summary",     x: 0,  y: 0,  w: 4,  h: 11, minW: 3, minH: 7 },
    { i: "device-health",   x: 4,  y: 0,  w: 4,  h: 11, minW: 3, minH: 7 },
    { i: "alerts-feed",     x: 8,  y: 0,  w: 4,  h: 11, minW: 3, minH: 7 },
    { i: "uplink-status",   x: 0,  y: 11, w: 4,  h: 11, minW: 3, minH: 7 },
    { i: "network-list",    x: 4,  y: 11, w: 4,  h: 11, minW: 3, minH: 7 },
    { i: "license-status",  x: 8,  y: 11, w: 4,  h: 11, minW: 3, minH: 7 },
    { i: "bandwidth-chart", x: 0,  y: 22, w: 12, h: 13, minW: 4, minH: 9 },
    { i: "live-events",     x: 0,  y: 35, w: 12, h: 11, minW: 3, minH: 7 },
  ],
  md: [
    { i: "org-summary",     x: 0, y: 0,  w: 5, h: 11 },
    { i: "device-health",   x: 5, y: 0,  w: 5, h: 11 },
    { i: "alerts-feed",     x: 0, y: 11, w: 5, h: 11 },
    { i: "uplink-status",   x: 5, y: 11, w: 5, h: 11 },
    { i: "network-list",    x: 0, y: 22, w: 5, h: 11 },
    { i: "license-status",  x: 5, y: 22, w: 5, h: 11 },
    { i: "bandwidth-chart", x: 0, y: 33, w: 10, h: 13 },
    { i: "live-events",     x: 0, y: 46, w: 10, h: 11 },
  ],
  sm: [
    { i: "org-summary",     x: 0, y: 0,  w: 6, h: 11 },
    { i: "device-health",   x: 0, y: 11, w: 6, h: 11 },
    { i: "alerts-feed",     x: 0, y: 22, w: 6, h: 11 },
    { i: "uplink-status",   x: 0, y: 33, w: 6, h: 11 },
    { i: "network-list",    x: 0, y: 44, w: 6, h: 11 },
    { i: "license-status",  x: 0, y: 55, w: 6, h: 11 },
    { i: "bandwidth-chart", x: 0, y: 66, w: 6, h: 13 },
    { i: "live-events",     x: 0, y: 79, w: 6, h: 11 },
  ],
  xs: [
    { i: "org-summary",     x: 0, y: 0,  w: 4, h: 11, minW: 2 },
    { i: "device-health",   x: 0, y: 11, w: 4, h: 11, minW: 2 },
    { i: "alerts-feed",     x: 0, y: 22, w: 4, h: 11, minW: 2 },
    { i: "uplink-status",   x: 0, y: 33, w: 4, h: 11, minW: 2 },
    { i: "network-list",    x: 0, y: 44, w: 4, h: 11, minW: 2 },
    { i: "license-status",  x: 0, y: 55, w: 4, h: 11, minW: 2 },
    { i: "bandwidth-chart", x: 0, y: 66, w: 4, h: 13, minW: 2 },
    { i: "live-events",     x: 0, y: 79, w: 4, h: 11, minW: 2 },
  ],
  xxs: [
    { i: "org-summary",     x: 0, y: 0,  w: 2, h: 11, minW: 2 },
    { i: "device-health",   x: 0, y: 11, w: 2, h: 11, minW: 2 },
    { i: "alerts-feed",     x: 0, y: 22, w: 2, h: 11, minW: 2 },
    { i: "uplink-status",   x: 0, y: 33, w: 2, h: 11, minW: 2 },
    { i: "network-list",    x: 0, y: 44, w: 2, h: 11, minW: 2 },
    { i: "license-status",  x: 0, y: 55, w: 2, h: 11, minW: 2 },
    { i: "bandwidth-chart", x: 0, y: 66, w: 2, h: 13, minW: 2 },
    { i: "live-events",     x: 0, y: 79, w: 2, h: 11, minW: 2 },
  ],
};

const ORG_LABELS: Record<string, string> = {
  "org-summary":     "Org Summary",
  "device-health":   "Device Health",
  "alerts-feed":     "Alerts",
  "uplink-status":   "WAN Uplinks",
  "network-list":    "Networks",
  "license-status":  "Licenses",
  "bandwidth-chart": "Bandwidth",
  "live-events":     "Live Events",
};

const REFRESH_OPTIONS = [
  { label: "Off", ms: 0 },
  { label: "30s", ms: 30000 },
  { label: "1m",  ms: 60000 },
  { label: "5m",  ms: 300000 },
] as const;

const ORG_LAYOUT_KEY = "meraki-org-layouts";
const ORG_HIDDEN_KEY = "meraki-org-hidden";

function loadOrgLayouts(): Layouts {
  if (typeof window === "undefined") return ORG_LAYOUTS;
  try {
    const s = localStorage.getItem(ORG_LAYOUT_KEY);
    if (!s) return ORG_LAYOUTS;
    const saved: Layouts = JSON.parse(s);
    const merged: Layouts = {};
    for (const bp of Object.keys(ORG_LAYOUTS) as (keyof Layouts)[]) {
      const persisted = saved[bp] ?? [];
      const defaults = ORG_LAYOUTS[bp] ?? [];
      const persistedIds = new Set(persisted.map((l) => l.i));
      merged[bp] = [...persisted, ...defaults.filter((l) => !persistedIds.has(l.i))];
    }
    return merged;
  } catch { return ORG_LAYOUTS; }
}

function loadOrgHidden(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const s = localStorage.getItem(ORG_HIDDEN_KEY);
    return s ? JSON.parse(s) : [];
  } catch { return []; }
}

// ── Inner component ──────────────────────────────────────────────────────────
function DashboardInner() {
  const { intervalMs, setIntervalMs, triggerRefresh, lastRefreshed } = useRefresh();
  const { theme, toggleTheme } = useTheme();
  const listboxKeys = useListboxKeys();

  const [orgs,          setOrgs]          = useState<MerakiOrg[]>([]);
  const [selectedOrg,   setSelectedOrg]   = useState<MerakiOrg | null>(null);
  const [orgLoading,    setOrgLoading]    = useState(true);
  const [orgError,      setOrgError]      = useState<string | null>(null);
  const [orgLayouts,    setOrgLayouts]    = useState<Layouts>(() => loadOrgLayouts());
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>(() => loadOrgHidden());
  const [editMode,      setEditMode]      = useState(false);
  const [orgDropdown,   setOrgDropdown]   = useState(false);
  const [refreshDrop,   setRefreshDrop]   = useState(false);
  const [orgRetry,      setOrgRetry]      = useState(0);

  // Device drawer
  const [drawerDevice,    setDrawerDevice]    = useState<DeviceStatus | null>(null);
  const [drawerNetworkId, setDrawerNetworkId] = useState<string | null>(null);

  const isHome = selectedOrg === null;

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/meraki/organizations", { signal: ctrl.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const data: MerakiOrg[] = await res.json();
        setOrgs(data);
        // Don't auto-select — start on the home view
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setOrgError(e instanceof Error ? e.message : "Failed to load organizations");
        }
      } finally {
        if (!ctrl.signal.aborted) setOrgLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [orgRetry]);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleOrgLayoutChange = useCallback((_: Layout[], all: Layouts) => {
    const merged: Layouts = {};
    for (const bp of Object.keys(ORG_LAYOUTS) as (keyof Layouts)[]) {
      const incoming = all[bp] ?? [];
      const defaults = ORG_LAYOUTS[bp] ?? [];
      const incomingIds = new Set(incoming.map((l) => l.i));
      merged[bp] = [...incoming, ...defaults.filter((l) => !incomingIds.has(l.i))];
    }
    setOrgLayouts(merged);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      localStorage.setItem(ORG_LAYOUT_KEY, JSON.stringify(merged));
    }, 200);
  }, []);

  const toggleWidget = (id: string) => {
    setHiddenWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      localStorage.setItem(ORG_HIDDEN_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetLayout = () => {
    if (!window.confirm("Reset layout to defaults?")) return;
    setOrgLayouts(ORG_LAYOUTS);
    setHiddenWidgets([]);
    localStorage.removeItem(ORG_LAYOUT_KEY);
    localStorage.removeItem(ORG_HIDDEN_KEY);
  };

  const handleDeviceClick = (device: DeviceStatus) => {
    setDrawerDevice(device);
    setDrawerNetworkId(device.networkId ?? null);
  };

  const activeLabels = isHome ? HOME_LABELS : ORG_LABELS;
  const visibleWidgets = Object.keys(activeLabels).filter((id) => isHome || !hiddenWidgets.includes(id));
  const currentInterval = REFRESH_OPTIONS.find((o) => o.ms === intervalMs) ?? REFRESH_OPTIONS[0];

  return (
    <div className="min-h-screen bg-meraki-bg flex flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-meraki-primary focus:text-white focus:px-4 focus:py-2 focus:text-sm">
        Skip to content
      </a>

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-30 flex items-center gap-3 px-5 py-3 bg-meraki-dark border-b border-white/10">
        {/* Logo — click to go home */}
        <button
          onClick={() => setSelectedOrg(null)}
          className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity"
          aria-label="Go to home overview"
        >
          <div className="w-7 h-7 rounded-lg bg-meraki-primary/20 border border-meraki-primary/30 flex items-center justify-center">
            <LayoutGrid size={14} className="text-meraki-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">Meraki MSP</h1>
            <p className="text-xs text-white/50 leading-none mt-0.5">Dashboard</p>
          </div>
        </button>

        {/* Breadcrumb — show org name when in org view */}
        {selectedOrg && (
          <div className="flex items-center gap-1.5 text-xs text-white/50">
            <span>/</span>
            <span className="text-white font-medium truncate max-w-[200px]">{selectedOrg.name}</span>
          </div>
        )}

        <div className="flex-1" />

        {lastRefreshed && (
          <span className="text-xs text-white/40 hidden md:block">
            Updated{" "}
            {lastRefreshed.toLocaleTimeString([], {
              hour: "2-digit", minute: "2-digit", second: "2-digit",
            })}
          </span>
        )}

        {/* Manual refresh */}
        <button
          onClick={triggerRefresh}
          aria-label="Refresh all widgets"
          className="text-white/50 hover:text-meraki-primary transition-colors p-1"
        >
          <RefreshCw size={15} />
        </button>

        {/* Auto-refresh selector */}
        <div className="relative">
          <button
            onClick={() => setRefreshDrop((v) => !v)}
            onKeyDown={(e) => e.key === "Escape" && setRefreshDrop(false)}
            aria-haspopup="listbox"
            aria-expanded={refreshDrop}
            aria-label={`Auto-refresh: ${currentInterval.label}`}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
              intervalMs > 0
                ? "bg-meraki-green/15 border-meraki-green/30 text-meraki-green"
                : "border-white/20 text-white/60 hover:text-white"
            }`}
          >
            {intervalMs > 0 ? <Pause size={11} /> : <Play size={11} />}
            {currentInterval.label}
            <ChevronDown size={11} />
          </button>
          {refreshDrop && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setRefreshDrop(false)} onKeyDown={(e) => e.key === "Escape" && setRefreshDrop(false)} />
              <ul role="listbox" aria-label="Auto-refresh interval" className="absolute right-0 top-full mt-1 w-28 bg-meraki-dark border border-white/15 rounded-xl shadow-xl z-50 overflow-auto max-h-48" onKeyDown={(e) => { if (e.key === "Escape") setRefreshDrop(false); else listboxKeys(e); }}>
                {REFRESH_OPTIONS.map((opt) => (
                  <li key={opt.label} role="option" aria-selected={intervalMs === opt.ms} tabIndex={0}
                    onClick={() => { setIntervalMs(opt.ms); setRefreshDrop(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIntervalMs(opt.ms); setRefreshDrop(false); } }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer ${
                      intervalMs === opt.ms ? "bg-meraki-primary/15 text-meraki-primary" : "text-white/70 hover:bg-white/10"
                    }`}>
                    {opt.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Org selector */}
        <div className="relative">
          <button
            onClick={() => setOrgDropdown((v) => !v)}
            onKeyDown={(e) => e.key === "Escape" && setOrgDropdown(false)}
            aria-haspopup="listbox"
            aria-expanded={orgDropdown}
            aria-label="Select organization"
            className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm text-white hover:border-meraki-primary/50 transition-colors"
          >
            <span className="max-w-[180px] truncate" title={selectedOrg?.name}>
              {orgLoading ? "Loading…" : selectedOrg?.name ?? "All Organizations"}
            </span>
            <ChevronDown size={13} className="text-white/50" />
          </button>
          {orgDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOrgDropdown(false)} onKeyDown={(e) => e.key === "Escape" && setOrgDropdown(false)} />
              <ul role="listbox" aria-label="Organizations" className="absolute right-0 top-full mt-1 w-72 bg-meraki-dark border border-white/15 rounded-xl shadow-xl z-50 overflow-auto max-h-72" onKeyDown={(e) => { if (e.key === "Escape") setOrgDropdown(false); else listboxKeys(e); }}>
                {/* Home option */}
                <li role="option" aria-selected={selectedOrg === null} tabIndex={0}
                  onClick={() => { setSelectedOrg(null); setOrgDropdown(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedOrg(null); setOrgDropdown(false); } }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer flex items-center gap-2 border-b border-white/10 ${
                    selectedOrg === null ? "bg-meraki-primary/15 text-meraki-primary" : "text-white/70 hover:bg-white/10"
                  }`}>
                  <Home size={13} />
                  All Organizations
                </li>
                {orgs.map((org) => (
                  <li key={org.id} role="option" aria-selected={selectedOrg?.id === org.id} tabIndex={0}
                    onClick={() => { setSelectedOrg(org); setOrgDropdown(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedOrg(org); setOrgDropdown(false); } }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                      selectedOrg?.id === org.id ? "bg-meraki-primary/15 text-meraki-primary" : "text-white/70 hover:bg-white/10"
                    }`}>
                    {org.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-white/70 hover:text-meraki-primary hover:bg-white/10 transition-colors"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Edit mode toggle (org view only) */}
        {!isHome && (
          <button
            onClick={() => setEditMode((v) => !v)}
            aria-label={editMode ? "Exit edit mode" : "Enter edit mode"}
            aria-pressed={editMode}
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${
              editMode
                ? "bg-meraki-primary/15 border-meraki-primary/40 text-meraki-primary"
                : "border-white/20 text-white/60 hover:text-white"
            }`}
          >
            <Settings size={14} aria-hidden="true" />
            {editMode ? "Done" : "Edit"}
          </button>
        )}

        {/* Logout */}
        <button
          onClick={async () => {
            try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
            window.location.href = "/login";
          }}
          aria-label="Sign out"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-white/50 hover:text-meraki-red hover:bg-white/10 transition-colors"
        >
          <LogOut size={15} />
        </button>
      </header>

      {/* ── Edit toolbar (org view only) ── */}
      {!isHome && editMode && (
        <div className="flex items-center flex-wrap gap-2 px-5 py-3 bg-meraki-card border-b border-meraki-border">
          <span className="text-xs text-meraki-muted font-medium">Widgets:</span>
          {Object.entries(ORG_LABELS).map(([id, label]) => (
            <button key={id} onClick={() => toggleWidget(id)}
              aria-pressed={!hiddenWidgets.includes(id)}
              aria-label={`${hiddenWidgets.includes(id) ? "Show" : "Hide"} ${label} widget`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                hiddenWidgets.includes(id)
                  ? "border-meraki-border text-meraki-muted"
                  : "border-meraki-primary/40 bg-meraki-primary/10 text-meraki-primary"
              }`}>
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={resetLayout} className="flex items-center gap-1.5 text-xs text-meraki-muted hover:text-meraki-text transition-colors">
            <RefreshCw size={12} /> Reset layout
          </button>
        </div>
      )}

      {/* ── Org error banner ── */}
      {orgError && (
        <div role="alert" className="mx-5 mt-3 flex items-center gap-3 bg-meraki-red/10 border border-meraki-red/30 rounded-lg px-4 py-3">
          <span className="text-meraki-red text-sm flex-1">{orgError}</span>
          <button onClick={() => { setOrgError(null); setOrgLoading(true); setOrgRetry((n) => n + 1); }}
            className="text-xs text-meraki-primary hover:underline shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* ── Content ── */}
      <main id="main-content" aria-label={isHome ? "Organization overview" : `${selectedOrg?.name} dashboard`} className="flex-1 p-3">
        {isHome ? (
          /* ── HOME VIEW ── */
          <ResponsiveGridLayout
            className="layout"
            layouts={HOME_LAYOUTS}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={40}
            isDraggable={false}
            isResizable={false}
            margin={[10, 10]}
          >
            <div key="org-overview" role="region" aria-label="Organization Overview">
              <OrgOverview editMode={false} />
            </div>
            <div key="license-overall" role="region" aria-label="License Renewals">
              <LicenseOverall editMode={false} />
            </div>
          </ResponsiveGridLayout>
        ) : (
          /* ── ORG VIEW ── */
          <ResponsiveGridLayout
            className="layout"
            layouts={orgLayouts}
            onLayoutChange={handleOrgLayoutChange}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={40}
            isDraggable={editMode}
            isResizable={editMode}
            draggableHandle=".drag-handle"
            margin={[10, 10]}
          >
            {visibleWidgets.map((id) => (
              <div key={id} role="region" aria-label={ORG_LABELS[id]}>
                {renderOrgWidget(id, selectedOrg, handleDeviceClick, editMode)}
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="px-5 py-2.5 bg-meraki-dark border-t border-white/10 text-xs text-white/60 flex items-center gap-2">
        <span>Meraki MSP Dashboard</span>
        <span aria-hidden="true" className="text-white/20">·</span>
        <span>Cisco Meraki API v1</span>
        {intervalMs > 0 && (
          <>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span className="text-meraki-green">Auto-refreshing every {currentInterval.label}</span>
          </>
        )}
      </footer>

      {/* ── Device drawer ── */}
      <DeviceDrawer device={drawerDevice} networkId={drawerNetworkId} onClose={() => setDrawerDevice(null)} />
    </div>
  );
}

function renderOrgWidget(
  id: string,
  org: MerakiOrg | null,
  onDeviceClick: (d: DeviceStatus) => void,
  editMode: boolean,
) {
  switch (id) {
    case "org-summary":    return <OrgSummary org={org} editMode={editMode} />;
    case "device-health":  return <DeviceHealth org={org} onDeviceClick={onDeviceClick} editMode={editMode} />;
    case "alerts-feed":    return <AlertsFeed org={org} editMode={editMode} />;
    case "uplink-status":  return <UplinkStatus org={org} editMode={editMode} />;
    case "network-list":   return <NetworkList org={org} editMode={editMode} />;
    case "license-status": return <LicenseStatus org={org} editMode={editMode} />;
    case "bandwidth-chart": return <BandwidthChart org={org} editMode={editMode} />;
    case "live-events":    return <LiveEvents editMode={editMode} />;
    default:               return null;
  }
}

// ── Root export ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  return (
    <RefreshProvider>
      <DashboardInner />
    </RefreshProvider>
  );
}
