import { useEffect, useRef } from "react";
import { useAppStore, selectProject } from "@/store";
import { repoDirOf } from "@/lib/repo-dir";

/** A branch and its pull requests move slowly; a minute is close enough to live. */
const REFRESH_MS = 60 * 1000;

/**
 * Keeps `repoState` filled for every project on screen, not only the one with focus: once when a
 * pane opens, every minute after that, and right when the last run of that project finishes, which
 * is exactly when the working tree has just changed under the agents' hands.
 *
 * The full read also asks GitHub for the pull requests through `gh`, which is the network and the
 * slow part, so on the timer only the focused project pays it; the panes behind it get the local
 * half — branch and working tree, git alone. They are the ones the user is not reading closely,
 * and the pull requests of a repo do not move in a minute anyway. A pane that has just opened and
 * a run that has just ended do get the full read: both are events, not a clock, and a run ending
 * is the likeliest moment for a pull request to have appeared. Everything it does is read-only.
 */
export function useRepoSync(): void {
  // The dirs are in the key so a project that learns where its repo really is gets read again.
  const key = useAppStore(state =>
    state.openProjects
      .map(id => {
        const project = selectProject(state, id);
        return project?.workspaceDir ? `${id}:${repoDirOf(project)}` : "";
      })
      .filter(Boolean)
      .join("|"),
  );
  // Which projects already paid for their one full read, kept across renders so remounting the
  // app or adding a fifth pane does not call `gh` again for the four that were already there.
  const primed = useRef(new Set<string>());

  useEffect(() => {
    const openIds = () => {
      const state = useAppStore.getState();
      // The focused project is normally one of the panes; belt and braces if it ever is not.
      const ids = new Set(state.openProjects);
      if (state.currentProjectId) ids.add(state.currentProjectId);
      return [...ids].filter(id => selectProject(state, id)?.workspaceDir);
    };
    /** Branch, working tree and pull requests: git plus `gh`, plus the network behind it. */
    const full = (id: string) => {
      primed.current.add(id);
      void useAppStore.getState().refreshRepoState(id).catch(() => {});
    };
    /** Branch, working tree and recent commits: git alone, on the local folder. */
    const local = (id: string) => {
      void useAppStore.getState().refreshRepoStatus(id).catch(() => {});
    };

    for (const id of openIds()) (primed.current.has(id) ? local : full)(id);

    const timer = window.setInterval(() => {
      const focused = useAppStore.getState().currentProjectId;
      for (const id of openIds()) (id === focused ? full : local)(id);
    }, REFRESH_MS);

    // Per project: a run ending in one is no reason to go ask git about another.
    const busy = new Map<string, boolean>();
    const unsubscribe = useAppStore.subscribe(state => {
      const running = new Set<string>();
      for (const run of Object.values(state.runs)) {
        if (run.status === "running") running.add(run.projectId);
      }
      for (const id of openIds()) {
        const now = running.has(id);
        if (busy.get(id) && !now) full(id);
        busy.set(id, now);
      }
    });

    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [key]);
}
