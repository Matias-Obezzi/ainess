// The kanban board: one column per status, cards moved by pointer or keyboard (`ui/kanban`), and
// the archived tasks folded away at the bottom. Every derived list is memoized, so a board with a
// couple of hundred cards does not recompute anything while the user drags one around.
import { useCallback, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { Kanban, KanbanCard, KanbanColumn } from "@/components/ui/kanban";
import { useAppStore, selectProject, selectTasks } from "@/store";
import { repoDirOf } from "@/lib/repo-dir";
import type { GitCommit } from "@/lib/git";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { blockedBy, EMPTY_TASK_FILTER, filterTasks, isFiltering, sortColumn, taskCommit, taskCost, TASK_STATUSES, type TaskFilter } from "@/lib/tasks";
import { formatTaskCost } from "@/lib/usage";
import { TaskCard, TaskContextMenu } from "./TaskCard";
import { taskStatusMeta } from "./task-meta";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/types";
import { ChevronDown, ChevronRight, ListTodo } from "lucide-react";
import { useLocale, useT } from "@/i18n/useT";

export function TaskBoard({
  projectId,
  filter = EMPTY_TASK_FILTER,
  onOpenTask,
  onNewTask,
}: {
  projectId: string;
  /** What the board bar is filtering by; it only hides cards, it never touches them. */
  filter?: TaskFilter;
  onOpenTask(id: string): void;
  onNewTask(status?: TaskStatus): void;
}) {
  const t = useT();
  const locale = useLocale();
  const tasks = useAppStore(state => selectTasks(state, projectId));
  const runs = useAppStore(state => state.runs);
  const moveTask = useAppStore(state => state.moveTask);
  const repoCommits = useAppStore(state => state.repoState[projectId]?.commits);
  const repoDir = useAppStore(state => {
    const project = selectProject(state, projectId);
    return project ? repoDirOf(project) : "";
  });

  const [archiveOpen, setArchiveOpen] = useState(false);

  const filtering = isFiltering(filter);
  const visible = useMemo(() => filterTasks(tasks, filter), [tasks, filter]);
  // `total` is the whole column, so a filtered header can say "3 / 12" instead of just "3".
  const columns = useMemo(
    () => TASK_STATUSES.map(status => ({
      status,
      items: sortColumn(visible, status),
      total: sortColumn(tasks, status).length,
    })),
    [tasks, visible]
  );
  const archived = useMemo(
    () => visible.filter(t => t.archived).sort((a, b) => b.updatedAt - a.updatedAt),
    [visible]
  );
  // One pass for the whole board instead of one `blockedBy` per card on every render.
  const blocked = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      if (task.dependsOn.length > 0) map.set(task.id, blockedBy(task, tasks).length);
    }
    return map;
  }, [tasks]);
  // Same idea for what each card cost: one pass here instead of walking the family per card. The
  // line is handed down already written, so a card whose figures did not move stays memoized
  // while its neighbour's run streams.
  const costs = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      const line = formatTaskCost(taskCost(tasks, runs, task.id), locale);
      if (line) map.set(task.id, line);
    }
    return map;
  }, [tasks, runs, locale]);
  // And what got committed after each card's run started. The log behind this was read once for
  // the whole project — when it opened and on every change the repo watcher saw — so this pass is
  // an array walk, not twenty git processes. See `taskCommit`.
  const commits = useMemo(() => {
    const map = new Map<string, GitCommit>();
    if (!repoCommits) return map;
    for (const task of tasks) {
      const commit = taskCommit(task, runs, repoCommits, repoDir);
      if (commit) map.set(task.id, commit);
    }
    return map;
  }, [tasks, runs, repoCommits, repoDir]);

  // What the board shows, as the kanban wants it: each column's visible cards, in order.
  const groups = useMemo(
    () => Object.fromEntries(columns.map(c => [c.status, c.items.map(task => task.id)])) as Record<string, string[]>,
    [columns],
  );
  const byId = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);

  /**
   * A card dropped somewhere new. The kanban counts the cards it draws, and with a filter on that is
   * not the whole column: the card lands before the visible one now after it, counted over the whole
   * column without the card itself — which is what `moveTask` takes.
   */
  const onMove = useCallback((next: Record<string, string[]>, change: { id: string; to: { containerId: string; index: number } }) => {
    const status = change.to.containerId as TaskStatus;
    const after = next[status]?.[change.to.index + 1];
    const column = sortColumn(tasks, status).filter(task => task.id !== change.id);
    const index = after ? column.findIndex(task => task.id === after) : column.length;
    moveTask(change.id, status, index < 0 ? column.length : index);
  }, [tasks, moveTask]);

  // Enter opens the card the keyboard is on. Space is the kanban's: it picks the card up.
  const onCardKey = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter") return;
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-task-id]");
    if (!card || card.hasAttribute("data-dragging")) return;
    e.preventDefault();
    onOpenTask(card.dataset.taskId!);
  }, [onOpenTask]);

  const renderCard = (task: Task) => (
    <TaskCard
      task={task}
      blocked={blocked.get(task.id) ?? 0}
      cost={costs.get(task.id)}
      commit={commits.get(task.id)}
    />
  );

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
      <Kanban
        groups={groups}
        order={TASK_STATUSES}
        onChange={onMove}
        className="min-h-0 flex-1 items-stretch gap-3 p-3"
        // The card alone follows the pointer, not its column.
        overlay={id => {
          const task = byId.get(id);
          return task ? <div className="w-72">{renderCard(task)}</div> : null;
        }}
      >
        {(status, ids) => {
          const meta = taskStatusMeta[status as TaskStatus];
          const column = columns.find(c => c.status === status)!;
          return (
            <section key={status} className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/30">
              <header className="flex items-center gap-2 px-3 py-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                <h3 className="truncate text-xs font-semibold uppercase tracking-wide">{t(meta.labelKey)}</h3>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {filtering ? `${column.items.length} / ${column.total}` : column.total}
                </Badge>
              </header>

              <KanbanColumn
                id={status}
                data-column-scroll
                aria-label={t(meta.labelKey)}
                onKeyDown={onCardKey}
                className="min-h-0 w-auto flex-1 gap-0 overflow-y-auto rounded-none border-0 bg-transparent px-2 pt-0 pb-3 data-[over]:bg-accent/40"
              >
                {ids.map(id => {
                  const task = byId.get(id);
                  if (!task) return null;
                  return (
                    <KanbanCard
                      key={id}
                      id={id}
                      data-task-id={id}
                      aria-label={task.title}
                      // Here and not on the card inside: the drag holds the pointer, so the click
                      // that follows a press lands on this element.
                      onClick={() => onOpenTask(id)}
                      className="block rounded-lg border-0 bg-transparent p-0 shadow-none"
                    >
                      {renderCard(task)}
                    </KanbanCard>
                  );
                })}
                {ids.length === 0 && (filtering ? (
                  <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                    {t("tasks.noMatches")}
                  </p>
                ) : (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-dashed border-border py-4 text-xs text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
                    onClick={() => onNewTask(status as TaskStatus)}
                  >
                    {t("tasks.addOne")}
                  </button>
                ))}
              </KanbanColumn>
            </section>
          );
        }}
      </Kanban>

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
