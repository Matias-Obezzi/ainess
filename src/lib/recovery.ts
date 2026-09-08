// What is left alive when the app dies without being closed.
//
// A clean exit walks every agent process down (`runner::shutdown` in src-tauri). A crash — the
// task manager, a power cut, a panic — never gets there, so the CLIs keep going: still editing a
// workspace, still spending quota, with nobody reading their output and the app that started them
// gone. The next launch is the only thing left that knows they existed.
//
// The runs themselves are already handled elsewhere: `mergeFromDisk` closes anything left
// "running" and the project's thread shows it in amber with a button to pick it up again, which
// resumes the CLI session rather than starting over. This module is only about the processes.
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import { INTERRUPTED_OUTPUT, runningRunsOnDisk } from "@/lib/history";
import { translateNow } from "@/i18n/useT";
import { log } from "@/lib/logger";
import type { Run } from "@/types";

/** A run this process never saw end: still open, or closed by the merge as interrupted. */
function leftHanging(run: Run): boolean {
  return run.status === "running" || (run.status === "killed" && run.output === INTERRUPTED_OUTPUT);
}

/** What `reapOrphans` needs to recognise a process, for the runs that recorded one. */
export function orphansOf(runs: Run[]): Array<{ runId: string; pid: number; image: string; startedAt: number }> {
  return runs
    .filter(run => leftHanging(run) && run.process?.pid)
    .map(run => ({
      runId: run.id,
      pid: run.process!.pid,
      image: run.process!.image,
      startedAt: run.startedAt,
    }));
}

/**
 * Kills the CLI processes the previous instance left behind, across every project — including the
 * ones startup did not load, whose runs are read straight off disk. Their bookkeeping can wait
 * until you open them; the process cannot, because it is working on a repo right now.
 *
 * Never throws: a machine that will not answer about its own processes is not a reason to fail
 * startup. Returns how many were killed.
 */
export async function reapAfterCrash(): Promise<number> {
  const state = useAppStore.getState();
  const inMemory = Object.values(state.runs);
  const loaded = new Set(inMemory.map(run => run.projectId));

  const fromDisk: Run[] = [];
  for (const project of state.config.projects) {
    if (loaded.has(project.id)) continue;
    try {
      fromDisk.push(...(await runningRunsOnDisk(project.id)));
    } catch {
      // A project whose file cannot be read has nothing to tell us about its processes.
    }
  }

  const orphans = orphansOf([...inMemory, ...fromDisk]);
  if (orphans.length === 0) return 0;

  let killed: string[];
  try {
    killed = await getTransport().reapOrphans(orphans);
  } catch (err) {
    log.warn("recovery", `no se pudieron revisar los procesos de la sesión anterior: ${err}`);
    return 0;
  }
  if (killed.length === 0) return 0;

  log.warn("recovery", `${killed.length} proceso(s) de agentes sobrevivieron al cierre anterior y fueron cerrados`);
  // Worth saying out loud: the work they were doing is on disk, half done, and nothing else in the
  // app would ever mention that something had been running behind its back.
  useAppStore.getState().notify({
    kind: "interrupted",
    title: translateNow("notify.orphansKilled", { n: killed.length }),
    body: translateNow("notify.orphansKilledBody"),
  });
  return killed.length;
}
