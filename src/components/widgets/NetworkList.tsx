"use client";

import { useEffect, useState, useCallback } from "react";
import { Network, Tag } from "lucide-react";
import WidgetCard from "@/components/WidgetCard";
import { useRefresh } from "@/context/RefreshContext";
import type { MerakiNetwork, MerakiOrg } from "@/lib/meraki";

interface Props {
  org: MerakiOrg | null;
  editMode?: boolean;
}

export default function NetworkList({ org, editMode }: Props) {
  const { refreshKey } = useRefresh();
  const [networks, setNetworks] = useState<MerakiNetwork[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meraki/networks?orgId=${org.id}`, { signal });
      if (signal?.aborted) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setNetworks(await res.json());
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

  const filtered = networks.filter((n) =>
    n.name.toLowerCase().includes(search.toLowerCase())
  );

  const searchBar = (
    <>
      <label htmlFor="network-search" className="sr-only">Search networks</label>
      <input
        id="network-search"
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="text-xs bg-meraki-surface border border-meraki-border rounded-md px-2 py-1 text-meraki-text placeholder-meraki-muted focus:border-meraki-primary w-32"
      />
    </>
  );

  return (
    <WidgetCard
      title={org ? `Networks — ${org.name}` : "Networks"}
      loading={loading}
      error={error}
      onRefresh={load}
      editMode={editMode}
      headerRight={org ? searchBar : undefined}
    >
      {!org ? (
        <p className="text-meraki-muted text-sm text-center mt-4">Select an organization</p>
      ) : (
        <div className="space-y-1">
          {filtered.length === 0 && (
            <p className="text-meraki-muted text-sm text-center py-4">No networks found</p>
          )}
          {filtered.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 py-2 border-b border-meraki-border/50 last:border-0"
            >
              <Network size={13} className="text-meraki-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-meraki-text truncate">{n.name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {n.productTypes.map((pt) => (
                    <span
                      key={pt}
                      className="text-xs bg-meraki-primary/10 text-meraki-primary border border-meraki-primary/20 rounded-full px-2 py-0.5"
                    >
                      {pt}
                    </span>
                  ))}
                  {n.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-meraki-surface text-meraki-muted rounded-full px-2 py-0.5 flex items-center gap-1"
                    >
                      <Tag size={9} />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
