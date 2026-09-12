// Live xterm instances, kept outside React so a terminal survives its view being unmounted.
//
// Closing the terminals panel unmounts the views, but the PTY on the Rust side keeps running.
// If the view owned the xterm instance, reopening the panel would try to spawn the same session
// id again and the backend would reject it ("la terminal ya está abierta"), which showed up as a
// dead tab with exit code -1. So the terminal, its host element and its PTY subscription live
// here, and the view only borrows the element while it is on screen. A session is torn down only
// when its tab is closed (see disposeTerminal).
import { Terminal } from "@xterm/xterm";
import { translateNow } from "@/i18n/useT";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { openExternal } from "@/lib/open-external";
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import { log } from "@/lib/logger";
import { tokenColor } from "@/lib/color";
import { ensurePtyListeners, forgetPty, subscribePty } from "@/lib/pty-bus";
import type { TerminalTab } from "@/types";

export interface TerminalEntry {
  term: Terminal;
  fit: FitAddon;
  /** Element the terminal is drawn into; moved between views, never recreated. */
  host: HTMLDivElement;
  unsubscribe: () => void;
}

const entries = new Map<string, TerminalEntry>();

export function getTerminal(id: string): TerminalEntry | undefined {
  return entries.get(id);
}

/** Creates the terminal and spawns its PTY the first time; later calls return what exists. */
export function ensureTerminal(tab: TerminalTab, parent: HTMLElement): TerminalEntry {
  const existing = entries.get(tab.id);
  if (existing) return existing;

  const host = document.createElement("div");
  host.className = "h-full w-full";
  parent.appendChild(host);

  const term = new Terminal({
    fontFamily: "Cascadia Code, Consolas, monospace",
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    allowProposedApi: true,
    theme: {
      background: tokenColor("--card", "#1a1a1a"),
      foreground: tokenColor("--foreground", "#f5f5f5"),
      cursor: tokenColor("--foreground", "#f5f5f5"),
      selectionBackground: tokenColor("--accent", "#3a3a3a"),
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  // A URL in the output is a link, and one click opens it in the real browser. Both halves are
  // needed: the addon finds the ones printed as plain text, and `linkHandler` takes the ones the
  // CLI marks itself (OSC 8), which xterm otherwise only opens with Ctrl held.
  const openLink = (_event: MouseEvent, uri: string) => {
    void openExternal(uri);
  };
  term.loadAddon(new WebLinksAddon(openLink));
  term.options.linkHandler = { activate: openLink };

  term.open(host);
  try {
    fit.fit();
  } catch {
    /* the host may still be zero-sized on the first paint */
  }

  const id = tab.id;
  const transport = getTransport();

  // Ctrl+C must reach the process, so copy/paste use the Ctrl+Shift+… variants. Both are declared
  // in src/lib/shortcuts.ts (group "terminal"), which is what the Ctrl+/ dialog documents.
  term.attachCustomKeyEventHandler(e => {
    if (e.type !== "keydown" || !e.ctrlKey || !e.shiftKey) return true;
    const key = e.key.toLowerCase();
    if (key === "v") {
      e.preventDefault();
      void navigator.clipboard.readText().then(text => {
        if (text) void transport.ptyWrite(id, text).catch(() => {});
      }).catch(() => {});
      return false;
    }
    if (key === "c") {
      const selection = term.getSelection();
      if (selection) {
        e.preventDefault();
        void navigator.clipboard.writeText(selection).catch(() => {});
        return false;
      }
    }
    return true;
  });

  const dataSub = term.onData(data => {
    void transport.ptyWrite(id, data).catch(() => {});
  });
  const resizeSub = term.onResize(({ cols, rows }) => {
    void transport.ptyResize(id, cols, rows).catch(() => {});
  });

  // The subscription lives as long as the session, so output that arrives while the panel is
  // closed still lands in the scrollback.
  const unsubscribePty = subscribePty(id, {
    onData: data => term.write(data),
    onExit: code => {
      term.write(`\r\n\x1b[90m${translateNow("terminal.processEnded", { code: code ?? "?" })}\x1b[0m\r\n`);
      useAppStore.getState().markTerminalExited(id, code);
    },
  });

  const entry: TerminalEntry = {
    term,
    fit,
    host,
    unsubscribe: () => {
      unsubscribePty();
      dataSub.dispose();
      resizeSub.dispose();
    },
  };
  entries.set(id, entry);

  void ensurePtyListeners()
    .then(() => transport.ptySpawn({ id, shell: tab.shellPath, cwd: tab.cwd, cols: term.cols, rows: term.rows }))
    .then(() => {
      // A tab opened from one of the project's scripts starts by running it. Written as soon as the
      // PTY exists rather than on some delay: the shell reads its input when it is ready, and the
      // typing is buffered until then, which is the same thing that happens when a person is fast.
      if (tab.command) return transport.ptyWrite(id, `${tab.command}\r`);
    })
    .then(() => term.focus())
    .catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      log.error("terminal", `no se pudo iniciar ${id}: ${message}`);
      term.write(`\x1b[31m${message}\x1b[0m\r\n`);
      useAppStore.getState().markTerminalExited(id, -1);
    });

  return entry;
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

/** Ids with a live terminal, so a view can drop the ones whose tab is gone. */
export function liveTerminalIds(): string[] {
  return [...entries.keys()];
}
