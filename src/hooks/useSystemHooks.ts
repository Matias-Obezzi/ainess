import { useEffect } from "react";
import { useAppStore } from "@/store";
import { startSystemHooks } from "@/lib/system-hooks";

/**
 * Runs the hooks that fire on the machine's conditions — a time of day, the connection, the app
 * opening — for as long as the app is open. Mounted once, at the root.
 */
export function useSystemHooks(): void {
  const loaded = useAppStore(state => state.loaded);

  useEffect(() => {
    // The config has to be read before "app.started" fires, or there are no hooks to fire.
    if (!loaded) return;
    return startSystemHooks();
  }, [loaded]);
}
