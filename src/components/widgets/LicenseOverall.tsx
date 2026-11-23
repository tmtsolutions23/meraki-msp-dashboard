"use client";

import { useEffect, useState, useCallback } from "react";
import { Shield, AlertTriangle, AlertCircle, Clock, ExternalLink, Download } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";
import type { OrgLicenseInfo } from "@/lib/licenseTypes";

export default function LicenseOverall({ editMode }: { editMode?: boolean }) {
  const { refreshKey } = useRefresh();
  const [data, setData] = useState<OrgLicenseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meraki/licenses", { signal });
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

  const expired = data.filter((d) => d.daysRemaining < 0);
  const expiringSoon = data.filter((d) => d.daysRemaining >= 0 && d.daysRemaining <= 90);
  const expiringLater = data.filter((d) => d.daysRemaining > 90);

  const exportCsv = useCallback(() => {
    if (data.length === 0) return;
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = ["Organization", "Status", "Expiration Date", "Days Remaining", "Licensed Devices", "Device Breakdown", "Dashboard URL"];
    const rows = data.map((lic) => {
      const deviceCount = Object.values(lic.licensedDeviceCounts).reduce((a, b) => a + b, 0);
      const breakdown = Object.entries(lic.licensedDeviceCounts).map(([k, v]) => `${v} ${k}`).join("; ");
      return [escape(lic.orgName), escape(lic.status), escape(lic.expirationDate.replace(" UTC", "")),
        String(lic.daysRemaining), String(deviceCount), escape(breakdown), escape(lic.orgUrl)].join(",");
    });
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `license-renewals-all-orgs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const exportBtn = data.length > 0 ? (
    <button onClick={exportCsv}
      className="flex items-center gap-1 text-xs text-meraki-muted hover:text-meraki-primary transition-colors px-2 py-0.5 rounded-md border border-meraki-border hover:border-meraki-primary/40"
      aria-label="Export license data to CSV">
      <Download size={11} /> Export
    </button>
  ) : null;

  return (
    <WidgetCard title="License Renewals" loading={loading} error={error} onRefresh={load} editMode={editMode} headerRight={exportBtn}>
      {data.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-meraki-muted">
          <Shield size={28} />
          <p className="text-sm">All licenses current</p>
          <p className="text-xs">No expirations within 180 days</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            {expired.length > 0 && (
              <div className="flex items-center gap-1.5 bg-meraki-red/10 border border-meraki-red/30 rounded-lg px-2.5 py-1.5">
                <AlertCircle size={12} className="text-meraki-red" />
                <span className="text-xs font-semibold text-meraki-red">{expired.length} expired</span>
              </div>
            )}
            {expiringSoon.length > 0 && (
              <div className="flex items-center gap-1.5 bg-meraki-orange/10 border border-meraki-orange/30 rounded-lg px-2.5 py-1.5">
                <AlertTriangle size={12} className="text-meraki-orange" />
                <span className="text-xs font-semibold text-meraki-orange">{expiringSoon.length} expiring soon</span>
              </div>
            )}
            {expiringLater.length > 0 && (
              <div className="flex items-center gap-1.5 bg-meraki-yellow/10 border border-meraki-yellow/30 rounded-lg px-2.5 py-1.5">
                <Clock size={12} className="text-meraki-yellow" />
                <span className="text-xs font-semibold text-meraki-yellow">{expiringLater.length} upcoming</span>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            {data.map((lic) => {
              const isExpired = lic.daysRemaining < 0;
              const isSoon = lic.daysRemaining >= 0 && lic.daysRemaining <= 90;
              return (
                <a key={lic.orgId} href={lic.orgUrl} target="_blank" rel="noopener noreferrer"
                  className={`flex items-start gap-3 p-2.5 rounded-lg border transition-colors hover:brightness-95 group ${
                    isExpired ? "border-meraki-red/30 bg-meraki-red/5"
                    : isSoon ? "border-meraki-orange/30 bg-meraki-orange/5"
                    : "border-meraki-yellow/30 bg-meraki-yellow/5"
                  }`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${
                    isExpired ? "bg-meraki-red" : isSoon ? "bg-meraki-orange" : "bg-meraki-yellow"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-meraki-text truncate group-hover:text-meraki-primary transition-colors">{lic.orgName}</p>
                      <ExternalLink size={9} className="text-meraki-muted/50 shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs font-medium ${isExpired ? "text-meraki-red" : isSoon ? "text-meraki-orange" : "text-meraki-yellow"}`}>
                        {isExpired ? `Expired ${Math.abs(lic.daysRemaining)}d ago` : `${lic.daysRemaining}d remaining`}
                      </span>
                      <span className="text-xs text-meraki-muted">·</span>
                      <span className="text-xs text-meraki-muted">{lic.expirationDate.replace(" UTC", "")}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
