"use client";

import { useEffect, useState, useCallback } from "react";
import { Shield, AlertTriangle, AlertCircle, CheckCircle, Download, FileText } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";
import QuoteModal, { getEolDevices } from "@/components/QuoteModal";
import type { MerakiOrg } from "@/lib/meraki";
import type { OrgLicenseDetail } from "@/lib/licenseTypes";

interface Props {
  org: MerakiOrg | null;
  editMode?: boolean;
}

export default function LicenseStatus({ org, editMode }: Props) {
  const { refreshKey } = useRefresh();
  const [data, setData] = useState<OrgLicenseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Devices for EOL detection + Quoter integration
  const [orgDevices, setOrgDevices] = useState<{ serial: string; model: string; name: string }[]>([]);
  const [quoterReady, setQuoterReady] = useState(false);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);

  // Check if Quoter is configured (once)
  useEffect(() => {
    fetch("/api/quoter/status").then((r) => r.json()).then((d) => setQuoterReady(d.configured)).catch(() => {});
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const [licRes, devRes] = await Promise.all([
        fetch(`/api/meraki/licenses?orgId=${encodeURIComponent(org.id)}`, { signal }),
        fetch(`/api/meraki/devices?orgId=${encodeURIComponent(org.id)}`, { signal }),
      ]);
      if (signal?.aborted) return;
      if (licRes.ok) setData(await licRes.json());
      else {
        const body = await licRes.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${licRes.status}`);
      }
      if (devRes.ok) {
        const devices = await devRes.json();
        setOrgDevices(devices.map((d: Record<string, unknown>) => ({
          serial: String(d.serial ?? ""),
          model: String(d.model ?? ""),
          name: String(d.name ?? ""),
        })));
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

  const exportCsv = useCallback(() => {
    if (!data || !org) return;
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines: string[] = [];

    // Overview section
    lines.push("Organization,Status,Expiration Date,Days Remaining,Total Licensed Devices");
    const deviceTotal = Object.values(data.licensedDeviceCounts).reduce((a, b) => a + b, 0);
    lines.push([
      escape(org.name), escape(data.status),
      escape(data.expirationDate.replace(" UTC", "")),
      String(data.daysRemaining ?? "N/A"), String(deviceTotal),
    ].join(","));

    // Device counts breakdown
    if (Object.keys(data.licensedDeviceCounts).length > 0) {
      lines.push("", "Device Type,Count");
      for (const [type, count] of Object.entries(data.licensedDeviceCounts)) {
        lines.push(`${escape(type)},${count}`);
      }
    }

    // Per-device licenses if available
    if (data.perDeviceLicenses.length > 0) {
      lines.push("", "License Key,License Type,State,Device Serial,Device Name,Expiration Date,Duration (Days)");
      for (const lic of data.perDeviceLicenses) {
        lines.push([
          escape(lic.licenseKey), escape(lic.licenseType), escape(lic.state),
          escape(lic.deviceSerial ?? ""), escape(lic.deviceName ?? ""),
          escape(lic.expirationDate), String(lic.durationInDays),
        ].join(","));
      }
    }

    const csv = lines.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `licenses-${org.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, org]);

  const isExpired = data && data.daysRemaining !== null && data.daysRemaining < 0;
  const isSoon = data && data.daysRemaining !== null && data.daysRemaining >= 0 && data.daysRemaining <= 90;
  const isOk = data && !isExpired && !isSoon;

  const eolDevices = getEolDevices(orgDevices);

  const headerButtons = data ? (
    <div className="flex items-center gap-1.5">
      {quoterReady && eolDevices.length > 0 && (
        <button
          onClick={() => setQuoteModalOpen(true)}
          className="flex items-center gap-1 text-xs text-meraki-orange hover:text-meraki-primary transition-colors px-2 py-0.5 rounded-md border border-meraki-orange/40 hover:border-meraki-primary/40 bg-meraki-orange/5"
          aria-label="Generate replacement quote in Quoter"
        >
          <FileText size={11} />
          Quote ({eolDevices.length})
        </button>
      )}
      <button
        onClick={exportCsv}
        className="flex items-center gap-1 text-xs text-meraki-muted hover:text-meraki-primary transition-colors px-2 py-0.5 rounded-md border border-meraki-border hover:border-meraki-primary/40"
        aria-label="Export license data to CSV"
      >
        <Download size={11} />
        Export
      </button>
    </div>
  ) : null;

  return (
    <>
    <WidgetCard
      title={org ? `Licenses — ${org.name}` : "Licenses"}
      loading={loading}
      error={error}
      onRefresh={load}
      editMode={editMode}
      headerRight={headerButtons}
    >
      {!org ? (
        <p className="text-meraki-muted text-sm text-center mt-4">Select an organization</p>
      ) : !data ? null : (
        <div className="space-y-4">
          {/* Status banner */}
          <StatusBanner status={data.status} daysRemaining={data.daysRemaining} expirationDate={data.expirationDate} />

          {/* Licensed device counts */}
          {Object.keys(data.licensedDeviceCounts).length > 0 && (
            <div>
              <p className="text-xs text-meraki-muted font-medium uppercase tracking-wide mb-2">Licensed Devices</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(data.licensedDeviceCounts).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between bg-meraki-surface border border-meraki-border rounded-lg px-3 py-2">
                    <span className="text-xs text-meraki-text capitalize">{type}</span>
                    <span className="text-xs font-semibold text-meraki-primary">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-device licenses if available */}
          {data.perDeviceLicenses.length > 0 && (
            <div>
              <p className="text-xs text-meraki-muted font-medium uppercase tracking-wide mb-2">
                Individual Licenses ({data.perDeviceLicenses.length})
              </p>
              <div className="space-y-1">
                {data.perDeviceLicenses.map((lic) => {
                  const licExpDate = new Date(lic.expirationDate);
                  const licDays = !isNaN(licExpDate.getTime())
                    ? Math.ceil((licExpDate.getTime() - Date.now()) / 86400000) : null;
                  const licExpired = licDays !== null && licDays < 0;
                  const licSoon = licDays !== null && licDays >= 0 && licDays <= 90;

                  return (
                    <div
                      key={lic.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                        licExpired ? "border-meraki-red/30 bg-meraki-red/5"
                        : licSoon ? "border-meraki-orange/30 bg-meraki-orange/5"
                        : "border-meraki-border bg-meraki-surface"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        lic.state === "active" ? "bg-meraki-green"
                        : lic.state === "expired" ? "bg-meraki-red"
                        : "bg-meraki-muted"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-meraki-text font-medium">
                          {lic.deviceName || lic.deviceSerial || lic.licenseType}
                        </span>
                        {lic.deviceSerial && lic.deviceName && (
                          <span className="text-meraki-muted ml-1.5">{lic.deviceSerial}</span>
                        )}
                      </div>
                      <span className={`shrink-0 ${
                        licExpired ? "text-meraki-red" : licSoon ? "text-meraki-orange" : "text-meraki-muted"
                      }`}>
                        {licDays !== null
                          ? licDays < 0 ? `Exp ${Math.abs(licDays)}d ago` : `${licDays}d`
                          : lic.expirationDate.slice(0, 10)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </WidgetCard>

    {/* Quoter modal */}
    {org && (
      <QuoteModal
        open={quoteModalOpen}
        onClose={() => setQuoteModalOpen(false)}
        orgName={org.name}
        devices={orgDevices}
      />
    )}
    </>
  );
}

function StatusBanner({ status, daysRemaining, expirationDate }: {
  status: string;
  daysRemaining: number | null;
  expirationDate: string;
}) {
  const isExpired = daysRemaining !== null && daysRemaining < 0;
  const isSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 90;

  if (isExpired) {
    return (
      <div className="flex items-center gap-3 bg-meraki-red/10 border border-meraki-red/30 rounded-lg px-4 py-3">
        <AlertCircle size={18} className="text-meraki-red shrink-0" />
        <div>
          <p className="text-sm font-semibold text-meraki-red">License Expired</p>
          <p className="text-xs text-meraki-red/80">
            Expired {Math.abs(daysRemaining!)}d ago · {expirationDate.replace(" UTC", "")}
          </p>
        </div>
      </div>
    );
  }

  if (isSoon) {
    return (
      <div className="flex items-center gap-3 bg-meraki-orange/10 border border-meraki-orange/30 rounded-lg px-4 py-3">
        <AlertTriangle size={18} className="text-meraki-orange shrink-0" />
        <div>
          <p className="text-sm font-semibold text-meraki-orange">Expiring Soon</p>
          <p className="text-xs text-meraki-orange/80">
            {daysRemaining}d remaining · {expirationDate.replace(" UTC", "")}
          </p>
        </div>
      </div>
    );
  }

  if (daysRemaining !== null) {
    return (
      <div className="flex items-center gap-3 bg-meraki-green/10 border border-meraki-green/30 rounded-lg px-4 py-3">
        <CheckCircle size={18} className="text-meraki-green shrink-0" />
        <div>
          <p className="text-sm font-semibold text-meraki-green">License Active</p>
          <p className="text-xs text-meraki-green/80">
            {daysRemaining}d remaining · {expirationDate.replace(" UTC", "")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-meraki-surface border border-meraki-border rounded-lg px-4 py-3">
      <Shield size={18} className="text-meraki-muted shrink-0" />
      <div>
        <p className="text-sm font-medium text-meraki-text">{status}</p>
        <p className="text-xs text-meraki-muted">No expiration date</p>
      </div>
    </div>
  );
}
