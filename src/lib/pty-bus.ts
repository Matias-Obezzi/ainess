// Single dispatcher for the `pty-output` / `pty-exit` events.
//
// Attaching one Tauri listener per terminal view is racy: `listen()` resolves after the
// spawn already started printing, and StrictMode remounts drop the listener for a tick.
// The bus attaches once for the whole app and buffers whatever arrives for a session that
// has no view attached yet, so the shell prompt is never lost.

import { getTransport } from "@/lib/transport";

export interface PtyHandlers {
  onData(data: string): void;
  onExit(code: number | null): void;
}

interface Pending {
  chunks: string[];
  size: number;
  exit?: number | null;
}

/** Enough to hold a boot banner; a runaway session should not eat memory. */
const MAX_BUFFERED_CHARS = 256 * 1024;

const handlers = new Map<string, PtyHandlers>();
const pending = new Map<string, Pending>();
let attached: Promise<void> | null = null;

function buffer(id: string): Pending {
  let p = pending.get(id);
  if (!p) {
    p = { chunks: [], size: 0 };
    pending.set(id, p);
  }
  return p;
}

function dispatchData(id: string, data: string): void {
  const h = handlers.get(id);
  if (h) {
    h.onData(data);
    return;
  }
  const p = buffer(id);
  p.chunks.push(data);
  p.size += data.length;
  while (p.size > MAX_BUFFERED_CHARS && p.chunks.length > 1) {
    p.size -= p.chunks.shift()!.length;
  }
}

function dispatchExit(id: string, code: number | null): void {
  const h = handlers.get(id);
  if (h) {
    h.onExit(code);
    return;
  }
  buffer(id).exit = code;
}

/** Attaches the app-wide listeners the first time a terminal is opened. */
export function ensurePtyListeners(): Promise<void> {
  if (!attached) {
    const transport = getTransport();
    attached = Promise.all([
      transport.onPtyOutput(e => dispatchData(e.id, e.data)),
      transport.onPtyExit(e => dispatchExit(e.id, e.code)),
    ]).then(() => undefined);
    // A failed attach must not be cached: the next terminal retries.
    attached.catch(() => {
      attached = null;
    });
  }
  return attached;
}

/** Routes one session's events to a view, replaying whatever arrived before it mounted. */
export function subscribePty(id: string, h: PtyHandlers): () => void {
  handlers.set(id, h);
  const p = pending.get(id);
  if (p) {
    pending.delete(id);
    for (const chunk of p.chunks) h.onData(chunk);
    if (p.exit !== undefined) h.onExit(p.exit);
  }
  return () => {
    if (handlers.get(id) === h) handlers.delete(id);
  };
}

/** Drops anything still buffered for a session that will never be shown again. */
export function forgetPty(id: string): void {
  handlers.delete(id);
  pending.delete(id);
}
