// Tests for B-13: priority selector in NewTaskDialog.
// Verifies the rule: creating with "normal" omits the priority field, while "high"/"low" write it.
import { describe, it, expect } from "vitest";
import { createTask, storedPriority } from "@/lib/tasks";

/** What NewTaskDialog passes to createTask for a given picked priority. */
const buildTaskPartial = (priority: Parameters<typeof storedPriority>[0]) => ({
  title: "Test task",
  status: "backlog" as const,
  priority: storedPriority(priority),
});

describe("NewTaskDialog priority (B-13)", () => {
  it('creating with "normal" does not write the priority field', () => {
    const partial = buildTaskPartial("normal");
    expect(partial.priority).toBeUndefined();
    const task = createTask({ ...partial, projectId: "p1" });
    // createTask also omits undefined priority
    expect(task.priority).toBeUndefined();
  });

  it('creating with "high" writes priority: "high"', () => {
    const partial = buildTaskPartial("high");
    expect(partial.priority).toBe("high");
    const task = createTask({ ...partial, projectId: "p1" });
    expect(task.priority).toBe("high");
  });

  it('creating with "low" writes priority: "low"', () => {
    const partial = buildTaskPartial("low");
    expect(partial.priority).toBe("low");
    const task = createTask({ ...partial, projectId: "p1" });
    expect(task.priority).toBe("low");
  });

  it('a task without priority is treated as "normal" by the board', () => {
    const task = createTask({ title: "t", projectId: "p1", status: "backlog" });
    // The board reads task.priority ?? "normal", so undefined is "normal".
    expect(task.priority ?? "normal").toBe("normal");
  });
});
