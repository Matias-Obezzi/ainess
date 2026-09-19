// A project's board living on a Trello board instead of on this machine.
//
// The shape is the one ./provider.ts asks for — `load`, `save`, `watch` — on top of the client in
// ./trello-client.ts, which is where the key, the token and the HTTP live. Nothing here talks to
// the network; everything here is about turning a board's cards into `Task` and back.
//
// It is the same policy as ./github-projects.ts next door, deliberately: a board that is not
// configured is an error and not an empty list, only root cards travel, and nothing is ever
// deleted on the other side. What the two genuinely share sits in ./mirror.ts; the rest reads the
// same and is written twice because the two platforms write differently — see `save`.
//
// Trello's own vocabulary maps onto ours without much fuss: a board is the board, a list is a
// column, a card is a card. `BoardSource.externalId` holds the board (the id `parseBoardId` reads
// out of the URL somebody pasted) and `BoardSource.columns` maps each of our columns to a *list
// id*. By id and not by name, in both directions: guessing from the list's name would file cards
// under the wrong column the day somebody renames one, and do it silently.
import { useAppStore } from "@/store";
import { createTask, TASK_STATUSES } from "@/lib/tasks";
import {
  TrelloBoardError,
  addCard,
  listCards,
  updateCard,
  type TrelloCard,
} from "@/lib/board/trello-client";
import { isRoot, localIdsByExternal, pollWatch } from "@/lib/board/mirror";
import type { BoardProvider } from "@/lib/board/provider";
import type { BoardSource, Task, TaskStatus } from "@/types";

/** What `BoardSource` looks like once it is complete enough to be used. */
interface Configured {
  boardId: string;
  columns: Partial<Record<TaskStatus, string>>;
}

const PROVIDER_ID = "trello" as const;

/** The board this project points at, or the reason it cannot be used. */
function configOf(projectId: string): Configured {
  const project = useAppStore.getState().config.projects.find(p => p.id === projectId);
  const board: BoardSource | undefined = project?.board;
  const boardId = board?.externalId?.trim();
  const columns = board?.columns;
  // Not "not configured yet, answer with nothing": a board that cannot be addressed has to fail,
  // because an empty list is indistinguishable from a board whose cards were all removed.
  if (!boardId) {
    throw new TrelloBoardError("not-found", `project ${projectId} has no Trello board configured`);
  }
  if (!columns || Object.keys(columns).length === 0) {
    throw new TrelloBoardError("not-found", `project ${projectId} has no column mapping for its Trello board`);
  }
  return { boardId, columns };
}

/** Our column for one of the board's lists; anything unmapped lands in the backlog. */
function statusFromList(columns: Configured["columns"], idList: string | undefined): TaskStatus {
  if (!idList) return "backlog";
  return TASK_STATUSES.find(status => columns[status] === idList) ?? "backlog";
}

/** A remote card as a local task. The local id is reused when we know it already; see ./mirror.ts. */
function toTask(card: TrelloCard, projectId: string, config: Configured, knownIds: Map<string, string>): Task {
  return createTask({
    projectId,
    id: knownIds.get(card.id),
    title: card.name,
    detail: card.desc || undefined,
    status: statusFromList(config.columns, card.idList),
    // The dependency graph is orchestration and stays on this machine: a Trello card has nowhere
    // to put it. See `.ainess/PLAN-BOARD-REMOTO.md`, point 3.
    dependsOn: [],
    updatedAt: card.updatedAt || undefined,
    external: { provider: PROVIDER_ID, id: card.id, url: card.url },
  });
}

/** What the remote card would read like if it were up to date with ours. */
function bodyOf(task: Task): string {
  return task.detail ?? "";
}

export const trelloBoardProvider: BoardProvider = {
  id: PROVIDER_ID,

  async load(projectId: string): Promise<Task[]> {
    const config = configOf(projectId);
    // No `resolveBoard` first: `listCards` takes the same id or short link, and the board's own
    // name and lists are only needed by the dialog that maps the columns. One request, not two.
    // Archived cards are already off this list — `listCards` drops them.
    const cards = await listCards(config.boardId);
    const knownIds = localIdsByExternal(projectId, PROVIDER_ID);
    return cards.map(card => toTask(card, projectId, config, knownIds));
  },

  /**
   * Sends what moved and answers with the board as it ended up.
   *
   * **Only root cards travel.** A card is a root when it depends on nothing (`dependsOn.length ===
   * 0`); the ones a delegation opened hang off the card that caused them and stay in the local
   * mirror only. Two reasons, and both matter: one request per delegation against the API is
   * traffic and rate limit spent on something nobody asked for, and a human collaborator opening
   * the board does not want the execution detail of ainess filed next to their own work. See
   * `.ainess/PLAN-BOARD-REMOTO.md`, point 5.
   *
   * **Nothing is deleted.** A card that was on the board and is no longer in the list stays where
   * it is. It may be somebody else's card, and it may simply be one we archived on our side;
   * deleting on that guess is destructive, irreversible from here and nobody asked for it.
   */
  async save(projectId: string, tasks: Task[]): Promise<Task[]> {
    const config = configOf(projectId);
    // Read before writing: what changed can only be told against what is actually there, and a
    // board written flat every time would spend a request per card per save.
    const cards = await listCards(config.boardId);
    const remoteById = new Map(cards.map(card => [card.id, card]));

    // One operation failing must not cost the others: a card Trello refused (one somebody moved to
    // another board, a list that was archived) would otherwise stop the sync at whatever position
    // that card happened to sit in. Half a synchronised board beats none. What must never be
    // silent is everything failing — that is the network, the credentials or the board, and it has
    // to reach `saveTasks` as an error instead of looking like a clean save.
    let attempted = 0;
    const failures: unknown[] = [];

    const out: Task[] = [];
    for (const task of tasks) {
      if (!isRoot(task)) { out.push(task); continue; }

      if (!task.external) {
        // Unlike a GitHub draft, a Trello card is born *in* a list: there is no "create, then move
        // it to its column". A column nobody mapped has no list to open the card in, so it stays
        // home rather than landing in whichever list happens to be first.
        const idList = config.columns[task.status];
        if (!idList) { out.push(task); continue; }
        attempted++;
        try {
          const created = await addCard(idList, task.title, bodyOf(task));
          out.push({ ...task, external: { provider: PROVIDER_ID, id: created.id, url: created.url } });
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

      // One PUT with whatever moved, the text and the list together: Trello has a single endpoint
      // for a card and no separate one for moving it between lists, so splitting this in two would
      // be two requests saying what one says.
      const changes: { name?: string; desc?: string; idList?: string } = {};
      if (remote.name !== task.title) changes.name = task.title;
      if (remote.desc !== bodyOf(task)) changes.desc = bodyOf(task);
      const idList = config.columns[task.status];
      if (idList && remote.idList !== idList) changes.idList = idList;
      if (Object.keys(changes).length === 0) continue;

      attempted++;
      try {
        await updateCard(task.external.id, changes);
      } catch (e) {
        failures.push(e);
      }
    }

    if (attempted > 0 && failures.length === attempted) throw failures[0];
    return out;
  },

  watch(projectId: string, onChange: (tasks: Task[]) => void): () => void {
    return pollWatch(PROVIDER_ID, projectId, p => trelloBoardProvider.load(p), onChange);
  },
};
