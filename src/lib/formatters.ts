/** Relative time label from an ISO date string */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "—";
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Snap a number up to the nearest allowed value */
export function snapUp<T extends number>(value: number, allowed: readonly T[], fallback: T): T {
  return allowed.find((v) => v >= value) ?? fallback;
}
