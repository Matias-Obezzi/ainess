// "Nueva tarea": the little that a task needs to exist. Everything else is edited afterwards in
// the detail dialog.
import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TASK_STATUSES } from "@/lib/tasks";
import { taskStatusMeta } from "./task-meta";
import type { TaskStatus } from "@/types";

const UNASSIGNED = "__none__";

export function NewTaskDialog({
  projectId,
  open,
  status,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  /** Column the user asked for, when they started from one. */
  status?: TaskStatus;
  onOpenChange(open: boolean): void;
}) {
  const agents = useAppStore(state => state.config.agents);
  const addTask = useAppStore(state => state.addTask);

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [agentId, setAgentId] = useState(UNASSIGNED);
  const [column, setColumn] = useState<TaskStatus>(status ?? "backlog");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDetail("");
    setAgentId(UNASSIGNED);
    setColumn(status ?? "backlog");
  }, [open, status]);

  const create = () => {
    const clean = title.trim();
    if (!clean) return;
    addTask(projectId, {
      title: clean,
      detail: detail.trim() || undefined,
      status: column,
      agentId: agentId === UNASSIGNED ? undefined : agentId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
          <DialogDescription>Se suma al tablero del proyecto. Podés asignarla después.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-task-title">Título</Label>
            <Input
              id="new-task-title"
              autoFocus
              placeholder="Qué hay que hacer"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") create();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-task-detail">Detalle</Label>
            <Textarea
              id="new-task-detail"
              className="min-h-24"
              placeholder="Opcional, en markdown"
              value={detail}
              onChange={e => setDetail(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Columna</Label>
              <Select value={column} onValueChange={value => setColumn(value as TaskStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>
                      {taskStatusMeta[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Agente</Label>
              <Select value={agentId} onValueChange={setAgentId}>
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!title.trim()} onClick={create}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
