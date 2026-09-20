import { useEffect } from "react";

/**
 * Where the app has nothing to offer on right click, nothing opens at all. The browser menu of a
 * desktop app is out of place (reload, view source…), so it is suppressed everywhere but where one
 * of ours already took the click and called `preventDefault`: the menus of the projects, the chats
 * and the messages, and the one every field and terminal shares (src/components/EditContextMenu.tsx).
 */
export function useNoDefaultContextMenu(): void {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      // A context menu of ours already handled it while the event bubbled up here.
      if (event.defaultPrevented) return;
      event.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);
}
