import { useEffect, useMemo } from "react";
import { useAppStore, selectAllAgents, selectAgent } from "@/store";
import { isAutonomous } from "@/lib/autonomous";
import { addMessage } from "@/lib/orchestrator";
import { translateNow } from "@/i18n/useT";
import { summarizeAgentQuota } from "@/lib/quota-summary";
import type { ProviderId, ProviderQuota } from "@/types";

/** Quota moves slowly; asking every ten minutes is enough to keep the rings honest. */
const REFRESH_MS = 10 * 60 * 1000;

/**
 * Relaunches every run parked on `provider` (see `parkQuotaRetry` in lib/orchestrator.ts) whose
 * quota is no longer exhausted — same prompt, from scratch, exactly what `RetryRunDialog` does by
 * hand. A run only gets parked there because its agent's own "reintentar cuando vuelva la cuota" is
 * on, or the project is running unattended; either way, this is the one place that notices quota is
 * back and acts on it, so the checkbox works whether or not autonomous mode is involved.
 */
function retryParkedRuns(provider: ProviderId, quota: ProviderQuota): void {
  const state = useAppStore.getState();
  for (const [id, entry] of Object.entries(state.quotaWaiting)) {
    if (entry.provider !== provider) continue;

    // Quota can come back hours later, and the reason the run was parked has to still hold then.
    // An agent whose checkbox was turned off since, a project whose autonomous stretch has already
    // ended, an agent deleted outright: none of those want a run of their own starting up on its
    // own now. The park said it would retry, so dropping it says so too rather than going quiet.
    const agent = selectAgent(state, entry.agentId);
    const project = state.config.projects.find(p => p.id === entry.projectId);
    if (!agent || !(agent.retryOnQuota === true || isAutonomous(project))) {
      state.dropQuotaWaiting(id);
      if (agent) {
        addMessage({
          projectId: entry.projectId,
          fromAgentId: "system",
          toAgentId: entry.agentId,
          kind: "system",
          text: translateNow("autonomous.quotaGaveUp", { name: agent.name }),
        });
      }
      continue;
    }

    const summary = summarizeAgentQuota(quota, { model: entry.model });
    if (summary.status === "exhausted") continue;
    state.dropQuotaWaiting(id);
    void state.submitPrompt(entry.prompt, entry.agentId, entry.projectId, { model: entry.model });
  }
}

/**
 * Keeps `quota` filled for the providers the project actually uses. Without this nobody asked for
 * it until the agent dialog or the composer popover did, so the rings in the hierarchy sat empty
 * with a "sin datos" tooltip. It also refreshes right after the last run finishes, which is when
 * the numbers have just changed, and after each refresh checks whether it can relaunch anything
 * that was parked waiting for that provider's quota (see `retryParkedRuns`).
 */
export function useQuotaSync(): void {
  const agents = useAppStore(selectAllAgents);
  const binaries = useAppStore(state => state.binaries);
  const refreshQuota = useAppStore(state => state.refreshQuota);
  const quotaWaitingProviders = useAppStore(state => [...new Set(Object.values(state.quotaWaiting).map(w => w.provider))].join(","));

  // Only providers that are installed can answer; a missing CLI has no quota to report. A provider
  // with a parked run counts too, even if every agent of it was since removed from the team: the
  // run is still there waiting, and this is the only loop that ever checks on it.
  const providers = useMemo(
    () => [...new Set([...agents.map(a => a.provider), ...(quotaWaitingProviders ? quotaWaitingProviders.split(",") as ProviderId[] : [])])].filter(p => !!binaries[p]),
    [agents, binaries, quotaWaitingProviders],
  );
  const key = providers.join(",");

  useEffect(() => {
    if (providers.length === 0) return;
    const sync = () => {
      for (const provider of providers) {
        void refreshQuota(provider).then(quota => retryParkedRuns(provider, quota)).catch(() => {});
      }
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
