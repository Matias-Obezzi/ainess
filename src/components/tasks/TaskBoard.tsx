// The kanban board: one column per status, cards dragged with the native HTML5 events, and the
// archived tasks folded away at the bottom. Every derived list is memoized, so a board with a
// couple of hundred cards does not recompute anything while the user drags one around.
import { useCallback, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useAppStore, selectTasks } from "@/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { blockedBy, sortColumn, TASK_STATUSES } from "@/lib/tasks";
import { TaskCard, TaskContextMenu } from "./TaskCard";
import { taskStatusMeta } from "./task-meta";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types";
import { ChevronDown, ChevronRight, ListTodo } from "lucide-react";
import { useT } from "@/i18n/useT";

interface DropTarget {
  status: TaskStatus;
  /** Position inside the column, counting the cards as they are drawn right now. */
  index: number;
}

export function TaskBoard({ projectId, onOpenTask, onNewTask }: { projectId: string; onOpenTask(id: string): void; onNewTask(status?: TaskStatus): void }) {
  const t = useT();
  const tasks = useAppStore(state => selectTasks(state, projectId));
  const moveTask = useAppStore(state => state.moveTask);

  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<DropTarget | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const columns = useMemo(
    () => TASK_STATUSES.map(status => ({ status, items: sortColumn(tasks, status) })),
    [tasks]
  );
  const archived = useMemo(
    () => tasks.filter(t => t.archived).sort((a, b) => b.updatedAt - a.updatedAt),
    [tasks]
  );
  // One pass for the whole board instead of one `blockedBy` per card on every render.
  const blocked = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      if (task.dependsOn.length > 0) map.set(task.id, blockedBy(task, tasks).length);
    }
    return map;
  }, [tasks]);

  const onDragStart = useCallback((e: DragEvent<HTMLElement>, task: Task) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
    setDragId(task.id);
  }, []);

  const onDragEnd = useCallback(() => {
    setDragId(null);
    setOver(null);
  }, []);

  /** Over a card: the insertion point is before or after it, depending on which half we are on. */
  const onCardDragOver = useCallback((e: DragEvent<HTMLElement>, task: Task) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    const items = sortColumn(tasks, task.status);
    const index = items.findIndex(t => t.id === task.id) + (after ? 1 : 0);
    setOver(prev => (prev?.status === task.status && prev.index === index ? prev : { status: task.status, index }));
  }, [dragId, tasks]);

  /** Over the empty part of a column: drop at the end. */
  const onColumnDragOver = useCallback((e: DragEvent<HTMLElement>, status: TaskStatus, count: number) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOver(prev => (prev?.status === status && prev.index === count ? prev : { status, index: count }));
  }, [dragId]);

  const onDrop = useCallback((e: DragEvent<HTMLElement>, status: TaskStatus, count: number) => {
    e.preventDefault();
    const id = dragId ?? e.dataTransfer.getData("text/plain");
    setDragId(null);
    setOver(null);
    if (!id) return;
    const target = over && over.status === status ? over.index : count;
    // The drawn index counts the dragged card itself, so moving it down its own column would
    // otherwise land one slot too far.
    const items = sortColumn(tasks, status);
    const current = items.findIndex(t => t.id === id);
    moveTask(id, status, current >= 0 && target > current ? target - 1 : target);
  }, [dragId, over, tasks, moveTask]);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ListTodo}
        title={t("tasks.empty.title")}
        description={t("tasks.empty.body")}
        action={{ label: t("tasks.new"), onClick: () => onNewTask() }}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {columns.map(({ status, items }) => {
          const meta = taskStatusMeta[status];
          return (
            <section
              key={status}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/30"
              onDragOver={e => onColumnDragOver(e, status, items.length)}
              onDrop={e => onDrop(e, status, items.length)}
            >
              <header className="flex items-center gap-2 px-3 py-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                <h3 className="truncate text-xs font-semibold uppercase tracking-wide">{t(meta.labelKey)}</h3>
                <Badge variant="outline" className="ml-auto text-[10px]">{items.length}</Badge>
              </header>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
                {items.map((task, i) => (
                  <div key={task.id}>
                    {over?.status === status && over.index === i && <DropLine />}
                    <TaskCard
                      task={task}
                      blocked={blocked.get(task.id) ?? 0}
                      dragging={dragId === task.id}
                      onOpen={onOpenTask}
                      onDragStart={onDragStart}
                      onDragOver={onCardDragOver}
                      onDragEnd={onDragEnd}
                    />
                  </div>
                ))}
                {over?.status === status && over.index >= items.length && <DropLine />}
                {items.length === 0 && !over && (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-dashed border-border py-4 text-xs text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
                    onClick={() => onNewTask(status)}
                  >
                    {t("tasks.addOne")}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div className="shrink-0 border-t border-border">
          <Button variant="ghost" size="sm" className="h-8 w-full justify-start rounded-none px-3" onClick={() => setArchiveOpen(o => !o)}>
            {archiveOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {t("tasks.archive")}
            <Badge variant="outline" className="ml-1 text-[10px]">{archived.length}</Badge>
          </Button>
          {archiveOpen && (
            <div className="max-h-40 space-y-1 overflow-y-auto px-3 pb-3">
              {archived.map(task => (
                <TaskContextMenu key={task.id} task={task}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={() => onOpenTask(task.id)}
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", taskStatusMeta[task.status].dot)} />
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    <span className="shrink-0">{t(taskStatusMeta[task.status].labelKey)}</span>
                  </button>
                </TaskContextMenu>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Where the card would land. */
function DropLine() {
  return <div className="mb-2 h-0.5 rounded-full bg-primary" />;
}
