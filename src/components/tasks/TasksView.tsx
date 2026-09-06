// The Tareas mode of a project: its own little toolbar (board or graph, plus "Nueva tarea") and
// whichever of the two views is selected. Both open the same detail dialog.
import { useEffect, useState } from "react";
import { useAppStore, selectTasks } from "@/store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskBoard } from "./TaskBoard";
import { TaskGraph } from "./TaskGraph";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { NewTaskDialog } from "./NewTaskDialog";
import type { TaskStatus } from "@/types";
import { Columns3, Network, Plus } from "lucide-react";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";

export function TasksView({ projectId }: { projectId: string }) {
  const t = useT();
  const taskView = useAppStore(state => state.taskView);
  const setTaskView = useAppStore(state => state.setTaskView);
  const loaded = useAppStore(state => state.loaded);
  const tasks = useAppStore(state => selectTasks(state, projectId));
  const focusedTaskId = useAppStore(state => state.focusedTaskId);
  const focusTask = useAppStore(state => state.focusTask);

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // The search palette asks for one task's detail from outside the board; consume the request
  // right away so closing the dialog does not immediately reopen it.
  useEffect(() => {
    if (!focusedTaskId) return;
    setOpenTaskId(focusedTaskId);
    focusTask(null);
  }, [focusedTaskId, focusTask]);
  const [newOpen, setNewOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<TaskStatus | undefined>(undefined);

  const openNew = (status?: TaskStatus) => {
    setNewStatus(status);
    setNewOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 py-2">
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button
            variant={taskView === "board" ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            onClick={() => setTaskView("board")}
          >
            <Columns3 className="h-3.5 w-3.5" /> {t("tasks.board")}
          </Button>
          <Button
            variant={taskView === "graph" ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            onClick={() => setTaskView("graph")}
          >
            <Network className="h-3.5 w-3.5" /> {t("tasks.graph")}
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {plural(tasks.length, t("tasks.count.one", { n: tasks.length }), t("tasks.count.other", { n: tasks.length }))}
        </span>
        <Button size="sm" className="ml-auto h-7" onClick={() => openNew()}>
          <Plus className="h-3.5 w-3.5" /> {t("tasks.new")}
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {!loaded ? (
          <div className="flex gap-3 p-3">
            {[0, 1, 2].map(i => (
              <Skeleton key={i} className="h-40 w-72 shrink-0" />
            ))}
          </div>
        ) : taskView === "graph" ? (
          <TaskGraph projectId={projectId} onOpenTask={setOpenTaskId} onNewTask={() => openNew()} />
        ) : (
          <TaskBoard projectId={projectId} onOpenTask={setOpenTaskId} onNewTask={openNew} />
        )}
      </div>

      <TaskDetailDialog projectId={projectId} taskId={openTaskId} onOpenChange={open => !open && setOpenTaskId(null)} />
      <NewTaskDialog projectId={projectId} open={newOpen} status={newStatus} onOpenChange={setNewOpen} />
    </div>
  );
}
