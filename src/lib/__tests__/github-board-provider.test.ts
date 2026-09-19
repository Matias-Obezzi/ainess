// The GitHub Projects board, with the client mocked out.
//
// The client has its own test (github-board-client.test.ts) and it is where pagination, tokens and
// HTTP belong. What is left here is everything the provider decides on its own, and every one of
// those decisions is a way the board can go wrong quietly: a board that is not configured answering
// with no cards, a poll that mints a new id for a card it already knows, a delegation card opened
// on somebody's public project, a card deleted on the other side because it left our list.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAppStore } from "@/store";
import { createTask } from "@/lib/tasks";
import type { Project, Task } from "@/types";

vi.mock("@/lib/board/github-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/board/github-client")>("@/lib/board/github-client");
  return {
    ...actual,
    resolveProject: vi.fn(),
    listItems: vi.fn(),
    addDraftItem: vi.fn(),
    updateDraftItem: vi.fn(),
    setItemStatus: vi.fn(),
    deleteItem: vi.fn(),
  };
});

import {
  GhBoardError,
  addDraftItem,
  deleteItem,
  listItems,
  resolveProject,
  setItemStatus,
  updateDraftItem,
  type GhItem,
} from "@/lib/board/github-client";
import { githubProjectsBoardProvider as provider } from "@/lib/board/github-projects";

const PROJECT_ID = "p1";

/** The option ids of the remote board, one per column of ours. */
const OPTIONS = {
  backlog: "opt-backlog",
  working: "opt-working",
  "needs-you": "opt-needs",
  "in-review": "opt-review",
  ready: "opt-ready",
  done: "opt-done",
};

const GH_PROJECT = { id: "PVT_1", title: "Roadmap", statusFieldId: "F_status", statusOptions: [] };

function item(over: Partial<GhItem> = {}): GhItem {
  return {
    id: "ITEM_1",
    draftId: "DRAFT_1",
    isDraft: true,
    title: "Card",
    body: "",
    statusOptionId: OPTIONS.backlog,
    updatedAt: 1000,
    url: undefined,
    isArchived: false,
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
    board: { provider: "github-projects", owner: "acme", number: 7, columns: OPTIONS },
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
  resolveProject: vi.mocked(resolveProject),
  listItems: vi.mocked(listItems),
  addDraftItem: vi.mocked(addDraftItem),
  updateDraftItem: vi.mocked(updateDraftItem),
  setItemStatus: vi.mocked(setItemStatus),
  deleteItem: vi.mocked(deleteItem),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.resolveProject.mockResolvedValue(GH_PROJECT);
  mocked.listItems.mockResolvedValue([]);
  mocked.addDraftItem.mockImplementation(async (_p, title, body) => item({ id: "NEW_1", draftId: "NEW_D1", title, body }));
  mocked.updateDraftItem.mockResolvedValue(undefined);
  mocked.setItemStatus.mockResolvedValue(undefined);
  seed(project());
});

describe("load", () => {
  it("refuses a board that is not configured instead of answering with an empty one", async () => {
    for (const board of [
      undefined,
      { provider: "github-projects" as const },
      { provider: "github-projects" as const, owner: "acme", columns: OPTIONS },
      { provider: "github-projects" as const, owner: "acme", number: 7 },
      { provider: "github-projects" as const, owner: "acme", number: 7, columns: {} },
    ]) {
      seed(project({ board }));
      await expect(provider.load(PROJECT_ID)).rejects.toMatchObject({ kind: "not-found" });
    }
    expect(mocked.listItems).not.toHaveBeenCalled();
  });

  it("maps every column back from the option ids the project was configured with", async () => {
    mocked.listItems.mockResolvedValue([
      item({ id: "A", statusOptionId: OPTIONS.working }),
      item({ id: "B", statusOptionId: OPTIONS["in-review"] }),
      item({ id: "C", statusOptionId: OPTIONS.done }),
    ]);

    const tasks = await provider.load(PROJECT_ID);

    expect(tasks.map(t => t.status)).toEqual(["working", "in-review", "done"]);
    expect(tasks.map(t => t.external?.id)).toEqual(["A", "B", "C"]);
    expect(mocked.listItems).toHaveBeenCalledWith(GH_PROJECT.id, GH_PROJECT.statusFieldId);
  });

  it("puts a card in the backlog when its option is one nobody mapped", async () => {
    mocked.listItems.mockResolvedValue([
      item({ id: "A", statusOptionId: "opt-somebody-added-this" }),
      item({ id: "B", statusOptionId: undefined }),
    ]);

    expect((await provider.load(PROJECT_ID)).map(t => t.status)).toEqual(["backlog", "backlog"]);
  });

  it("leaves archived cards off the board", async () => {
    mocked.listItems.mockResolvedValue([item({ id: "A" }), item({ id: "B", isArchived: true })]);

    expect((await provider.load(PROJECT_ID)).map(t => t.external?.id)).toEqual(["A"]);
  });

  // The one that matters most: `watch` polls every thirty seconds, so a fresh uuid per read would
  // fill the board with copies of the same card and orphan every run and dependency pointing at it.
  it("reuses the local id of a card it already mirrors instead of duplicating it", async () => {
    const known = createTask({
      projectId: PROJECT_ID,
      id: "local-1",
      title: "old title",
      external: { provider: "github-projects", id: "A" },
    });
    seed(project(), [known]);
    mocked.listItems.mockResolvedValue([item({ id: "A", title: "new title" }), item({ id: "B" })]);

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
    const parent = root({ id: "local-root" });
    const kid = child();

    const out = await provider.save(PROJECT_ID, [parent, kid]);

    expect(mocked.addDraftItem).toHaveBeenCalledTimes(1);
    expect(mocked.addDraftItem).toHaveBeenCalledWith(GH_PROJECT.id, "root", "");
    expect(out.find(t => t.id === parent.id)?.external).toEqual({ provider: "github-projects", id: "NEW_1", url: undefined });
    expect(out.find(t => t.id === kid.id)?.external).toBeUndefined();
  });

  it("sends nothing at all for a card that did not change", async () => {
    const task = root({ title: "same", detail: "body", status: "working", external: { provider: "github-projects", id: "A" } });
    mocked.listItems.mockResolvedValue([
      item({ id: "A", title: "same", body: "body", statusOptionId: OPTIONS.working }),
    ]);

    await provider.save(PROJECT_ID, [task]);

    expect(mocked.addDraftItem).not.toHaveBeenCalled();
    expect(mocked.updateDraftItem).not.toHaveBeenCalled();
    expect(mocked.setItemStatus).not.toHaveBeenCalled();
  });

  it("sends the text when it changed and the column when it moved, each on its own", async () => {
    mocked.listItems.mockResolvedValue([
      item({ id: "A", draftId: "DA", title: "old", body: "", statusOptionId: OPTIONS.backlog }),
      item({ id: "B", draftId: "DB", title: "same", body: "", statusOptionId: OPTIONS.backlog }),
    ]);

    await provider.save(PROJECT_ID, [
      root({ title: "new", status: "backlog", external: { provider: "github-projects", id: "A" } }),
      root({ title: "same", status: "ready", external: { provider: "github-projects", id: "B" } }),
    ]);

    expect(mocked.updateDraftItem.mock.calls).toEqual([["DA", "new", ""]]);
    expect(mocked.setItemStatus.mock.calls).toEqual([[GH_PROJECT.id, "B", "F_status", OPTIONS.ready]]);
  });

  it("never deletes on the other side what left our list", async () => {
    mocked.listItems.mockResolvedValue([item({ id: "A" }), item({ id: "GONE" })]);

    await provider.save(PROJECT_ID, [root({ external: { provider: "github-projects", id: "A" }, title: "Card" })]);

    expect(mocked.deleteItem).not.toHaveBeenCalled();
  });

  it("keeps going when one operation fails, and answers with what it managed to do", async () => {
    mocked.listItems.mockResolvedValue([
      item({ id: "A", draftId: "DA", title: "old" }),
      item({ id: "B", draftId: "DB", title: "old" }),
    ]);
    mocked.updateDraftItem.mockRejectedValueOnce(new GhBoardError("graphql", "nope"));

    const out = await provider.save(PROJECT_ID, [
      root({ title: "new a", external: { provider: "github-projects", id: "A" } }),
      root({ title: "new b", external: { provider: "github-projects", id: "B" } }),
    ]);

    expect(mocked.updateDraftItem).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(2);
  });

  it("throws when every operation failed, so a dead board does not read as a clean save", async () => {
    mocked.listItems.mockResolvedValue([
      item({ id: "A", draftId: "DA", title: "old" }),
      item({ id: "B", draftId: "DB", title: "old" }),
    ]);
    mocked.updateDraftItem.mockRejectedValue(new GhBoardError("network", "down"));

    await expect(provider.save(PROJECT_ID, [
      root({ title: "new a", external: { provider: "github-projects", id: "A" } }),
      root({ title: "new b", external: { provider: "github-projects", id: "B" } }),
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
      external: { provider: "github-projects", id: "A" },
    });
    seed(project(), [mirrored]);
    mocked.listItems.mockResolvedValue([item({ id: "A", title: "Card" })]);

    const onChange = vi.fn();
    const stop = provider.watch!(PROJECT_ID, onChange);
    await tick();
    expect(onChange).not.toHaveBeenCalled();

    // Somebody moved the card on the other side.
    mocked.listItems.mockResolvedValue([item({ id: "A", title: "Card", statusOptionId: OPTIONS.done })]);
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ id: "local-1", status: "done" });

    stop();
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("leaves the local board alone when the remote one cannot be read", async () => {
    mocked.listItems.mockRejectedValue(new GhBoardError("network", "down"));

    const onChange = vi.fn();
    const stop = provider.watch!(PROJECT_ID, onChange);
    await expect(tick()).resolves.toBeUndefined();

    expect(onChange).not.toHaveBeenCalled();
    stop();
  });
});
