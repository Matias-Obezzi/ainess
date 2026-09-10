// The set of tasks worth showing when you ask "what is this one tangled up with?".
//
// What this pins is the exclusion, not the inclusion: a task that happens to share a prerequisite
// is a sibling, and siblings are what made the whole-board graph unreadable. The traversal has to
// walk up and down separately — stepping down from an ancestor is exactly how they get back in.
import { describe, it, expect } from "vitest";
import { taskFamily } from "@/lib/tasks";
import type { Task } from "@/types";

const task = (id: string, dependsOn: string[] = []): Task => ({
  id,
  projectId: "p1",
  title: id,
  status: "backlog",
  dependsOn,
  order: 0,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
});

const ids = (tasks: Task[]) => tasks.map(t => t.id).sort();

describe("taskFamily", () => {
  it("walks up through everything the task waits for", () => {
    const tasks = [task("a"), task("b", ["a"]), task("c", ["b"])];
    expect(ids(taskFamily(tasks, "c"))).toEqual(["a", "b", "c"]);
  });

  it("walks down through everything that waits for the task", () => {
    const tasks = [task("a"), task("b", ["a"]), task("c", ["b"])];
    expect(ids(taskFamily(tasks, "a"))).toEqual(["a", "b", "c"]);
  });

  it("leaves out a sibling that only shares a prerequisite", () => {
    // Both b and sib depend on a. Asking about b must not drag sib in: it neither blocks b nor
    // waits on it. This is the case the whole function exists for.
    const tasks = [task("a"), task("b", ["a"]), task("sib", ["a"])];
    expect(ids(taskFamily(tasks, "b"))).toEqual(["a", "b"]);
  });

  it("leaves out a whole unrelated chain", () => {
    const tasks = [task("a"), task("b", ["a"]), task("x"), task("y", ["x"])];
    expect(ids(taskFamily(tasks, "a"))).toEqual(["a", "b"]);
  });

  it("keeps a task that is both above and below by different paths", () => {
    // a -> b -> d and a -> c -> d: d is family of a twice over, and appears once.
    const tasks = [task("a"), task("b", ["a"]), task("c", ["a"]), task("d", ["b", "c"])];
    expect(ids(taskFamily(tasks, "d"))).toEqual(["a", "b", "c", "d"]);
  });

  it("a task with no ties is its own family", () => {
    const tasks = [task("a"), task("b")];
    expect(ids(taskFamily(tasks, "a"))).toEqual(["a"]);
  });

  it("ignores a dependency on a task that is not there", () => {
    const tasks = [task("b", ["gone"])];
    expect(ids(taskFamily(tasks, "b"))).toEqual(["b"]);
  });

  it("returns nothing for a task that is not in the list", () => {
    expect(taskFamily([task("a")], "nope")).toEqual([]);
  });

  it("keeps the order the tasks came in", () => {
    const tasks = [task("c", ["b"]), task("a"), task("b", ["a"])];
    expect(taskFamily(tasks, "b").map(t => t.id)).toEqual(["c", "a", "b"]);
  });
});
