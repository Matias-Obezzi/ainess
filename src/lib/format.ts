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
/**
 * A path cut from the front, keeping the end.
 *
 * Projects tend to live side by side under one folder, so cutting a path the usual way leaves
 * every one of them reading `C:\Users\me\Desktop\projects\…` — identical, and with the only part
 * that told them apart thrown away. The tail is the answer to "which one is this".
 */
export function shortenPath(path: string, n: number): string {
  const clean = path.trim();
  if (n <= 0) return "";
  return clean.length <= n ? clean : "…" + clean.slice(clean.length - n);
}

export function truncate(text: string, n: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= n) return clean;
  return clean.slice(0, n).trimEnd() + "…";
}

/**
 * Caps `text` at `n` characters, keeping its line breaks.
 *
 * The difference from `truncate` above is the whole reason this exists: `truncate` folds every run
 * of whitespace into one space, which is right for a single line in a row and wrong for anything
 * shown as it was written — a stack trace, a multi-line command, a step's full text in a tooltip.
 */
export function clip(text: string, n: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= n) return trimmed;
  return trimmed.slice(0, n).trimEnd() + "…";
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
