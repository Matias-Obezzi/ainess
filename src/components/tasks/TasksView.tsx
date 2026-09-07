// The Tareas mode of a project: its own little toolbar (board or graph, plus "Nueva tarea"), a bar
// to search and filter, and whichever of the two views is selected. The filter lives here so the
// board and the graph always count the same work; it is a view thing and nothing about it is saved.
import { useEffect, useMemo, useState } from "react";
import { useAppStore, selectTasks, selectProjectAgents } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskBoard } from "./TaskBoard";
import { TaskGraph } from "./TaskGraph";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { NewTaskDialog } from "./NewTaskDialog";
import { taskStatusMeta } from "./task-meta";
import { boardMarkdown, isFiltering, type TaskFilter } from "@/lib/tasks";
import { copyText } from "@/lib/clipboard";
import { reconcileProject } from "@/lib/task-reconcile";
import { toast } from "@/components/ui/toast";
import { useAutoArchive } from "@/hooks/useAutoArchive";
import type { TaskStatus } from "@/types";
import { ClipboardCopy, Columns3, Network, Plus, RefreshCw, Search, X } from "lucide-react";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";

/** Value of the agent select that means "no filter", since a Select cannot hold an empty value. */
const ALL_AGENTS = "__all__";

export function TasksView({ projectId }: { projectId: string }) {
  const t = useT();
  const taskView = useAppStore(state => state.taskView);
  const setTaskView = useAppStore(state => state.setTaskView);
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

      {tasks.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 w-56 pl-7 text-xs"
              placeholder={t("tasks.searchPlaceholder")}
              aria-label={t("tasks.search")}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <Select value={agentId ?? ALL_AGENTS} onValueChange={value => setAgentId(value === ALL_AGENTS ? null : value)}>
            <SelectTrigger size="sm" className="h-7 w-44 text-xs" aria-label={t("tasks.filterByAgent")}>
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
            <Button variant="ghost" size="sm" className="h-7" onClick={clearFilter}>
              <X className="h-3.5 w-3.5" /> {t("tasks.clearFilter")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7"
            title={t("tasks.reconcileHint")}
            onClick={reviewBoard}
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t("tasks.reconcile")}
          </Button>
          <Button variant="outline" size="sm" className="h-7" onClick={copyBoard}>
            <ClipboardCopy className="h-3.5 w-3.5" /> {t("tasks.copyMarkdown")}
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
        ) : taskView === "graph" ? (
          <TaskGraph projectId={projectId} filter={filter} onOpenTask={setOpenTaskId} onNewTask={() => openNew()} />
        ) : (
          <TaskBoard projectId={projectId} filter={filter} onOpenTask={setOpenTaskId} onNewTask={openNew} />
        )}
      </div>

      <TaskDetailDialog projectId={projectId} taskId={openTaskId} onOpenChange={open => !open && setOpenTaskId(null)} />
      <NewTaskDialog projectId={projectId} open={newOpen} status={newStatus} onOpenChange={setNewOpen} />
    </div>
  );
}
