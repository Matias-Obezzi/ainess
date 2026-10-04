// Live xterm instances, kept outside React so a terminal survives its view being unmounted.
//
// Closing the terminals panel unmounts the views, but the PTY on the Rust side keeps running.
// If the view owned the xterm instance, reopening the panel would try to spawn the same session
// id again and the backend would reject it ("la terminal ya está abierta"), which showed up as a
// dead tab with exit code -1. So the terminal, its host element and its PTY subscription live
// here, and the view only borrows the element while it is on screen. A session is torn down only
// when its tab is closed (see disposeTerminal).
//
// This half holds no xterm code, only the map: it is imported by the right-click menu, which is on
// screen from the first frame, and xterm is a big library to load for a panel that may never open.
// `terminal-create` makes the terminals, and is loaded with the panel.
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { getTransport } from "@/lib/transport";
import { forgetPty } from "@/lib/pty-bus";

export interface TerminalEntry {
  term: Terminal;
  fit: FitAddon;
  /** Element the terminal is drawn into; moved between views, never recreated. */
  host: HTMLDivElement;
  unsubscribe: () => void;
}

const entries = new Map<string, TerminalEntry>();

/** For `terminal-create`: a terminal it made, from now on owned here. */
export function registerTerminal(id: string, entry: TerminalEntry): void {
  entries.set(id, entry);
}

export function getTerminal(id: string): TerminalEntry | undefined {
  return entries.get(id);
}

/** The live terminal `node` was clicked in, for the right-click menu. */
export function terminalAt(node: Node): { id: string; entry: TerminalEntry } | undefined {
  for (const [id, entry] of entries) if (entry.host.contains(node)) return { id, entry };
  return undefined;
}

/** Puts the clipboard into the PTY: Ctrl+Shift+V and the right-click menu do the same thing. */
export async function pasteIntoTerminal(id: string): Promise<void> {
  const text = await navigator.clipboard.readText().catch(() => "");
  if (text) await getTransport().ptyWrite(id, text).catch(() => {});
}

/** Tears down one session's terminal. Only the tab's close button gets here. */
export function disposeTerminal(id: string): void {
  const entry = entries.get(id);
  if (!entry) return;
  entries.delete(id);
  entry.unsubscribe();
  entry.term.dispose();
  entry.host.remove();
  forgetPty(id);
}

/** Whether a tab's shell is a PowerShell (Windows PowerShell or pwsh), by the program it runs. */
export function isPowerShell(shellPath: string): boolean {
  return /(^|[\\/])(pwsh|powershell)(\.exe)?$/i.test(shellPath.trim());
}

/**
 * `command` the way the tab's shell has to be typed it.
 *
 * PowerShell reads a line that starts with a quoted string as that string — an expression, not a
 * program — so `"C:\…\claude.exe" auth login` failed on "auth" as an unexpected token. The call
 * operator is what says "run this". Every other shell runs the quoted path as it is.
 */
export function typedFor(command: string, shellPath: string): string {
  return isPowerShell(shellPath) && command.trimStart().startsWith('"') ? `& ${command}` : command;
}

/** Ids with a live terminal, so a view can drop the ones whose tab is gone. */
export function liveTerminalIds(): string[] {
  return [...entries.keys()];
}
