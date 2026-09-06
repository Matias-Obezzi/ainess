/** Small display helpers shared by the shell components. */

/** "hace 12 segundos" / "12 seconds ago", in the locale that is active. */
export function formatTimeAgo(ts: number, now: number, locale = "es"): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "short" });
  const diffSecs = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSecs < 60) return rtf.format(-diffSecs, "second");
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return rtf.format(-diffMins, "minute");
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return rtf.format(-diffHours, "hour");
  const diffDays = Math.floor(diffHours / 24);
  return rtf.format(-diffDays, "day");
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

/** The time of day, the way the active locale writes it. */
export function formatClock(ts: number, locale = "es"): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}

/** A whole date, short, in the active locale. */
export function formatDate(ts: number, locale = "es"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(ts));
}

/** A number with the active locale's separators. */
export function formatNumber(value: number, locale = "es"): string {
  return new Intl.NumberFormat(locale).format(value);
}
