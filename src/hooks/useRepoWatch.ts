import { useEffect } from "react";
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import { fileChangedInProject } from "@/lib/system-hooks";
import { log } from "@/lib/logger";

/**
 * Waits for the writes to settle before asking git. An editor saving a file, a `git checkout` or a
 * dependency install all arrive as a burst, and the answer only matters once it is over.
 */
const SETTLE_MS = 250;

/**
 * Keeps every project's repository state live off filesystem events instead of a clock.
 *
 * The branch, the diff and the file count used to be up to a minute behind whatever the user (or
 * an agent) had just done, and only for the project on screen. The backend watches each project's
 * folder (see src-tauri/src/repo_watch.rs) and says which one changed; what arrives here is one
 * event per quiet period, and each one costs a `git status` — the pull requests, which no file
 * save can change, stay on the slow timer in `useRepoSync`.
 *
 * Outside the desktop app the transport watches nothing and this hook quietly does nothing.
 */
export function useRepoWatch(): void {
  const projects = useAppStore(state => state.config.projects);
  const loaded = useAppStore(state => state.loaded);
  // The identity of the array changes on every config write; the folders are what matter.
  const key = projects.map(p => `${p.id}:${p.workspaceDir}`).join("|");

  useEffect(() => {
    if (!loaded) return;
    const transport = getTransport();
    const watched = projects.filter(p => p.workspaceDir);
    let stopped = false;
    let unlisten: (() => void) | undefined;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    void transport
      .onRepoChanged(({ projectId }) => {
        // One read per burst per project: the event already came debounced, this covers the rest.
        const pending = timers.get(projectId);
        if (pending) clearTimeout(pending);
        timers.set(projectId, setTimeout(() => {
          timers.delete(projectId);
          void useAppStore.getState().refreshRepoStatus(projectId).catch(() => {});
          // The same settled burst is what a "file.changed" hook is waiting for.
          fileChangedInProject(projectId);
        }, SETTLE_MS));
      })
      .then(off => {
        if (stopped) off();
        else unlisten = off;
      })
      .catch(() => {});

    for (const project of watched) {
      void transport.repoWatchStart(project.id, project.workspaceDir).catch((e: unknown) => {
        // A folder that is gone, or not a repo: the timer keeps covering it.
        log.debug("repo", `no se pudo observar ${project.name}: ${e instanceof Error ? e.message : String(e)}`);
      });
    }

    return () => {
      stopped = true;
      unlisten?.();
      for (const timer of timers.values()) clearTimeout(timer);
      for (const project of watched) void transport.repoWatchStop(project.id).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loaded]);
}
