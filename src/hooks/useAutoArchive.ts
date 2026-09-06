// Sweeps a project's board so the "Hecho" column does not grow forever: every done task nobody
// touched for `config.autoArchiveDoneDays` days is archived. Archiving only sets a flag, and the
// user can undo it from the archive, so the sweep never loses anything.
import { useEffect } from "react";
import { useAppStore } from "@/store";
import { tasksToAutoArchive } from "@/lib/tasks";

/** How often the sweep runs again while the app stays open. */
const EVERY_MS = 60 * 60 * 1000;

export function useAutoArchive(projectId: string): void {
  const days = useAppStore(state => state.config.autoArchiveDoneDays);
  // The board is the trigger: opening it (and every change to its cards) checks the list again.
  const tasks = useAppStore(state => state.tasks[projectId]);

  useEffect(() => {
    if (days === null) return;
    const sweep = () => {
      const store = useAppStore.getState();
      const stale = tasksToAutoArchive(store.tasks[projectId] ?? [], days, Date.now());
      for (const task of stale) store.archiveTask(task.id, true);
    };
    sweep();
    const timer = setInterval(sweep, EVERY_MS);
    return () => clearInterval(timer);
  }, [projectId, days, tasks]);
}
