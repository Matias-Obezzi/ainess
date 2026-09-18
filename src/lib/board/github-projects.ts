// A project's board living on GitHub Projects v2 instead of on this machine.
//
// The shape is the one ./provider.ts asks for — `load`, `save`, `watch` — on top of the client in
// ./github-client.ts, which is where the token, the pagination and the GraphQL live. Nothing here
// talks HTTP; everything here is about turning a project's cards into `Task` and back, which is a
// different problem and fails in different ways.
//
// Three decisions are worth reading before the code, because they are why this file is shaped the
// way it is and none of them is obvious from the types:
//
//  1. A board that is not configured is an error, not an empty list. `owner`, `number` and the
//     column mapping all have to be there. Answering with no cards would look exactly like a board
//     somebody emptied, and the projection in src/lib/task-store.ts would happily write that to
//     `.ainess/BOARD.md`.
//  2. Only root cards travel. See `save`.
//  3. Nothing is ever deleted on the other side. See `save`.
//
// The columns are mapped by option id in both directions from `BoardSource.columns`; guessing from
// the option's name would file cards under the wrong column the day somebody renames one, and do it
// silently, which is the failure nobody notices.
import { useAppStore } from "@/store";
import { createTask, TASK_STATUSES } from "@/lib/tasks";
import {
  GhBoardError,
  addDraftItem,
  listItems,
  resolveProject,
  setItemStatus,
  updateDraftItem,
  type GhItem,
  type GhProject,
} from "@/lib/board/github-client";
import type { BoardProvider } from "@/lib/board/provider";
import type { BoardSource, Task, TaskStatus } from "@/types";

/**
 * How often `watch` asks the board whether anything moved.
 *
 * Thirty seconds is the slow end of the range the design settled on (see
 * `.ainess/PLAN-BOARD-REMOTO.md`, point 6): a collaborator moving a card is not something anybody
 * expects to see instantly, and the token this polls with is the same one the rest of the app
 * spends its rate limit on. A board open all day is a hundred and twenty requests an hour at this
 * rate, which is well under the five thousand GitHub gives.
 */
const POLL_INTERVAL_MS = 30_000;

/** What `BoardSource` looks like once it is complete enough to be used. */
interface Configured {
  owner: string;
  number: number;
  columns: Partial<Record<TaskStatus, string>>;
}

const PROVIDER_ID = "github-projects" as const;

/** The board this project points at, or the reason it cannot be used. */
function configOf(projectId: string): Configured {
  const project = useAppStore.getState().config.projects.find(p => p.id === projectId);
  const board: BoardSource | undefined = project?.board;
  const owner = board?.owner?.trim();
  const number = board?.number;
  const columns = board?.columns;
  // Not "not configured yet, answer with nothing": a board that cannot be addressed has to fail,
  // because an empty list is indistinguishable from a board whose cards were all removed.
  if (!owner || typeof number !== "number" || !Number.isFinite(number)) {
    throw new GhBoardError("not-found", `project ${projectId} has no GitHub board owner/number configured`);
  }
  if (!columns || Object.keys(columns).length === 0) {
    throw new GhBoardError("not-found", `project ${projectId} has no column mapping for its GitHub board`);
  }
  return { owner, number, columns };
}

/** Our column for one of the platform's status options; anything unmapped lands in the backlog. */
function statusFromOption(columns: Configured["columns"], optionId: string | undefined): TaskStatus {
  if (!optionId) return "backlog";
  return TASK_STATUSES.find(status => columns[status] === optionId) ?? "backlog";
}

/** The project and its items, which is what both `load` and `save` start from. */
async function readBoard(config: Configured): Promise<{ project: GhProject; items: GhItem[] }> {
  const project = await resolveProject({ owner: config.owner, number: config.number });
  const items = await listItems(project.id, project.statusFieldId);
  // Archived items stay in the project and are not on the board: the client hands them over and
  // leaves the decision here, and a board does not show what somebody archived.
  return { project, items: items.filter(item => !item.isArchived) };
}

/** The local id a remote card already has in this project's board, by its remote id. */
function localIdsByExternal(projectId: string): Map<string, string> {
  const tasks = useAppStore.getState().tasks[projectId] ?? [];
  const out = new Map<string, string>();
  for (const task of tasks) {
    if (task.external?.provider === PROVIDER_ID && task.external.id) out.set(task.external.id, task.id);
  }
  return out;
}

/**
 * A remote card as a local task.
 *
 * The local id is *reused* when we already know this card, and this is the whole reason the map
 * above exists: every `load` (and `watch` polls one every thirty seconds) would otherwise mint a
 * fresh `crypto.randomUUID()` for the same card, so the board would fill with duplicates, whatever
 * pointed at a task by id — a run, an approval, a dependency — would point at a card that no longer
 * exists, and the file on disk would grow until it hit the cap. The remote id is the identity; the
 * local one only has to stay the same.
 */
function toTask(item: GhItem, projectId: string, config: Configured, knownIds: Map<string, string>): Task {
  return createTask({
    projectId,
    id: knownIds.get(item.id),
    title: item.title,
    detail: item.body || undefined,
    status: statusFromOption(config.columns, item.statusOptionId),
    // The dependency graph is orchestration and stays on this machine: GitHub Projects has nowhere
    // to put it. See `.ainess/PLAN-BOARD-REMOTO.md`, point 3.
    dependsOn: [],
    updatedAt: item.updatedAt || undefined,
    external: { provider: PROVIDER_ID, id: item.id, url: item.url },
  });
}

/** A card of ours is a root when it waits for nothing. Only those travel; see `save`. */
function isRoot(task: Task): boolean {
  return task.dependsOn.length === 0;
}

/** What the remote card would read like if it were up to date with ours. */
function bodyOf(task: Task): string {
  return task.detail ?? "";
}

export const githubProjectsBoardProvider: BoardProvider = {
  id: PROVIDER_ID,

  async load(projectId: string): Promise<Task[]> {
    const config = configOf(projectId);
    const { items } = await readBoard(config);
    const knownIds = localIdsByExternal(projectId);
    return items.map(item => toTask(item, projectId, config, knownIds));
  },

  /**
   * Sends what moved and answers with the board as it ended up.
   *
   * **Only root cards travel.** A card is a root when it depends on nothing (`dependsOn.length ===
   * 0`); the ones a delegation opened hang off the card that caused them and stay in the local
   * mirror only. Two reasons, and both matter: one request per delegation against the API is
   * traffic and rate limit spent on something nobody asked for, and a human collaborator opening
   * the project does not want ainess's execution detail filed next to their own work. See
   * `.ainess/PLAN-BOARD-REMOTO.md`, point 5.
   *
   * **Nothing is deleted.** A card that was on the board and is no longer in the list stays where
   * it is. It may be somebody else's card, and it may simply be one we archived on our side;
   * deleting on that guess is destructive, irreversible from here and nobody asked for it.
   */
  async save(projectId: string, tasks: Task[]): Promise<Task[]> {
    const config = configOf(projectId);
    // Read before writing: what changed can only be told against what is actually there, and a
    // board written flat every time would spend a mutation per card per save.
    const { project, items } = await readBoard(config);
    const remoteById = new Map(items.map(item => [item.id, item]));

    // One operation failing must not cost the others: a card GitHub refused (a draft somebody
    // converted to an issue, a column option that was deleted) would otherwise stop the sync at
    // whatever position that card happened to sit in. Half a synchronised board beats none. What
    // must never be silent is everything failing — that is the network, the token or the project,
    // and it has to reach `saveTasks` as an error instead of looking like a clean save.
    let attempted = 0;
    const failures: unknown[] = [];
    const run = async (op: () => Promise<void>): Promise<void> => {
      attempted++;
      try { await op(); } catch (e) { failures.push(e); }
    };

    const out: Task[] = [];
    for (const task of tasks) {
      if (!isRoot(task)) { out.push(task); continue; }

      if (!task.external) {
        attempted++;
        try {
          const created = await addDraftItem(project.id, task.title, bodyOf(task));
          const mirrored: Task = { ...task, external: { provider: PROVIDER_ID, id: created.id, url: created.url } };
          // A brand new card starts in whatever column the project defaults to, so its status is
          // sent right after, unless this column has no option mapped to it.
          const optionId = config.columns[task.status];
          if (optionId && project.statusFieldId) {
            await run(() => setItemStatus(project.id, created.id, project.statusFieldId as string, optionId));
          }
          out.push(mirrored);
        } catch (e) {
          failures.push(e);
          out.push(task);
        }
        continue;
      }

      out.push(task);
      const remote = remoteById.get(task.external.id);
      // The card is ours and is not there any more: somebody deleted or archived it on the other
      // side. Opening it again would undo their decision, so it is left alone.
      if (!remote) continue;

      if (remote.isDraft && remote.draftId && (remote.title !== task.title || remote.body !== bodyOf(task))) {
        const draftId = remote.draftId;
        await run(() => updateDraftItem(draftId, task.title, bodyOf(task)));
      }

      const optionId = config.columns[task.status];
      if (optionId && project.statusFieldId && remote.statusOptionId !== optionId) {
        const fieldId = project.statusFieldId;
        await run(() => setItemStatus(project.id, task.external!.id, fieldId, optionId));
      }
    }

    if (attempted > 0 && failures.length === attempted) throw failures[0];
    return out;
  },

  /**
   * Polls the board and says so when it moved. No webhooks yet: polling needs no public endpoint,
   * no shared secret and no signature check, and it works behind whatever firewall the user is on.
   */
  watch(projectId: string, onChange: (tasks: Task[]) => void): () => void {
    // A tick that is still in flight when the next one is due is skipped rather than queued: a slow
    // or rate-limited board would otherwise pile up requests that all ask the same question.
    let running = false;

    const timer = setInterval(() => {
      if (running) return;
      running = true;
      void (async () => {
        try {
          // Not `this.load`: a caller that pulled `watch` off the object would lose the binding.
          const tasks = await githubProjectsBoardProvider.load(projectId);
          if (signature(tasks) !== signature(mirroredInStore(projectId))) onChange(tasks);
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
  },
};

/** The cards of the store that mirror a card of this provider — the only ones a poll can compare. */
function mirroredInStore(projectId: string): Task[] {
  return (useAppStore.getState().tasks[projectId] ?? []).filter(t => t.external?.provider === PROVIDER_ID);
}

/**
 * What a poll compares: the remote id, the text and the column of every mirrored card, order
 * independent. Not `updatedAt` — GitHub moves it for things that are not on the board at all (a
 * comment, a label) and the board would look like it changed on every poll.
 */
function signature(tasks: Task[]): string {
  return tasks
    .map(t => `${t.external?.id ?? t.id} ${t.title} ${t.detail ?? ""} ${t.status}`)
    .sort()
    .join("");
}
