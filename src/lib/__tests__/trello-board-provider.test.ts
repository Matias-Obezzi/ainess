// The Trello board, with the client mocked out.
//
// The client has its own test (trello-board-client.test.ts) and it is where the credentials, the
// URLs and the HTTP belong. What is left here is everything the provider decides on its own, and
// every one of those decisions is a way the board can go wrong quietly: a board that is not
// configured answering with no cards, a poll that mints a new id for a card it already knows, a
// delegation card opened on somebody's shared board, a card moved on the other side because it
// left our list.
//
// The same suite as github-board-provider.test.ts, on purpose: the two providers are supposed to
// behave the same, and two suites that read alike are how a difference between them shows up.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAppStore } from "@/store";
import { createTask } from "@/lib/tasks";
import type { Project, Task } from "@/types";

vi.mock("@/lib/board/trello-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/board/trello-client")>("@/lib/board/trello-client");
  return {
    ...actual,
    resolveBoard: vi.fn(),
    listCards: vi.fn(),
    addCard: vi.fn(),
    updateCard: vi.fn(),
  };
});

import {
  TrelloBoardError,
  addCard,
  listCards,
  updateCard,
  type TrelloCard,
} from "@/lib/board/trello-client";
import { trelloBoardProvider as provider } from "@/lib/board/trello";

const PROJECT_ID = "p1";
const BOARD_ID = "AbCd1234";

/** The list ids of the remote board, one per column of ours. */
const LISTS = {
  backlog: "list-backlog",
  working: "list-working",
  "needs-you": "list-needs",
  "in-review": "list-review",
  ready: "list-ready",
  done: "list-done",
};

function card(over: Partial<TrelloCard> = {}): TrelloCard {
  return {
    id: "CARD_1",
    idList: LISTS.backlog,
    name: "Card",
    desc: "",
    updatedAt: 1000,
    url: undefined,
    ...over,
  };
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    name: "tienda",
    workspaceDir: "C:\\repos\\tienda",
    createdAt: 1,
    agents: [],
    board: { provider: "trello", externalId: BOARD_ID, columns: LISTS },
    ...over,
  };
}

/** Puts one project and its in-memory cards in the store, which is where the provider reads them. */
function seed(p: Project, tasks: Task[] = []) {
  useAppStore.setState(state => ({
    config: { ...state.config, projects: [p] },
    tasks: { ...state.tasks, [p.id]: tasks },
  }));
}

const mocked = {
  listCards: vi.mocked(listCards),
  addCard: vi.mocked(addCard),
  updateCard: vi.mocked(updateCard),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listCards.mockResolvedValue([]);
  mocked.addCard.mockImplementation(async (idList, name, desc) =>
    card({ id: "NEW_1", idList, name, desc, url: "https://trello.com/c/NEW_1" }));
  mocked.updateCard.mockResolvedValue(undefined);
  seed(project());
});

describe("load", () => {
  it("refuses a board that is not configured instead of answering with an empty one", async () => {
    for (const board of [
      undefined,
      { provider: "trello" as const },
      { provider: "trello" as const, columns: LISTS },
      { provider: "trello" as const, externalId: BOARD_ID },
      { provider: "trello" as const, externalId: BOARD_ID, columns: {} },
      { provider: "trello" as const, externalId: "   ", columns: LISTS },
    ]) {
      seed(project({ board }));
      await expect(provider.load(PROJECT_ID)).rejects.toMatchObject({ kind: "not-found" });
    }
    expect(mocked.listCards).not.toHaveBeenCalled();
  });

  it("maps every column back from the list ids the project was configured with", async () => {
    mocked.listCards.mockResolvedValue([
      card({ id: "A", idList: LISTS.working }),
      card({ id: "B", idList: LISTS["in-review"] }),
      card({ id: "C", idList: LISTS.done }),
    ]);

    const tasks = await provider.load(PROJECT_ID);

    expect(tasks.map(t => t.status)).toEqual(["working", "in-review", "done"]);
    expect(tasks.map(t => t.external?.id)).toEqual(["A", "B", "C"]);
    expect(mocked.listCards).toHaveBeenCalledWith(BOARD_ID);
  });

  it("puts a card in the backlog when its list is one nobody mapped", async () => {
    mocked.listCards.mockResolvedValue([
      card({ id: "A", idList: "list-somebody-added-this" }),
      card({ id: "B", idList: "" }),
    ]);

    expect((await provider.load(PROJECT_ID)).map(t => t.status)).toEqual(["backlog", "backlog"]);
  });

  it("carries the card's short link so the board can open it", async () => {
    mocked.listCards.mockResolvedValue([card({ id: "A", url: "https://trello.com/c/A" })]);

    expect((await provider.load(PROJECT_ID))[0].external)
      .toEqual({ provider: "trello", id: "A", url: "https://trello.com/c/A" });
  });

  // The one that matters most: `watch` polls every thirty seconds, so a fresh uuid per read would
  // fill the board with copies of the same card and orphan every run and dependency pointing at it.
  it("reuses the local id of a card it already mirrors instead of duplicating it", async () => {
    const known = createTask({
      projectId: PROJECT_ID,
      id: "local-1",
      title: "old title",
      external: { provider: "trello", id: "A" },
    });
    seed(project(), [known]);
    mocked.listCards.mockResolvedValue([card({ id: "A", name: "new title" }), card({ id: "B" })]);

    const tasks = await provider.load(PROJECT_ID);

    expect(tasks[0].id).toBe("local-1");
    expect(tasks[0].title).toBe("new title");
    expect(tasks[1].id).not.toBe("local-1");
  });
});

describe("save", () => {
  const root = (over: Partial<Task> = {}) => createTask({ projectId: PROJECT_ID, title: "root", ...over });
  const child = (over: Partial<Task> = {}) =>
    createTask({ projectId: PROJECT_ID, title: "child", dependsOn: ["local-root"], ...over });

  it("opens a card for a root and leaves the delegation cards at home", async () => {
    const parent = root({ id: "local-root", status: "working" });
    const kid = child();

    const out = await provider.save(PROJECT_ID, [parent, kid]);

    expect(mocked.addCard).toHaveBeenCalledTimes(1);
    // Straight into the list of its column: a Trello card is born in a list, there is no move after.
    expect(mocked.addCard).toHaveBeenCalledWith(LISTS.working, "root", "");
    expect(out.find(t => t.id === parent.id)?.external)
      .toEqual({ provider: "trello", id: "NEW_1", url: "https://trello.com/c/NEW_1" });
    expect(out.find(t => t.id === kid.id)?.external).toBeUndefined();
  });

  it("leaves a card home when its column has no list mapped, rather than guessing one", async () => {
    seed(project({ board: { provider: "trello", externalId: BOARD_ID, columns: { backlog: LISTS.backlog } } }));

    const out = await provider.save(PROJECT_ID, [root({ status: "done" })]);

    expect(mocked.addCard).not.toHaveBeenCalled();
    expect(out[0].external).toBeUndefined();
  });

  it("sends nothing at all for a card that did not change", async () => {
    const task = root({ title: "same", detail: "body", status: "working", external: { provider: "trello", id: "A" } });
    mocked.listCards.mockResolvedValue([
      card({ id: "A", name: "same", desc: "body", idList: LISTS.working }),
    ]);

    await provider.save(PROJECT_ID, [task]);

    expect(mocked.addCard).not.toHaveBeenCalled();
    expect(mocked.updateCard).not.toHaveBeenCalled();
  });

  it("sends only the fields that moved, the text and the list each on its own", async () => {
    mocked.listCards.mockResolvedValue([
      card({ id: "A", name: "old", desc: "", idList: LISTS.backlog }),
      card({ id: "B", name: "same", desc: "", idList: LISTS.backlog }),
    ]);

    await provider.save(PROJECT_ID, [
      root({ title: "new", status: "backlog", external: { provider: "trello", id: "A" } }),
      root({ title: "same", status: "ready", external: { provider: "trello", id: "B" } }),
    ]);

    expect(mocked.updateCard.mock.calls).toEqual([
      ["A", { name: "new" }],
      ["B", { idList: LISTS.ready }],
    ]);
  });

  it("never deletes on the other side what left our list", async () => {
    mocked.listCards.mockResolvedValue([card({ id: "A" }), card({ id: "GONE" })]);

    await provider.save(PROJECT_ID, [root({ external: { provider: "trello", id: "A" }, title: "Card" })]);

    expect(mocked.updateCard).not.toHaveBeenCalled();
    expect(mocked.addCard).not.toHaveBeenCalled();
  });

  it("does not reopen a card somebody archived or deleted over there", async () => {
    mocked.listCards.mockResolvedValue([]);

    const out = await provider.save(PROJECT_ID, [
      root({ title: "moved on", external: { provider: "trello", id: "A" } }),
    ]);

    expect(mocked.addCard).not.toHaveBeenCalled();
    expect(mocked.updateCard).not.toHaveBeenCalled();
    expect(out[0].external).toEqual({ provider: "trello", id: "A" });
  });

  it("keeps going when one operation fails, and answers with what it managed to do", async () => {
    mocked.listCards.mockResolvedValue([
      card({ id: "A", name: "old" }),
      card({ id: "B", name: "old" }),
    ]);
    mocked.updateCard.mockRejectedValueOnce(new TrelloBoardError("api", "nope"));

    const out = await provider.save(PROJECT_ID, [
      root({ title: "new a", external: { provider: "trello", id: "A" } }),
      root({ title: "new b", external: { provider: "trello", id: "B" } }),
    ]);

    expect(mocked.updateCard).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(2);
  });

  it("throws when every operation failed, so a dead board does not read as a clean save", async () => {
    mocked.listCards.mockResolvedValue([
      card({ id: "A", name: "old" }),
      card({ id: "B", name: "old" }),
    ]);
    mocked.updateCard.mockRejectedValue(new TrelloBoardError("network", "down"));

    await expect(provider.save(PROJECT_ID, [
      root({ title: "new a", external: { provider: "trello", id: "A" } }),
      root({ title: "new b", external: { provider: "trello", id: "B" } }),
    ])).rejects.toMatchObject({ kind: "network" });
  });
});

describe("watch", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  /** Runs the pending poll and lets the promises inside it settle. */
  async function tick() {
    await vi.advanceTimersByTimeAsync(30_000);
  }

  it("says nothing while the board reads the same as what is in memory", async () => {
    const mirrored = createTask({
      projectId: PROJECT_ID,
      id: "local-1",
      title: "Card",
      status: "backlog",
      external: { provider: "trello", id: "A" },
    });
    seed(project(), [mirrored]);
    mocked.listCards.mockResolvedValue([card({ id: "A", name: "Card" })]);

    const onChange = vi.fn();
    const stop = provider.watch!(PROJECT_ID, onChange);
    await tick();
    expect(onChange).not.toHaveBeenCalled();

    // Somebody moved the card on the other side.
    mocked.listCards.mockResolvedValue([card({ id: "A", name: "Card", idList: LISTS.done })]);
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ id: "local-1", status: "done" });

    stop();
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("leaves the local board alone when the remote one cannot be read", async () => {
    mocked.listCards.mockRejectedValue(new TrelloBoardError("network", "down"));

    const onChange = vi.fn();
    const stop = provider.watch!(PROJECT_ID, onChange);
    await expect(tick()).resolves.toBeUndefined();

    expect(onChange).not.toHaveBeenCalled();
    stop();
  });
});
