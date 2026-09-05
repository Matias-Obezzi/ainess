/** Small display helpers shared by the shell components. */

/** "hace 12 seg" / "hace 3 min" / "hace 2 h". */
export function formatTimeAgo(ts: number, now: number): string {
  const diffSecs = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSecs < 60) return `hace ${diffSecs} seg`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays} d`;
}

/** Seconds as "m:ss". */
export function formatElapsed(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Cuts `text` to `n` chars, adding an ellipsis when it was longer. */
export function truncate(text: string, n: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= n) return clean;
  return clean.slice(0, n).trimEnd() + "…";
}

/** "14:05" in 24h format. */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
