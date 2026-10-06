// Rings the bell once for a run that has printed nothing for a long while. The ticker under the
// run says it sooner and quieter (see `ActivityTicker`); this is for the run you are not looking
// at. See `lib/stall` for what "quiet" means and why it is measured outside the store.
import { hasLiveRequest } from "@/lib/live-requests";
import { useEffect } from "react";
import { useAppStore, selectAgent } from "@/store";
import { DEFAULT_STALL_STOP_MINUTES, lastOutputAt, silenceMs, stalledRuns } from "@/lib/stall";
import { stopStalledRun } from "@/lib/orchestrator";
import { translateNow } from "@/i18n/useT";
import { toast } from "@/components/ui/toast";

const CHECK_EVERY_MS = 30_000;

export function useStallWatch() {
  useEffect(() => {
    const check = () => {
      const state = useAppStore.getState();
      // A run waiting on the user has not gone quiet: it is waiting on them, and says so.
      const running = Object.values(state.runs).filter(r => r.status === "running" && !hasLiveRequest(r.id));
      for (const run of stalledRuns(running, Date.now())) {
        const name = selectAgent(state, run.agentId)?.name ?? translateNow("notify.anAgent");
        const minutes = Math.floor((Date.now() - run.startedAt) / 60_000);
        const title = translateNow("notify.stalled", { name, minutes });
        state.notify({ kind: "info", title, projectId: run.projectId, agentId: run.agentId, runId: run.id });
        toast.warning(title);
      }
      // Delegated work quiet for longer than the setting is stopped: its planner is waiting on it.
      // A run of yours is not — you are the one waiting, and you can see it.
      const limit = state.config.stallStopMinutes ?? DEFAULT_STALL_STOP_MINUTES;
      if (limit > 0) {
        const now = Date.now();
        for (const run of running) {
          if (run.parentRunId && silenceMs(lastOutputAt(run.id), run.startedAt, now) >= limit * 60_000) stopStalledRun(run.id, limit);
        }
      }
    };
    const interval = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(interval);
  }, []);
}
