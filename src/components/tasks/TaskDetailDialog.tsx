// Everything about one task that does not fit on its card: the long detail, who is on it, what it
// waits for and the run that carried it out. The board and the graph both open this one dialog.
import { useEffect, useMemo, useState } from "react";
import { useAppStore, selectTasks } from "@/store";
import { AgentAvatar } from "@/components/ProviderLogo";
import { Markdown } from "@/components/shell/Markdown";
import { RunDetailDialog } from "@/components/RunDetailDialog";
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
import { blockedBy, hasCycle, TASK_STATUSES } from "@/lib/tasks";
import { taskStatusMeta } from "./task-meta";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types";
import { Archive, ArchiveRestore, Link2, Terminal, Trash2, X } from "lucide-react";

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
  const tasks = useAppStore(state => selectTasks(state, projectId));
  const agents = useAppStore(state => state.config.agents);
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

  // Reset the draft fields whenever another task is opened.
  useEffect(() => {
    setTitle(task?.title ?? "");
    setDetail(task?.detail ?? "");
    setEditingDetail(false);
  }, [task?.id, task?.title, task?.detail]);

  const agent = task?.agentId ? agents.find(a => a.id === task.agentId) : undefined;
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
    if (!(await confirmDelete("la tarea", task.title))) return;
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
                    {meta.label}
                  </span>
                  {agent && (
                    <span className="inline-flex items-center gap-1.5">
                      <AgentAvatar provider={agent.provider} color={agent.color} size={18} />
                      {agent.name}
                    </span>
                  )}
                  <span>Actualizada {formatTimeAgo(task.updatedAt, Date.now())}</span>
                  {task.archived && <Badge variant="outline">Archivada</Badge>}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="task-title">Título</Label>
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
                    <Label htmlFor="task-branch">Rama</Label>
                    <Input
                      id="task-branch"
                      className="font-mono text-xs"
                      placeholder="sin rama"
                      value={task.branch ?? ""}
                      onChange={e => updateTask(task.id, { branch: e.target.value || undefined })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Estado</Label>
                    <Select value={task.status} onValueChange={value => updateTask(task.id, { status: value as TaskStatus })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUSES.map(status => (
                          <SelectItem key={status} value={status}>
                            {taskStatusMeta[status].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Agente</Label>
                    <Select
                      value={task.agentId ?? UNASSIGNED}
                      onValueChange={value => updateTask(task.id, { agentId: value === UNASSIGNED ? undefined : value })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
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
                    <Label>Detalle</Label>
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => (editingDetail ? commitDetail() : setEditingDetail(true))}>
                      {editingDetail ? "Guardar" : "Editar"}
                    </Button>
                  </div>
                  {editingDetail ? (
                    <Textarea
                      autoFocus
                      className="min-h-32"
                      placeholder="Qué hay que hacer, en markdown"
                      value={detail}
                      onChange={e => setDetail(e.target.value)}
                      onBlur={commitDetail}
                    />
                  ) : task.detail ? (
                    <div className="rounded-lg border border-border p-3">
                      <Markdown text={task.detail} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin detalle.</p>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Depende de</Label>
                  {dependencies.length === 0 && <p className="text-sm text-muted-foreground">No depende de nada.</p>}
                  {dependencies.map(dep => (
                    <div key={dep.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", taskStatusMeta[dep.status].dot)} />
                      <span className="min-w-0 flex-1 truncate text-sm">{dep.title}</span>
                      <span className="text-[11px] text-muted-foreground">{taskStatusMeta[dep.status].label}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label={`Quitar la dependencia ${dep.title}`}
                        onClick={() => unlinkTaskDependency(task.id, dep.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {missing.length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Bloqueada por {missing.length} tarea{missing.length === 1 ? "" : "s"} sin terminar.
                    </p>
                  )}
                  {candidates.length > 0 && (
                    <Select
                      value=""
                      onValueChange={value => {
                        if (!linkTaskDependency(task.id, value)) toast.error("Esa dependencia haría un círculo.");
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Link2 className="h-3.5 w-3.5" /> Agregar una dependencia
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
                        <Label>Corrida</Label>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{task.runId}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setRunOpen(true)}>
                        <Terminal className="h-3.5 w-3.5" /> Ver la corrida
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <DialogFooter className="sm:justify-between">
                <Button variant="ghost" size="sm" onClick={() => archiveTask(task.id, !task.archived)}>
                  {task.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  {task.archived ? "Desarchivar" : "Archivar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void remove()}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {task?.runId && <RunDetailDialog runId={task.runId} open={runOpen} onOpenChange={setRunOpen} />}
    </>
  );
}
