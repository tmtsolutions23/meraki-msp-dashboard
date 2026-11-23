"use client";

import { useState, useEffect, useRef } from "react";
import { X, AlertTriangle, CheckCircle, Loader2, FileText, ExternalLink } from "lucide-react";
import eolModels from "@/data/meraki-eol-models.json";

interface DeviceInfo {
  serial: string;
  model: string;
  name: string;
}

interface EolDevice extends DeviceInfo {
  eolDate: string;
  eosDate: string;
  replacement: string;
  replacementLicense: string;
}

interface QuoteResult {
  quoteId: number;
  quoteName: string;
  customerName: string;
  matched: { device: DeviceInfo; hardware: string; license: string }[];
  unmatched: { device: DeviceInfo; reason: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  orgName: string;
  devices: DeviceInfo[];
}

const eolMap = eolModels as Record<string, {
  replacement: string;
  replacementLicense: string;
  eolDate: string;
  eosDate: string;
  category: string;
}>;

export function getEolDevices(devices: DeviceInfo[]): EolDevice[] {
  return devices
    .filter((d) => eolMap[d.model])
    .map((d) => ({ ...d, ...eolMap[d.model] }));
}

export default function QuoteModal({ open, onClose, orgName, devices }: Props) {
  const [state, setState] = useState<"confirm" | "loading" | "success" | "error">("confirm");
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [error, setError] = useState<string>("");
  const closeRef = useRef<HTMLButtonElement>(null);

  const eolDevices = getEolDevices(devices);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setState("confirm");
      setResult(null);
      setError("");
      closeRef.current?.focus();
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleGenerate = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/quoter/generate-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName,
          devices: eolDevices.map((d) => ({
            serial: d.serial,
            model: d.model,
            name: d.name,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data: QuoteResult = await res.json();
      setResult(data);
      setState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate quote");
      setState("error");
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClose(); } }}
        role="button"
        tabIndex={0}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quote-modal-title"
          className="bg-meraki-card border border-meraki-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col pointer-events-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-meraki-border shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-meraki-primary" />
              <h2 id="quote-modal-title" className="text-sm font-bold text-meraki-text">
                Generate Replacement Quote
              </h2>
            </div>
            <button ref={closeRef} onClick={onClose} aria-label="Close" className="text-meraki-muted hover:text-meraki-text transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto p-5">
            {state === "confirm" && (
              <div className="space-y-4">
                <p className="text-sm text-meraki-text">
                  <span className="font-semibold">{orgName}</span> has{" "}
                  <span className="font-semibold text-meraki-orange">{eolDevices.length} EOL/EOS device{eolDevices.length !== 1 ? "s" : ""}</span>{" "}
                  that need replacement.
                </p>

                {/* Device list */}
                <div className="space-y-1.5 max-h-60 overflow-auto">
                  {eolDevices.map((d) => (
                    <div key={d.serial} className="flex items-center gap-3 p-2.5 rounded-lg bg-meraki-surface border border-meraki-border text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="text-meraki-text font-medium truncate">{d.name || d.serial}</p>
                        <p className="text-meraki-muted">{d.model} → <span className="text-meraki-primary font-medium">{d.replacement}</span></p>
                      </div>
                      <span className="text-meraki-orange shrink-0">EOL {d.eolDate.slice(0, 7)}</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-meraki-muted">
                  This will create a quote in Quoter with {eolDevices.length * 2} line items
                  ({eolDevices.length} hardware + {eolDevices.length} licenses).
                </p>
              </div>
            )}

            {state === "loading" && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 size={24} className="text-meraki-primary animate-spin" />
                <p className="text-sm text-meraki-muted">Creating quote in Quoter...</p>
                <p className="text-xs text-meraki-muted">Searching catalog and adding {eolDevices.length * 2} line items</p>
              </div>
            )}

            {state === "success" && result && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 bg-meraki-green/10 border border-meraki-green/30 rounded-lg px-4 py-3">
                  <CheckCircle size={16} className="text-meraki-green shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-meraki-green">Quote Created</p>
                    <p className="text-xs text-meraki-green/80">
                      {result.matched.length} device{result.matched.length !== 1 ? "s" : ""} added to quote for {result.customerName}
                    </p>
                  </div>
                </div>

                {result.matched.length > 0 && (
                  <div>
                    <p className="text-xs text-meraki-muted font-medium uppercase tracking-wide mb-1.5">Matched ({result.matched.length})</p>
                    <div className="space-y-1">
                      {result.matched.map((m) => (
                        <div key={m.device.serial} className="text-xs flex gap-2 py-1 px-2 rounded bg-meraki-surface">
                          <span className="text-meraki-text font-medium truncate flex-1">{m.device.name || m.device.serial}</span>
                          <span className="text-meraki-green shrink-0">{m.hardware}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.unmatched.length > 0 && (
                  <div>
                    <p className="text-xs text-meraki-muted font-medium uppercase tracking-wide mb-1.5">Unmatched ({result.unmatched.length})</p>
                    <div className="space-y-1">
                      {result.unmatched.map((u) => (
                        <div key={u.device.serial} className="text-xs flex gap-2 py-1 px-2 rounded bg-meraki-orange/5 border border-meraki-orange/20">
                          <span className="text-meraki-text truncate flex-1">{u.device.name || u.device.serial} ({u.device.model})</span>
                          <span className="text-meraki-orange shrink-0 text-[10px]">{u.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {state === "error" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 bg-meraki-red/10 border border-meraki-red/30 rounded-lg px-4 py-3">
                  <AlertTriangle size={16} className="text-meraki-red shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-meraki-red">Quote Generation Failed</p>
                    <p className="text-xs text-meraki-red/80">{error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-meraki-border shrink-0">
            {state === "confirm" && (
              <>
                <button onClick={onClose} className="text-xs text-meraki-muted hover:text-meraki-text px-3 py-2 rounded-lg transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  className="text-xs font-medium bg-meraki-primary hover:bg-meraki-primary/90 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Generate Quote
                </button>
              </>
            )}
            {state === "success" && (
              <button onClick={onClose} className="text-xs font-medium bg-meraki-primary hover:bg-meraki-primary/90 text-white px-4 py-2 rounded-lg transition-colors">
                Done
              </button>
            )}
            {state === "error" && (
              <>
                <button onClick={onClose} className="text-xs text-meraki-muted hover:text-meraki-text px-3 py-2 rounded-lg transition-colors">
                  Close
                </button>
                <button
                  onClick={() => setState("confirm")}
                  className="text-xs font-medium bg-meraki-primary hover:bg-meraki-primary/90 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Try Again
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
