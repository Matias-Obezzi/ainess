// Rings the bell once for a run that has printed nothing for a long while. The ticker under the
// run says it sooner and quieter (see `ActivityTicker`); this is for the run you are not looking
// at. See `lib/stall` for what "quiet" means and why it is measured outside the store.
import { useEffect } from "react";
import { useAppStore, selectAgent } from "@/store";
import { stalledRuns } from "@/lib/stall";
import { translateNow } from "@/i18n/useT";
import { toast } from "@/components/ui/toast";

const CHECK_EVERY_MS = 30_000;

export function useStallWatch() {
  useEffect(() => {
    const check = () => {
      const state = useAppStore.getState();
      const running = Object.values(state.runs).filter(r => r.status === "running");
      for (const run of stalledRuns(running, Date.now())) {
        const name = selectAgent(state, run.agentId)?.name ?? translateNow("notify.anAgent");
        const minutes = Math.floor((Date.now() - run.startedAt) / 60_000);
        const title = translateNow("notify.stalled", { name, minutes });
        state.notify({ kind: "info", title, projectId: run.projectId, agentId: run.agentId, runId: run.id });
        toast.warning(title);
      }
    };
    const interval = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(interval);
  }, []);
}
