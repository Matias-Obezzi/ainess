import { describe, it, expect } from "vitest";
import {
  blockedBy,
  boardMarkdown,
  canStart,
  createTask,
  filterTasks,
  hasCycle,
  isFiltering,
  layoutTaskGraph,
  linkDependency,
  moveTask,
  removeTask,
  sortColumn,
  TASK_GAP_X,
  TASK_NODE_WIDTH,
  taskTitleFromText,
  tasksToAutoArchive,
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

describe("sortColumn priority", () => {
  it("puts the urgent ones first and keeps `order` between equals", () => {
    const tasks = [
      task("a", { status: "backlog", order: 0 }),
      task("b", { status: "backlog", order: 1, priority: "high" }),
      task("c", { status: "backlog", order: 2 }),
      task("d", { status: "backlog", order: 3, priority: "high" }),
    ];
    expect(column(tasks, "backlog")).toEqual(["b", "d", "a", "c"]);
  });

  it("leaves the low ones where they are", () => {
    const tasks = [
      task("a", { status: "backlog", order: 0, priority: "low" }),
      task("b", { status: "backlog", order: 1 }),
      task("c", { status: "backlog", order: 2, priority: "normal" }),
    ];
    expect(column(tasks, "backlog")).toEqual(["a", "b", "c"]);
  });

  it("drops a priority the file should never have held", () => {
    const t = createTask({ projectId: "p", title: "x", priority: "urgentisima" as never });
    expect(t.priority).toBeUndefined();
  });
});

const DAY = 24 * 60 * 60 * 1000;

describe("tasksToAutoArchive", () => {
  const now = 10 * DAY;
  const done = (id: string, ageDays: number, over: Partial<Task> = {}) =>
    task(id, { status: "done", updatedAt: now - ageDays * DAY, ...over });

  it("takes the done tasks nobody touched for long enough", () => {
    const tasks = [done("old", 8), done("fresh", 2)];
    expect(tasksToAutoArchive(tasks, 7, now).map(t => t.id)).toEqual(["old"]);
  });

  it("leaves a task that is exactly at the limit alone", () => {
    const tasks = [done("edge", 7), done("past", 7.5)];
    expect(tasksToAutoArchive(tasks, 7, now).map(t => t.id)).toEqual(["past"]);
  });

  it("only ever looks at the done column", () => {
    const tasks = [
      done("done", 30),
      task("backlog", { status: "backlog", updatedAt: now - 30 * DAY }),
      task("working", { status: "working", updatedAt: now - 30 * DAY }),
      task("ready", { status: "ready", updatedAt: now - 30 * DAY }),
    ];
    expect(tasksToAutoArchive(tasks, 7, now).map(t => t.id)).toEqual(["done"]);
  });

  it("skips what is already archived", () => {
    expect(tasksToAutoArchive([done("gone", 30, { archived: true })], 7, now)).toEqual([]);
  });

  it("does nothing when the setting is off", () => {
    const tasks = [done("old", 90)];
    expect(tasksToAutoArchive(tasks, null, now)).toEqual([]);
    expect(tasksToAutoArchive(tasks, undefined, now)).toEqual([]);
    expect(tasksToAutoArchive(tasks, 0, now)).toEqual([]);
    expect(tasksToAutoArchive(tasks, Number.NaN, now)).toEqual([]);
  });
});

describe("filterTasks", () => {
  const tasks = [
    task("a", { title: "Migración de la configuración", agentId: "ag1" }),
    task("b", { title: "Revisar el diff", detail: "Mirar la MIGRACIÓN de la config", agentId: "ag2" }),
    task("c", { title: "Escribir el changelog" }),
  ];

  it("shows everything when nothing is filtered", () => {
    expect(isFiltering({ query: "   ", agentId: null })).toBe(false);
    expect(filterTasks(tasks, { query: "", agentId: null })).toBe(tasks);
  });

  it("matches the title and the detail without accents or case", () => {
    expect(filterTasks(tasks, { query: "migracion", agentId: null }).map(t => t.id)).toEqual(["a", "b"]);
  });

  it("narrows by agent", () => {
    expect(filterTasks(tasks, { query: "", agentId: "ag2" }).map(t => t.id)).toEqual(["b"]);
    expect(filterTasks(tasks, { query: "migracion", agentId: "ag1" }).map(t => t.id)).toEqual(["a"]);
  });

  it("finds nothing when nothing matches", () => {
    expect(filterTasks(tasks, { query: "kubernetes", agentId: null })).toEqual([]);
  });
});

describe("taskTitleFromText", () => {
  it("takes the first meaningful line", () => {
    expect(taskTitleFromText("\n\n  ## Arreglar el login\ny algo mas")).toBe("Arreglar el login");
  });

  it("trims a long line to 80 characters", () => {
    const title = taskTitleFromText("x".repeat(200));
    expect(title).toHaveLength(80);
    expect(title.endsWith("\u2026")).toBe(true);
  });

  it("returns nothing for a message with no text", () => {
    expect(taskTitleFromText("   \n\n ")).toBe("");
  });
});

describe("boardMarkdown", () => {
  const labels = {
    status: (status: TaskStatus) => ({ backlog: "Pendiente", working: "Trabajando", done: "Hecho" } as Record<string, string>)[status] ?? status,
    agent: (id: string) => (id === "ag1" ? "Implementador" : undefined),
    blockedBy: "bloqueada por",
  };

  it("writes one section per column, ticking the done ones", () => {
    const tasks = [
      task("a", { title: "Migrar la configuración", status: "working", agentId: "ag1", branch: "ainess/implementador" }),
      task("b", { title: "Revisar el diff", status: "working", order: 1, dependsOn: ["a"] }),
      task("c", { title: "Escribir el changelog", status: "done" }),
    ];
    expect(boardMarkdown(tasks, labels)).toBe(
      [
        "## Trabajando",
        "- [ ] Migrar la configuración (Implementador) — ainess/implementador",
        "- [ ] Revisar el diff — bloqueada por: Migrar la configuración",
        "",
        "## Hecho",
        "- [x] Escribir el changelog",
      ].join("\n")
    );
  });

  it("skips the empty columns and the archive", () => {
    const tasks = [task("a", { title: "Vieja", status: "done", archived: true }), task("b", { title: "Nueva" })];
    expect(boardMarkdown(tasks, labels)).toBe("## Pendiente\n- [ ] Nueva");
  });

  it("writes nothing for an empty board", () => {
    expect(boardMarkdown([], labels)).toBe("");
  });

  it("says nothing about an agent it does not know", () => {
    const tasks = [task("a", { title: "Suelta", agentId: "ghost" })];
    expect(boardMarkdown(tasks, labels)).toBe("## Pendiente\n- [ ] Suelta");
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
