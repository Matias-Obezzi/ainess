// Dropping a card on the phone board. The gesture is pointers and pixels; this is the rule it
// ends in — which column the card lands in, and where.
import { describe, it, expect } from "vitest";
import { dropDecision } from "@/remote/task-drop";
import { createTask } from "@/lib/tasks";
import type { Task, TaskStatus } from "@/types";

const task = (over: Partial<Task>): Task => createTask({ projectId: "p1", ...over });

const backlog = [task({ id: "a", title: "A", status: "backlog" }), task({ id: "b", title: "B", status: "backlog" })];
const working = [task({ id: "c", title: "C", status: "working" })];
const columns: Partial<Record<TaskStatus, Task[]>> = { backlog, working };

describe("dropDecision", () => {
  it("moves a card to the end of the column whose chip it was dropped on", () => {
    expect(dropDecision(backlog[0], "status:working", columns)).toEqual({ status: "working", index: 1 });
  });

  it("takes the place of the card it was dropped on, inside its own column", () => {
    expect(dropDecision(backlog[1], "task:a", columns)).toEqual({ status: "backlog", index: 0 });
  });

  it("does nothing when it lands where it already is", () => {
    expect(dropDecision(backlog[0], "status:backlog", columns)).toBeNull();
    expect(dropDecision(backlog[0], "task:a", columns)).toBeNull();
  });

  it("does nothing when it is let go over the board and not over anything", () => {
    expect(dropDecision(backlog[0], null, columns)).toBeNull();
    expect(dropDecision(backlog[0], "something-else", columns)).toBeNull();
  });

  // The column the card is in may not even be loaded (a chip of an empty one).
  it("survives a column it knows nothing about", () => {
    expect(dropDecision(backlog[0], "status:done", {})).toEqual({ status: "done", index: 0 });
    expect(dropDecision(backlog[0], "task:missing", columns)).toBeNull();
  });
});
