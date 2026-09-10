// Everything about one task that does not fit on its card: the long detail, who is on it, what it
// waits for and the run that carried it out. The board and the graph both open this one dialog.
import { useEffect, useMemo, useState } from "react";
import { useAppStore, selectTasks, selectProjectAgents } from "@/store";
import { AgentAvatar } from "@/components/ProviderLogo";
import { Markdown } from "@/components/shell/Markdown";
import { RunDetailDialog } from "@/components/RunDetailDialog";
import { RetryRunDialog } from "@/components/RetryRunDialog";
import { runUsageText } from "@/components/UsageDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { confirmDelete } from "@/lib/confirm";
import { formatTimeAgo } from "@/lib/format";
import { blockedBy, hasCycle, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/tasks";
import { goToTaskOrigin, hasOrigin, taskPriorityLabelKey, taskStatusMeta } from "./task-meta";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@/types";
import { Archive, ArchiveRestore, Link2, MessagesSquare, Sparkles, Terminal, Trash2, X } from "lucide-react";
import { useT, useLocale } from "@/i18n/useT";
import { plural } from "@/i18n";

const UNASSIGNED = "__none__";

export function TaskDetailDialog({
  projectId,
  taskId,
  onOpenChange,
}: {
  projectId: string;
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const tasks = useAppStore(state => selectTasks(state, projectId));
  const agents = useAppStore(state => selectProjectAgents(state, projectId));
  const runs = useAppStore(state => state.runs);
  const updateTask = useAppStore(state => state.updateTask);
  const removeTask = useAppStore(state => state.removeTask);
  const archiveTask = useAppStore(state => state.archiveTask);
  const linkTaskDependency = useAppStore(state => state.linkTaskDependency);
  const unlinkTaskDependency = useAppStore(state => state.unlinkTaskDependency);

  const task = taskId ? tasks.find(t => t.id === taskId) : undefined;
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [editingDetail, setEditingDetail] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);

  // Reset the draft fields whenever another task is opened.
  useEffect(() => {
    setTitle(task?.title ?? "");
    setDetail(task?.detail ?? "");
    setEditingDetail(false);
  }, [task?.id, task?.title, task?.detail]);

  const agent = task?.agentId ? agents.find(a => a.id === task.agentId) : undefined;
  const taskRun = task?.runId ? runs[task.runId] : undefined;
  // What the run of this task consumed, when its CLI said anything at all.
  const usage = runUsageText(taskRun, locale, t);
  const missing = useMemo(() => (task ? blockedBy(task, tasks) : []), [task, tasks]);
  const dependencies = useMemo(
    () => (task ? task.dependsOn.map(id => tasks.find(t => t.id === id)).filter(t => t !== undefined) : []),
    [task, tasks]
  );
  // Only tasks that would not close a loop can be offered as a new dependency.
  const candidates = useMemo(
    () => (task ? tasks.filter(t => t.id !== task.id && !task.dependsOn.includes(t.id) && !hasCycle(tasks, task.id, t.id)) : []),
    [task, tasks]
  );

  const open = !!task;
  const meta = task ? taskStatusMeta[task.status] : null;

  const commitTitle = () => {
    if (!task) return;
    const clean = title.trim();
    if (!clean || clean === task.title) {
      setTitle(task.title);
      return;
    }
    updateTask(task.id, { title: clean });
  };

  const commitDetail = () => {
    if (!task) return;
    setEditingDetail(false);
    if (detail === (task.detail ?? "")) return;
    updateTask(task.id, { detail: detail || undefined });
  };

  const remove = async () => {
    if (!task) return;
    if (!(await confirmDelete(t("tasks.delete"), task.title))) return;
    removeTask(task.id);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
          {task && meta && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{task.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                    {t(meta.labelKey)}
                  </span>
                  {agent && (
                    <span className="inline-flex items-center gap-1.5">
                      <AgentAvatar provider={agent.provider} color={agent.color} size={18} />
                      {agent.name}
                    </span>
                  )}
                  <span>{t("tasks.updated", { when: formatTimeAgo(task.updatedAt, Date.now(), locale) })}</span>
                  {task.archived && <Badge variant="outline">{t("tasks.archived")}</Badge>}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="task-title">{t("tasks.title")}</Label>
                    <Input
                      id="task-title"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      onBlur={commitTitle}
                      onKeyDown={e => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="task-branch">{t("git.branch")}</Label>
                    <Input
                      id="task-branch"
                      className="font-mono text-xs"
                      placeholder={t("git.noBranch")}
                      value={task.branch ?? ""}
                      onChange={e => updateTask(task.id, { branch: e.target.value || undefined })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("tasks.status")}</Label>
                    <Select value={task.status} onValueChange={value => updateTask(task.id, { status: value as TaskStatus })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUSES.map(status => (
                          <SelectItem key={status} value={status}>
                            {t(taskStatusMeta[status].labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("tasks.priority")}</Label>
                    {/* "normal" is stored as no priority at all, so an untouched task stays untouched. */}
                    <Select
                      value={task.priority ?? "normal"}
                      onValueChange={value => updateTask(task.id, { priority: value === "normal" ? undefined : (value as TaskPriority) })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_PRIORITIES.map(priority => (
                          <SelectItem key={priority} value={priority}>
                            {t(taskPriorityLabelKey[priority])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("chatDialog.agent")}</Label>
                    <Select
                      value={task.agentId ?? UNASSIGNED}
                      onValueChange={value => updateTask(task.id, { agentId: value === UNASSIGNED ? undefined : value })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>{t("tasks.unassigned")}</SelectItem>
                        {agents.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>{t("tasks.detail")}</Label>
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => (editingDetail ? commitDetail() : setEditingDetail(true))}>
                      {editingDetail ? t("common.save") : t("common.edit")}
                    </Button>
                  </div>
                  {editingDetail ? (
                    <Textarea
                      autoFocus
                      className="min-h-32"
                      placeholder={t("tasks.detailLongPlaceholder")}
                      value={detail}
                      onChange={e => setDetail(e.target.value)}
                      onBlur={commitDetail}
                    />
                  ) : task.detail ? (
                    <div className="rounded-lg border border-border p-3">
                      <Markdown text={task.detail} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("tasks.noDetail")}</p>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>{t("tasks.dependsOn")}</Label>
                  {dependencies.length === 0 && <p className="text-sm text-muted-foreground">{t("tasks.noDependencies")}</p>}
                  {dependencies.map(dep => (
                    <div key={dep.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", taskStatusMeta[dep.status].dot)} />
                      <span className="min-w-0 flex-1 truncate text-sm">{dep.title}</span>
                      <span className="text-[11px] text-muted-foreground">{t(taskStatusMeta[dep.status].labelKey)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label={t("tasks.removeDependency", { title: dep.title })}
                        onClick={() => unlinkTaskDependency(task.id, dep.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {missing.length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {plural(missing.length, t("tasks.blockedByTasks.one", { n: missing.length }), t("tasks.blockedByTasks.other", { n: missing.length }))}
                    </p>
                  )}
                  {candidates.length > 0 && (
                    <Select
                      value=""
                      onValueChange={value => {
                        if (!linkTaskDependency(task.id, value)) toast.error(t("tasks.cycle"));
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Link2 className="h-3.5 w-3.5" /> {t("tasks.addDependency")}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {task.runId && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Label>{t("tasks.run")}</Label>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{task.runId}</p>
                        {usage && <p className="text-[11px] text-muted-foreground">{t("usage.runUsage")}: {usage}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {taskRun && taskRun.status !== "running" && (
                          <Button variant="outline" size="sm" onClick={() => setRetryOpen(true)}>
                            <Sparkles className="h-3.5 w-3.5" /> {t("retry.action")}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setRunOpen(true)}>
                          <Terminal className="h-3.5 w-3.5" /> {t("tasks.viewRun")}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <DialogFooter className="sm:justify-between">
                {hasOrigin(task) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      goToTaskOrigin(task);
                    }}
                  >
                    <MessagesSquare className="h-3.5 w-3.5" />
                    {t(task.approvalId ? "tasks.goToApproval" : "tasks.goToChat")}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => archiveTask(task.id, !task.archived)}>
                  {task.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  {task.archived ? t("tasks.unarchive") : t("tasks.archiveVerb")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void remove()}
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {task?.runId && <RunDetailDialog runId={task.runId} open={runOpen} onOpenChange={setRunOpen} />}
      {task?.runId && <RetryRunDialog runId={task.runId} open={retryOpen} onOpenChange={setRetryOpen} />}
    </>
  );
}
