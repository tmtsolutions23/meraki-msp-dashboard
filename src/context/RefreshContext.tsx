"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

interface RefreshContextValue {
  refreshKey: number;
  intervalMs: number;
  setIntervalMs: (ms: number) => void;
  triggerRefresh: () => void;
  lastRefreshed: Date | null;
}

const RefreshContext = createContext<RefreshContextValue>({
  refreshKey: 0,
  intervalMs: 0,
  setIntervalMs: () => {},
  triggerRefresh: () => {},
  lastRefreshed: null,
});

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey]   = useState(0);
  const [intervalMs, setIntervalMs]   = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (intervalMs > 0) {
      timerRef.current = setInterval(triggerRefresh, intervalMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [intervalMs, triggerRefresh]);

  return (
    <RefreshContext.Provider
      value={{ refreshKey, intervalMs, setIntervalMs, triggerRefresh, lastRefreshed }}
    >
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  return useContext(RefreshContext);
}
