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
//
// The three of them are shared with ./trello.ts, and the parts of them that came out word for word
// the same — which local card mirrors which remote one, and the polling `watch` — live in
// ./mirror.ts. The `save` diff does not: it is the same policy written against a different API.
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
import { isRoot, localIdsByExternal, pollWatch } from "@/lib/board/mirror";
import type { BoardProvider } from "@/lib/board/provider";
import type { BoardSource, Task, TaskStatus } from "@/types";

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

/** A remote card as a local task. The local id is reused when we know it already; see ./mirror.ts. */
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

/** What the remote card would read like if it were up to date with ours. */
function bodyOf(task: Task): string {
  return task.detail ?? "";
}

export const githubProjectsBoardProvider: BoardProvider = {
  id: PROVIDER_ID,

  async load(projectId: string): Promise<Task[]> {
    const config = configOf(projectId);
    const { items } = await readBoard(config);
    const knownIds = localIdsByExternal(projectId, PROVIDER_ID);
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

  watch(projectId: string, onChange: (tasks: Task[]) => void): () => void {
    return pollWatch(PROVIDER_ID, projectId, p => githubProjectsBoardProvider.load(p), onChange);
  },
};
