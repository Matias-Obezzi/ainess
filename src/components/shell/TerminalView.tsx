import { useEffect, useRef } from "react";
import { ensureTerminal, getTerminal } from "@/lib/terminal-registry";
import type { TerminalTab } from "@/types";

interface Props {
  terminal: TerminalTab;
  active: boolean;
}

/**
 * Mount point for one terminal. The xterm instance and its PTY live in the registry, not here:
 * closing the panel only detaches the element, so the shell keeps running in the background and
 * its scrollback is still there when the panel comes back.
 */
export function TerminalView({ terminal, active }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const id = terminal.id;

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    const entry = ensureTerminal(terminal, container);
    if (entry.host.parentElement !== container) container.appendChild(entry.host);
    try {
      entry.fit.fit();
    } catch {
      /* a hidden tab reports a zero size */
    }

    const observer = new ResizeObserver(() => {
      try {
        entry.fit.fit();
      } catch {
        /* hidden tabs report a zero size */
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      // The element goes back to being detached; the terminal and the PTY stay alive.
      if (entry.host.parentElement === container) container.removeChild(entry.host);
    };
    // The session is tied to the tab id; the rest of the tab never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // A hidden tab cannot be measured, so refit (and refocus) when it comes back.
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => {
      const entry = getTerminal(id);
      try {
        entry?.fit.fit();
      } catch {
        /* nothing to resize yet */
      }
      entry?.term.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [active, id]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden px-2 py-1" />;
}
