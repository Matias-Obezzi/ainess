import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import { log } from "@/lib/logger";
import { tokenColor } from "@/lib/color";
import type { TerminalTab } from "@/types";

interface Props {
  terminal: TerminalTab;
  active: boolean;
}

/** One xterm instance bound to a PTY session in the Rust backend. */
export function TerminalView({ terminal, active }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // The session is spawned once per tab, even though StrictMode mounts the effect twice.
  const spawnedRef = useRef(false);

  const id = terminal.id;
  const shellPath = terminal.shellPath;
  const cwd = terminal.cwd;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

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
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;
    try {
      fit.fit();
    } catch {
      /* the host may still be zero-sized on the first paint */
    }

    // Ctrl+C must reach the process, so copy/paste use the Ctrl+Shift+… variants.
    term.attachCustomKeyEventHandler(e => {
      if (e.type !== "keydown" || !e.ctrlKey || !e.shiftKey) return true;
      const key = e.key.toLowerCase();
      if (key === "v") {
        e.preventDefault();
        void navigator.clipboard.readText().then(text => {
          if (text) void getTransport().ptyWrite(id, text).catch(() => {});
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

    const transport = getTransport();
    const dataSub = term.onData(data => {
      void transport.ptyWrite(id, data).catch(() => {});
    });
    const resizeSub = term.onResize(({ cols, rows }) => {
      void transport.ptyResize(id, cols, rows).catch(() => {});
    });

    let disposed = false;
    const unsubs: Array<() => void> = [];

    void transport.onPtyOutput(e => {
      if (disposed || e.id !== id) return;
      term.write(e.data);
    }).then(un => (disposed ? un() : unsubs.push(un)));

    void transport.onPtyExit(e => {
      if (disposed || e.id !== id) return;
      term.write(`\r\n\x1b[90m[proceso terminado con código ${e.code ?? "?"}]\x1b[0m\r\n`);
      useAppStore.getState().markTerminalExited(id, e.code);
    }).then(un => (disposed ? un() : unsubs.push(un)));

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* hidden tabs report a zero size */
      }
    });
    observer.observe(host);

    if (!spawnedRef.current) {
      spawnedRef.current = true;
      void transport
        .ptySpawn({ id, shell: shellPath, cwd, cols: term.cols, rows: term.rows })
        .then(() => term.focus())
        .catch((e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          log.error("terminal", `no se pudo iniciar ${id}: ${message}`);
          term.write(`\x1b[31m${message}\x1b[0m\r\n`);
          useAppStore.getState().markTerminalExited(id, -1);
        });
    }

    return () => {
      disposed = true;
      observer.disconnect();
      dataSub.dispose();
      resizeSub.dispose();
      for (const un of unsubs) un();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // The session is tied to the tab id; the rest of the tab never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // A hidden tab cannot be measured, so refit (and refocus) when it comes back.
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* nothing to resize yet */
      }
      termRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [active]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden px-2 py-1" />;
}
