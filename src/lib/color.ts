// The design tokens in src/index.css are `oklch(...)`, which xterm's renderer cannot parse.
// A 1x1 canvas normalizes any CSS color the browser understands into `#rrggbb`.

let ctx: CanvasRenderingContext2D | null | undefined;

function getCtx(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    ctx = canvas.getContext("2d");
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Converts any CSS color (oklch, var() already resolved, rgb…) to `#rrggbb`. */
export function cssColorToHex(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  const c = getCtx();
  if (!c) return fallback;
  try {
    // An unparseable value leaves fillStyle untouched, so seed it with a sentinel.
    c.fillStyle = "#000000";
    c.fillStyle = trimmed;
    const result = c.fillStyle;
    if (typeof result === "string" && result.startsWith("#")) return result;
    return fallback;
  } catch {
    return fallback;
  }
}

/** Reads a CSS custom property off `<html>` and returns it as a hex color. */
export function tokenColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    return cssColorToHex(raw, fallback);
  } catch {
    return fallback;
  }
}
