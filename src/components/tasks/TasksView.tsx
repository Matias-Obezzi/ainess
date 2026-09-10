// The Tareas mode of a project: one bar to search, filter and act, and the board underneath.
//
// There used to be two views here and a switcher to pick between them. The graph one drew every
// task in the project side by side and grew wider than the window, so it is now asked for from a
// single task (see TaskFamilyDialog) and shows only what that task is tied to. With the switcher
// gone the two toolbars folded into one. The filter is a view thing and nothing about it is saved.
import { useEffect, useMemo, useState } from "react";
import { useAppStore, selectTasks, selectProjectAgents } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskBoard } from "./TaskBoard";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { NewTaskDialog } from "./NewTaskDialog";
import { taskStatusMeta } from "./task-meta";
import { boardMarkdown, isFiltering, type TaskFilter } from "@/lib/tasks";
import { copyText } from "@/lib/clipboard";
import { reconcileProject } from "@/lib/task-reconcile";
import { toast } from "@/components/ui/toast";
import { useAutoArchive } from "@/hooks/useAutoArchive";
import type { TaskStatus } from "@/types";
import { ClipboardCopy, Plus, RefreshCw, Search, X } from "lucide-react";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";

/** Value of the agent select that means "no filter", since a Select cannot hold an empty value. */
const ALL_AGENTS = "__all__";

export function TasksView({ projectId }: { projectId: string }) {
  const t = useT();
  const loaded = useAppStore(state => state.loaded);
  const tasks = useAppStore(state => selectTasks(state, projectId));
  const agents = useAppStore(state => selectProjectAgents(state, projectId));
  const focusedTaskId = useAppStore(state => state.focusedTaskId);
  const focusTask = useAppStore(state => state.focusTask);

  useAutoArchive(projectId);

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
  const [query, setQuery] = useState("");
  const [agentId, setAgentId] = useState<string | null>(null);

  const filter: TaskFilter = useMemo(() => ({ query, agentId }), [query, agentId]);
  const filtering = isFiltering(filter);

  const openNew = (status?: TaskStatus) => {
    setNewStatus(status);
    setNewOpen(true);
  };

  const clearFilter = () => {
    setQuery("");
    setAgentId(null);
  };

  /**
   * Reads the runs behind the cards and puts the ones that are out of step where they belong. It
   * is the same rule the board follows live, so nothing here is a guess: what it moves are the
   * tasks whose run ended while nobody was listening (the app closed, the run killed).
   */
  const reviewBoard = () => {
    const moved = reconcileProject(projectId);
    if (moved === 0) {
      toast.success(t("tasks.reconcileClean"));
      return;
    }
    toast.success(plural(moved, t("tasks.reconciled.one", { n: moved }), t("tasks.reconciled.other", { n: moved })));
  };

  const copyBoard = () => {
    const markdown = boardMarkdown(tasks, {
      status: status => t(taskStatusMeta[status].labelKey),
      agent: id => agents.find(a => a.id === id)?.name,
      blockedBy: t("tasks.blockedByLabel"),
    });
    void copyText(markdown, t("tasks.boardCopied"));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* An empty board has nothing to search and nothing to copy, and its own empty state is where
          the first task gets made. So the whole bar waits until there is something to act on. */}
      {/* Everything in this row is `h-7 rounded-md`, said on each control rather than left to the
          defaults: a Button at `sm` is `rounded-md`, an Input and a SelectTrigger are `rounded-lg`,
          so a row built out of all three came out with two different corner radii side by side. */}
      {tasks.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 w-56 rounded-md pl-7 text-xs"
              placeholder={t("tasks.searchPlaceholder")}
              aria-label={t("tasks.search")}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <Select value={agentId ?? ALL_AGENTS} onValueChange={value => setAgentId(value === ALL_AGENTS ? null : value)}>
            <SelectTrigger size="sm" className="h-7 w-44 rounded-md text-xs" aria-label={t("tasks.filterByAgent")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AGENTS}>{t("tasks.allAgents")}</SelectItem>
              {agents.map(agent => (
                <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtering && (
            <Button variant="ghost" size="sm" className="h-7 rounded-md" onClick={clearFilter}>
              <X className="h-3.5 w-3.5" /> {t("tasks.clearFilter")}
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {plural(tasks.length, t("tasks.count.one", { n: tasks.length }), t("tasks.count.other", { n: tasks.length }))}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 rounded-md"
            title={t("tasks.reconcileHint")}
            onClick={reviewBoard}
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t("tasks.reconcile")}
          </Button>
          <Button variant="outline" size="sm" className="h-7 rounded-md" onClick={copyBoard}>
            <ClipboardCopy className="h-3.5 w-3.5" /> {t("tasks.copyMarkdown")}
          </Button>
          <Button size="sm" className="h-7 rounded-md" onClick={() => openNew()}>
            <Plus className="h-3.5 w-3.5" /> {t("tasks.new")}
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {!loaded ? (
          <div className="flex gap-3 p-3">
            {[0, 1, 2].map(i => (
              <Skeleton key={i} className="h-40 w-72 shrink-0" />
            ))}
          </div>
        ) : (
          <TaskBoard projectId={projectId} filter={filter} onOpenTask={setOpenTaskId} onNewTask={openNew} />
        )}
      </div>

      <TaskDetailDialog projectId={projectId} taskId={openTaskId} onOpenChange={open => !open && setOpenTaskId(null)} />
      <NewTaskDialog projectId={projectId} open={newOpen} status={newStatus} onOpenChange={setNewOpen} />
    </div>
  );
}
