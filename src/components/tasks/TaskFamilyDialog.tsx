// One task's dependency family, on its own screen.
//
// This used to be a second mode of the whole board. Every unrelated chain in the project was laid
// out beside every other one, so the graph grew wider than the window and the thing you actually
// wanted to see — what this task waits for, and what waits for it — was somewhere in the middle of
// it. Asked from a task instead, there is nothing on screen that is not about that task.
import { useEffect, useState } from "react";
import { useAppStore, selectTasks } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TaskGraph } from "./TaskGraph";
import { taskFamily } from "@/lib/tasks";
import { plural } from "@/i18n";
import { useT } from "@/i18n/useT";

export function TaskFamilyDialog({ projectId, taskId, open, onOpenChange }: {
  projectId: string;
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const tasks = useAppStore(state => selectTasks(state, projectId));

  // Clicking a node re-roots the graph on it rather than opening its detail: this dialog was
  // itself opened from a detail, and a detail on top of a graph on top of a detail is a stack
  // nobody can get out of. Following the chain one step at a time is also the thing you came to do.
  const [focus, setFocus] = useState<string | null>(taskId);
  useEffect(() => {
    if (open) setFocus(taskId);
  }, [open, taskId]);

  const focused = tasks.find(task => task.id === focus);
  const family = focus ? taskFamily(tasks, focus) : [];
  // Itself does not count as company: "1 related task" when there are none is worse than silence.
  const relatives = Math.max(0, family.length - 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-h-[80vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate">{focused?.title ?? t("tasks.family.title")}</DialogTitle>
          <DialogDescription>
            {relatives === 0
              ? t("tasks.family.alone")
              : plural(relatives, t("tasks.family.count.one", { n: relatives }), t("tasks.family.count.other", { n: relatives }))}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
          {focus && (
            <TaskGraph
              key={focus}
              projectId={projectId}
              focusTaskId={focus}
              onOpenTask={setFocus}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
