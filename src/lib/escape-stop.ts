import type { EscapeStops } from "@/types";

/** How close the second Escape has to follow the first for "twice" to stop. */
export const ESCAPE_TWICE_WINDOW_MS = 1500;

/**
 * Whether this Escape stops the work, and when the last one counted for the next press.
 *
 * Pure so both Escape paths of the composer (the window listener and the box itself) answer the
 * same way, and so the three modes can be tested without a keyboard. `armedAt` is the time of the
 * previous Escape that did not stop anything; the caller keeps it and hands it back.
 */
export function escapeShouldStop(
  mode: EscapeStops | undefined,
  armedAt: number | null,
  now: number,
): { stop: boolean; armedAt: number | null } {
  if (mode === "never") return { stop: false, armedAt: null };
  if (mode !== "twice") return { stop: true, armedAt: null };
  if (armedAt !== null && now - armedAt <= ESCAPE_TWICE_WINDOW_MS) return { stop: true, armedAt: null };
  return { stop: false, armedAt: now };
}
