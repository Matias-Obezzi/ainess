import { useEffect } from "react";

/**
 * Where the app has nothing to offer on right click, nothing opens at all. The browser menu of a
 * desktop app is out of place (reload, view source…), so it is suppressed everywhere except:
 *
 * - elements that opened one of our own menus, which already called `preventDefault`;
 * - text fields, where the native menu is the only way to paste with the mouse;
 * - the terminals, where xterm owns that click.
 */
const KEEPS_NATIVE_MENU = "input, textarea, [contenteditable=''], [contenteditable='true'], .xterm";

export function useNoDefaultContextMenu(): void {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      // A context menu of ours already handled it while the event bubbled up here.
      if (event.defaultPrevented) return;
      const target = event.target as Element | null;
      if (target?.closest?.(KEEPS_NATIVE_MENU)) return;
      event.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);
}
