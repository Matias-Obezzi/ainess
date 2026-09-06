import { useEffect } from "react";
import { useAppStore } from "@/store";

/** How often the app asks the backend what the remote server and the tunnel are really doing. */
const POLL_MS = 4000;

/**
 * Keeps `remoteStatus` and `tunnelStatus` in sync with the backend for the whole app, not just
 * while Configuración → Remoto happens to be open. Without this the store went stale as soon as
 * the settings modal closed, and the title bar or the reopened modal showed the server as off
 * while it was still listening.
 */
export function useRemoteSync(): void {
  const refreshRemoteStatus = useAppStore(state => state.refreshRemoteStatus);
  const refreshTunnelStatus = useAppStore(state => state.refreshTunnelStatus);

  useEffect(() => {
    const sync = () => {
      void refreshRemoteStatus().catch(() => {});
      void refreshTunnelStatus().catch(() => {});
    };
    sync();
    const timer = window.setInterval(sync, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshRemoteStatus, refreshTunnelStatus]);
}
