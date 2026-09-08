// What dropping a card somewhere means. Kept out of the component because it is the part worth
// testing: the gesture is pointers and pixels, this is the rule.
import type { Task, TaskStatus } from "@/types";

export interface Drop {
  status: TaskStatus;
  /** Where in that column it lands. */
  index: number;
}

/**
 * `over` is the `data-drop` of whatever was under the finger: `status:<column>` for a chip,
 * `task:<id>` for another card. Nothing, itself, or a chip it already sits in means no move.
 */
export function dropDecision(
  task: Task,
  over: string | null,
  columns: Partial<Record<TaskStatus, Task[]>>,
): Drop | null {
  if (!over) return null;

  if (over.startsWith("status:")) {
    const status = over.slice("status:".length) as TaskStatus;
    if (status === task.status) return null;
    return { status, index: (columns[status] ?? []).length };
  }

  if (over.startsWith("task:")) {
    const targetId = over.slice("task:".length);
    if (targetId === task.id) return null;
    const list = columns[task.status] ?? [];
    const index = list.findIndex(t => t.id === targetId);
    if (index < 0) return null;
    return { status: task.status, index };
  }

  return null;
}
