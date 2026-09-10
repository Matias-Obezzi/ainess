import { useEffect } from "react";
import { useAppStore } from "@/store";
import { isAutonomous } from "@/lib/autonomous";

/** How often the clock is read. Half a minute is well under the shortest duration the picker offers. */
const TICK_MS = 30_000;

/**
 * Turns autonomous mode off on its own once a project's `until` passes, and shows the report of
 * what ran while it was on (see `endAutonomous` in the store and `lib/autonomous.ts`). Nothing
 * that is running gets killed: this only stops the mode from skipping the next stop it would hit.
 */
export function useAutonomousExpiry(): void {
  useEffect(() => {
    const check = () => {
      const state = useAppStore.getState();
      for (const project of state.config.projects) {
        if (project.autonomous && !isAutonomous(project)) {
          state.endAutonomous(project.id);
        }
      }
    };
    check();
    const timer = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
}
