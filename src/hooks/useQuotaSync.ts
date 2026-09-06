import { useEffect, useMemo } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import type { ProviderId } from "@/types";

/** Quota moves slowly; asking every ten minutes is enough to keep the rings honest. */
const REFRESH_MS = 10 * 60 * 1000;

/**
 * Keeps `quota` filled for the providers the project actually uses. Without this nobody asked for
 * it until the agent dialog or the composer popover did, so the rings in the hierarchy sat empty
 * with a "sin datos" tooltip. It also refreshes right after the last run finishes, which is when
 * the numbers have just changed.
 */
export function useQuotaSync(): void {
  const agents = useAppStore(selectAllAgents);
  const binaries = useAppStore(state => state.binaries);
  const refreshQuota = useAppStore(state => state.refreshQuota);

  // Only providers that are installed can answer; a missing CLI has no quota to report.
  const providers = useMemo(
    () => [...new Set(agents.map(a => a.provider))].filter(p => !!binaries[p]) as ProviderId[],
    [agents, binaries],
  );
  const key = providers.join(",");

  useEffect(() => {
    if (providers.length === 0) return;
    const sync = () => {
      for (const provider of providers) void refreshQuota(provider).catch(() => {});
    };
    sync();

    const timer = window.setInterval(sync, REFRESH_MS);
    // A run that just ended spent quota: read it again once everything is idle.
    let wasBusy = false;
    const unsubscribe = useAppStore.subscribe(state => {
      const busy = Object.values(state.runs).some(run => run.status === "running");
      if (wasBusy && !busy) sync();
      wasBusy = busy;
    });

    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshQuota]);
}
