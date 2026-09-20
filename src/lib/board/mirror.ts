// The policy every provider that mirrors a *remote* board has to follow, written once.
//
// This is not an abstraction over boards — `./provider.ts` is that. What lives here is the handful
// of decisions that came out identical in ./github-projects.ts and ./trello.ts because they are
// about our own store and not about the platform: which local card already mirrors a remote one,
// and how a poll decides that something moved. Both take the provider id as an argument and
// nothing else; the moment one of them needs a flag to fit both callers it belongs back in the
// two files, because two clear copies beat one abstraction bent to cover them.
//
// What is *not* here, on purpose: the diff a `save` does against the remote board. GitHub edits a
// draft and sets a status field with two separate mutations; Trello sends one PUT with whatever
// changed, list included. Same policy on paper, different code, and merging them would mean a
// parameter per platform difference.
import { useAppStore } from "@/store";
import type { BoardProviderId, Task } from "@/types";

/**
 * How often a mirrored board is asked whether anything moved.
 *
 * Thirty seconds is the slow end of the range the design settled on (see
 * `.ainess/PLAN-BOARD-REMOTO.md`, point 6): a collaborator moving a card is not something anybody
 * expects to see instantly, and the token this polls with is the same one the rest of the app
 * spends its rate limit on. A board open all day is a hundred and twenty requests an hour, which
 * is well under what either platform allows.
 */
export const POLL_INTERVAL_MS = 30_000;

/** A card of ours is a root when it waits for nothing. Only those travel to a remote board. */
export function isRoot(task: Task): boolean {
  return task.dependsOn.length === 0;
}

/**
 * The local id every remote card of this provider already has in this project, by its remote id.
 *
 * `load` reuses it, and that is the whole reason this exists: a poll runs every thirty seconds and
 * would otherwise mint a fresh `crypto.randomUUID()` for the same card on every read, so the board
 * would fill with duplicates, whatever pointed at a task by id — a run, an approval, a dependency
 * — would point at a card that no longer exists, and the file on disk would grow until it hit the
 * cap. The remote id is the identity; the local one only has to stay the same.
 */
export function localIdsByExternal(projectId: string, provider: BoardProviderId): Map<string, string> {
  const tasks = useAppStore.getState().tasks[projectId] ?? [];
  const out = new Map<string, string>();
  for (const task of tasks) {
    if (task.external?.provider === provider && task.external.id) out.set(task.external.id, task.id);
  }
  return out;
}

/**
 * What a poll compares: the remote id, the text and the column of every mirrored card, order
 * independent. Not `updatedAt` — both platforms move it for things that are not on the board at
 * all (a comment, a label) and the board would look like it changed on every poll.
 */
function signature(tasks: Task[]): string {
  return tasks
    .map(t => `${t.external?.id ?? t.id} ${t.title} ${t.detail ?? ""} ${t.status}`)
    .sort()
    .join("");
}

/** The cards of the store that mirror a card of this provider — the only ones a poll can compare. */
function mirroredInStore(projectId: string, provider: BoardProviderId): Task[] {
  return (useAppStore.getState().tasks[projectId] ?? []).filter(t => t.external?.provider === provider);
}

/**
 * Polls the board and says so when it moved. No webhooks yet: polling needs no public endpoint, no
 * shared secret and no signature check, and it works behind whatever firewall the user is on.
 *
 * `load` is taken as an argument rather than read off the provider so a caller that pulled `watch`
 * off the object cannot lose the binding.
 */
export function pollWatch(
  provider: BoardProviderId,
  projectId: string,
  load: (projectId: string) => Promise<Task[]>,
  onChange: (tasks: Task[]) => void,
): () => void {
  // A tick that is still in flight when the next one is due is skipped rather than queued: a slow
  // or rate-limited board would otherwise pile up requests that all ask the same question.
  let running = false;

  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void (async () => {
      try {
        const tasks = await load(projectId);
        if (signature(tasks) !== signature(mirroredInStore(projectId, provider))) onChange(tasks);
      } catch {
        // A board that is unreachable, rate-limited or misconfigured leaves the local one exactly
        // as it is. Handing `onChange` an empty list would wipe the board the user is looking at,
        // and throwing out of a timer callback is an unhandled rejection nobody can catch.
      } finally {
        running = false;
      }
    })();
  }, POLL_INTERVAL_MS);

  return () => clearInterval(timer);
}
