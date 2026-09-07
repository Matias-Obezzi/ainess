// "Nueva tarea": the little that a task needs to exist. Everything else is edited afterwards in
// the detail dialog.
import { useEffect, useState } from "react";
import { useAppStore, selectProjectAgents } from "@/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TASK_STATUSES, TASK_PRIORITIES, storedPriority } from "@/lib/tasks";
import { taskStatusMeta, taskPriorityLabelKey } from "./task-meta";
import type { TaskPriority, TaskStatus } from "@/types";
import { useT } from "@/i18n/useT";

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
  const t = useT();
  const agents = useAppStore(state => selectProjectAgents(state, projectId));
  const addTask = useAppStore(state => state.addTask);

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [agentId, setAgentId] = useState(UNASSIGNED);
  const [column, setColumn] = useState<TaskStatus>(status ?? "backlog");
  const [priority, setPriority] = useState<TaskPriority>("normal");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDetail("");
    setAgentId(UNASSIGNED);
    setColumn(status ?? "backlog");
    setPriority("normal");
  }, [open, status]);

  const create = () => {
    const clean = title.trim();
    if (!clean) return;
    addTask(projectId, {
      title: clean,
      detail: detail.trim() || undefined,
      status: column,
      agentId: agentId === UNASSIGNED ? undefined : agentId,
      priority: storedPriority(priority),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tasks.new")}</DialogTitle>
          <DialogDescription>{t("tasks.newHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-task-title">{t("tasks.title")}</Label>
            <Input
              id="new-task-title"
              autoFocus
              placeholder={t("tasks.titlePlaceholder")}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") create();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-task-detail">{t("tasks.detail")}</Label>
            <Textarea
              id="new-task-detail"
              className="min-h-24"
              placeholder={t("tasks.detailPlaceholder")}
              value={detail}
              onChange={e => setDetail(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("tasks.column")}</Label>
              <Select value={column} onValueChange={value => setColumn(value as TaskStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>
                      {t(taskStatusMeta[s].labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("tasks.priority")}</Label>
              <Select value={priority} onValueChange={value => setPriority(value as TaskPriority)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map(p => (
                    <SelectItem key={p} value={p}>
                      {t(taskPriorityLabelKey[p])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("chatDialog.agent")}</Label>
            <Select value={agentId} onValueChange={setAgentId}>
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button disabled={!title.trim()} onClick={create}>{t("common.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
