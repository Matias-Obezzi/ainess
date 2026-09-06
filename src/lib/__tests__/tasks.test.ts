import { describe, it, expect } from "vitest";
import {
  blockedBy,
  canStart,
  createTask,
  hasCycle,
  layoutTaskGraph,
  linkDependency,
  moveTask,
  removeTask,
  sortColumn,
  TASK_GAP_X,
  TASK_NODE_WIDTH,
  unlinkDependency,
} from "@/lib/tasks";
import type { Task, TaskStatus } from "@/types";

const task = (id: string, over: Partial<Task> = {}): Task =>
  createTask({ id, projectId: "p", title: id, ...over });

/** Ids of one column, in board order. */
const column = (tasks: Task[], status: TaskStatus) => sortColumn(tasks, status).map(t => t.id);

describe("createTask", () => {
  it("fills sane defaults", () => {
    const t = createTask({ projectId: "p", title: "Arreglar el login" });
    expect(t.status).toBe("backlog");
    expect(t.dependsOn).toEqual([]);
    expect(t.archived).toBe(false);
    expect(t.id).toBeTruthy();
    expect(t.createdAt).toBeGreaterThan(0);
  });

  it("falls back to a placeholder title", () => {
    expect(createTask({ projectId: "p", title: "   " }).title).toBe("Tarea sin título");
  });
});

describe("sortColumn", () => {
  it("keeps only the live tasks of one column, by order", () => {
    const tasks = [
      task("a", { status: "backlog", order: 2 }),
      task("b", { status: "backlog", order: 0 }),
      task("c", { status: "working", order: 0 }),
      task("d", { status: "backlog", order: 1, archived: true }),
    ];
    expect(column(tasks, "backlog")).toEqual(["b", "a"]);
    expect(column(tasks, "working")).toEqual(["c"]);
  });
});

describe("moveTask", () => {
  it("moves a task to another column and renumbers both", () => {
    const tasks = [
      task("a", { status: "backlog", order: 0 }),
      task("b", { status: "backlog", order: 1 }),
      task("c", { status: "backlog", order: 2 }),
      task("x", { status: "working", order: 0 }),
    ];
    const next = moveTask(tasks, "b", "working", 0);
    expect(column(next, "working")).toEqual(["b", "x"]);
    expect(column(next, "backlog")).toEqual(["a", "c"]);
    expect(next.map(t => t.order).every(o => o >= 0)).toBe(true);
    const working = sortColumn(next, "working");
    expect(working.map(t => t.order)).toEqual([0, 1]);
    expect(sortColumn(next, "backlog").map(t => t.order)).toEqual([0, 1]);
  });

  it("reorders inside the same column", () => {
    const tasks = [
      task("a", { status: "backlog", order: 0 }),
      task("b", { status: "backlog", order: 1 }),
      task("c", { status: "backlog", order: 2 }),
    ];
    expect(column(moveTask(tasks, "a", "backlog", 2), "backlog")).toEqual(["b", "c", "a"]);
    expect(column(moveTask(tasks, "c", "backlog", 0), "backlog")).toEqual(["c", "a", "b"]);
  });

  it("clamps an index past the end and un-archives what it moves", () => {
    const tasks = [task("a", { status: "backlog", order: 0 }), task("b", { status: "done", archived: true })];
    const next = moveTask(tasks, "b", "backlog", 99);
    expect(column(next, "backlog")).toEqual(["a", "b"]);
    expect(next.find(t => t.id === "b")?.archived).toBe(false);
  });

  it("does nothing for an unknown id", () => {
    const tasks = [task("a")];
    expect(moveTask(tasks, "ghost", "done", 0)).toBe(tasks);
  });
});

describe("canStart / blockedBy", () => {
  const base = [
    task("dep-open", { status: "working" }),
    task("dep-ready", { status: "ready" }),
    task("dep-done", { status: "done" }),
  ];

  it("is startable with no dependencies", () => {
    const t = task("t");
    expect(canStart(t, [...base, t])).toBe(true);
    expect(blockedBy(t, base)).toEqual([]);
  });

  it("is blocked while a dependency has not finished", () => {
    const t = task("t", { dependsOn: ["dep-open", "dep-ready"] });
    expect(canStart(t, [...base, t])).toBe(false);
    expect(blockedBy(t, base).map(d => d.id)).toEqual(["dep-open"]);
  });

  it("counts ready and done as finished", () => {
    const t = task("t", { dependsOn: ["dep-ready", "dep-done"] });
    expect(canStart(t, [...base, t])).toBe(true);
  });

  it("ignores dependencies on tasks that no longer exist", () => {
    const t = task("t", { dependsOn: ["ghost"] });
    expect(canStart(t, [t])).toBe(true);
  });
});

describe("hasCycle", () => {
  it("rejects a task depending on itself", () => {
    expect(hasCycle([task("a")], "a", "a")).toBe(true);
  });

  it("rejects a direct loop", () => {
    const tasks = [task("a", { dependsOn: ["b"] }), task("b")];
    expect(hasCycle(tasks, "b", "a")).toBe(true);
  });

  it("rejects an indirect loop", () => {
    const tasks = [task("a", { dependsOn: ["b"] }), task("b", { dependsOn: ["c"] }), task("c")];
    expect(hasCycle(tasks, "c", "a")).toBe(true);
  });

  it("allows a diamond", () => {
    const tasks = [task("a"), task("b", { dependsOn: ["a"] }), task("c", { dependsOn: ["a"] }), task("d")];
    expect(hasCycle(tasks, "d", "b")).toBe(false);
    expect(hasCycle(tasks, "d", "c")).toBe(false);
  });
});

describe("linkDependency / unlinkDependency", () => {
  it("links a dependency once", () => {
    const tasks = [task("a"), task("b")];
    const linked = linkDependency(tasks, "a", "b");
    expect(linked.find(t => t.id === "a")?.dependsOn).toEqual(["b"]);
    expect(linkDependency(linked, "a", "b")).toBe(linked);
  });

  it("refuses a circular dependency", () => {
    const tasks = [task("a", { dependsOn: ["b"] }), task("b")];
    expect(linkDependency(tasks, "b", "a")).toBe(tasks);
  });

  it("unlinks", () => {
    const tasks = [task("a", { dependsOn: ["b"] }), task("b")];
    expect(unlinkDependency(tasks, "a", "b").find(t => t.id === "a")?.dependsOn).toEqual([]);
  });
});

describe("removeTask", () => {
  it("drops the task and every reference to it", () => {
    const tasks = [task("a"), task("b", { dependsOn: ["a", "c"] }), task("c")];
    const next = removeTask(tasks, "a");
    expect(next.map(t => t.id)).toEqual(["b", "c"]);
    expect(next[0].dependsOn).toEqual(["c"]);
  });
});

describe("layoutTaskGraph", () => {
  it("puts tasks without dependencies on the first row", () => {
    const pos = layoutTaskGraph([task("a"), task("b")]);
    expect(pos.a.y).toBe(0);
    expect(pos.b.y).toBe(0);
    expect(Math.abs(pos.b.x - pos.a.x)).toBeCloseTo(TASK_NODE_WIDTH + TASK_GAP_X);
  });

  it("puts a task one row below the deepest of its dependencies", () => {
    const tasks = [task("a"), task("b", { dependsOn: ["a"] }), task("c", { dependsOn: ["a", "b"] })];
    const pos = layoutTaskGraph(tasks);
    expect(pos.a.y).toBe(0);
    expect(pos.b.y).toBeGreaterThan(pos.a.y);
    expect(pos.c.y).toBeGreaterThan(pos.b.y);
    expect(pos.c.y - pos.b.y).toBeCloseTo(pos.b.y - pos.a.y);
  });

  it("centers every row around x = 0", () => {
    const tasks = [task("a"), task("b"), task("c", { dependsOn: ["a"] })];
    const pos = layoutTaskGraph(tasks);
    // `x` is the left edge of a node, so the middle of a row is half a node further right.
    const half = TASK_NODE_WIDTH / 2;
    expect((pos.a.x + pos.b.x) / 2 + half).toBeCloseTo(0);
    expect(pos.c.x + half).toBeCloseTo(0);
  });

  it("ignores dependencies on missing tasks", () => {
    const pos = layoutTaskGraph([task("a", { dependsOn: ["ghost"] })]);
    expect(pos.a.y).toBe(0);
  });

  it("lays out a cycle instead of looping forever", () => {
    const pos = layoutTaskGraph([task("a", { dependsOn: ["b"] }), task("b", { dependsOn: ["a"] })]);
    expect(Object.keys(pos).sort()).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty board", () => {
    expect(layoutTaskGraph([])).toEqual({});
  });
});
