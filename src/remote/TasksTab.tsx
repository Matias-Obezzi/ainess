import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore, selectTasks, selectAgent } from "@/store";
import { TASK_STATUSES, blockedBy } from "@/lib/tasks";
import { taskStatusMeta } from "@/components/tasks/task-meta";
import { AgentAvatar } from "@/components/ProviderLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Markdown } from "@/components/shell/Markdown";
import { formatTimeAgo } from "@/lib/format";
import { useLocale } from "@/i18n/useT";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/utils";
import { ChevronLeft, ListTodo, Plus } from "lucide-react";
import type { Task, TaskStatus } from "@/types";

/**
 * The board, in one column. A phone has no room for six columns side by side, so the columns
 * become a row of chips and the cards below belong to the chosen one. Tapping a card opens its
 * detail, where it can be moved: the move travels to the PC and comes back in the next snapshot.
 */
export function TasksTab({ projectId }: { projectId: string }) {
  const t = useT();
  const tasks = useAppStore(state => selectTasks(state, projectId));
  const [status, setStatus] = useState<TaskStatus>("working");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const live = useMemo(() => tasks.filter(task => !task.archived), [tasks]);
  const byStatus = useMemo(() => {
    const out = {} as Record<TaskStatus, Task[]>;
    for (const s of TASK_STATUSES) out[s] = live.filter(task => task.status === s).sort((a, b) => a.order - b.order);
    return out;
  }, [live]);

  const open = openId ? live.find(task => task.id === openId) : undefined;
  if (open) return <TaskDetail task={open} tasks={live} onBack={() => setOpenId(null)} />;

  const column = byStatus[status] ?? [];

  // Whether there is anything past either edge of the column strip.
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measureEdges = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 4, right: max - el.scrollLeft > 4 });
  }, []);

  useEffect(() => {
    measureEdges();
    if (typeof ResizeObserver === "undefined" || !stripRef.current) return;
    const observer = new ResizeObserver(measureEdges);
    observer.observe(stripRef.current);
    return () => observer.disconnect();
  }, [measureEdges]);

  /** The card is made on the PC and comes back in the next snapshot; nothing is faked here. */
  const create = () => {
    const title = draft.trim();
    if (!title) return;
    useAppStore.getState().addTask(projectId, { title, status });
    setDraft("");
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* The columns run past the edge of a phone and nothing said so: the fade appears on
          whichever side still has columns on it, and goes when you get there. */}
      <div className="relative shrink-0 border-b border-border">
        {edges.left && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent" />
        )}
        {edges.right && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent" />
        )}
        <div
          ref={stripRef}
          onScroll={measureEdges}
          className="flex gap-1.5 overflow-x-auto scrollbar-none px-3 py-2"
        >
        {TASK_STATUSES.map(s => {
          const count = byStatus[s]?.length ?? 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
                s === status ? "border-transparent bg-accent text-accent-foreground" : "border-border text-muted-foreground",
              )}
            >
              {t(taskStatusMeta[s].labelKey)} {count > 0 && <span className="tabular-nums opacity-70">{count}</span>}
            </button>
          );
        })}
        </div>
      </div>

      {/* Writing one down is half of what a board is for, and it could only be done on the PC. */}
      <form
        className="shrink-0 flex gap-1.5 border-b border-border px-3 py-2"
        onSubmit={e => { e.preventDefault(); create(); }}
      >
        <Input
          className="h-9 flex-1 text-sm"
          placeholder={t("tasks.titlePlaceholder")}
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0" aria-label={t("tasks.new")} disabled={!draft.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {column.length === 0 ? (
          <EmptyState icon={ListTodo} title={t("tasks.emptyColumn")} description={t(taskStatusMeta[status].labelKey)} />
        ) : (
          <div className="flex flex-col gap-2">
            {column.map(task => (
              <TaskRow key={task.id} task={task} tasks={live} onOpen={() => setOpenId(task.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, tasks, onOpen }: { task: Task; tasks: Task[]; onOpen(): void }) {
  const t = useT();
  const locale = useLocale();
  const agent = useAppStore(state => (task.agentId ? selectAgent(state, task.agentId) : undefined));
  const blocked = blockedBy(task, tasks).length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-card p-3 text-left active:bg-accent/40"
    >
      <div className="flex items-start gap-2">
        {agent && <AgentAvatar provider={agent.provider} color={agent.color} size={18} />}
        <span className="min-w-0 flex-1 text-sm leading-snug">{task.title}</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", taskStatusMeta[task.status].dot)} />
        <span>{t(taskStatusMeta[task.status].labelKey)}</span>
        {blocked > 0 && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{t("tasks.blockedBy", { n: blocked })}</Badge>}
        <span className="ml-auto tabular-nums">{formatTimeAgo(task.updatedAt, Date.now(), locale)}</span>
      </div>
    </button>
  );
}

function TaskDetail({ task, tasks, onBack }: { task: Task; tasks: Task[]; onBack(): void }) {
  const t = useT();
  const locale = useLocale();
  const moveTask = useAppStore(state => state.moveTask);
  const agent = useAppStore(state => (task.agentId ? selectAgent(state, task.agentId) : undefined));
  const blocking = blockedBy(task, tasks);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 flex items-center gap-2 border-b border-border px-2 py-2">
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t("common.back")} onClick={onBack}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{task.title}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {agent && (
            <span className="flex items-center gap-1.5">
              <AgentAvatar provider={agent.provider} color={agent.color} size={16} /> {agent.name}
            </span>
          )}
          {task.branch && <code className="rounded bg-muted px-1.5 py-0.5">{task.branch}</code>}
          <span className="ml-auto">{formatTimeAgo(task.updatedAt, Date.now(), locale)}</span>
        </div>

        {blocking.length > 0 && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            {t("tasks.blockedBy", { n: blocking.length })}: {blocking.map(b => b.title).join(", ")}
          </p>
        )}

        {task.detail && (
          <div className="mt-3 text-sm">
            <Markdown text={task.detail} />
          </div>
        )}

        <p className="mt-5 mb-2 text-xs font-semibold text-muted-foreground">{t("tasks.moveTo")}</p>
        <div className="flex flex-wrap gap-2">
          {TASK_STATUSES.filter(s => s !== task.status).map(s => (
            <Button key={s} variant="outline" size="sm" onClick={() => moveTask(task.id, s, 0)}>
              <span className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", taskStatusMeta[s].dot)} />
              {t(taskStatusMeta[s].labelKey)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
