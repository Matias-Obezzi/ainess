import { useEffect } from "react";
import { useAppStore, selectProject } from "@/store";

/** A branch and its pull requests move slowly; a minute is close enough to live. */
const REFRESH_MS = 60 * 1000;

/**
 * Keeps `repoState` filled for the project the user is looking at: once when it opens, every
 * minute after that, and right when the last run of the project finishes, which is exactly when
 * the working tree has just changed under the agents' hands. Everything it does is read-only.
 */
export function useRepoSync(): void {
  const projectId = useAppStore(state => state.currentProjectId);
  const workspaceDir = useAppStore(state => selectProject(state, state.currentProjectId)?.workspaceDir ?? "");
  const refreshRepoState = useAppStore(state => state.refreshRepoState);

  useEffect(() => {
    if (!projectId || !workspaceDir) return;
    const sync = () => {
      void refreshRepoState(projectId).catch(() => {});
    };
    sync();

    const timer = window.setInterval(sync, REFRESH_MS);
    let wasBusy = false;
    const unsubscribe = useAppStore.subscribe(state => {
      const busy = Object.values(state.runs).some(
        run => run.projectId === projectId && run.status === "running",
      );
      if (wasBusy && !busy) sync();
      wasBusy = busy;
    });

    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [projectId, workspaceDir, refreshRepoState]);
}
