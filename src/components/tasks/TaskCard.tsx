// One card on the board: who is on it, what it is, and whether anything holds it back. Dragging
// uses the native HTML5 events (no drag-and-drop library), so the card only has to say it is
// draggable and hand its id to the board.
import { memo } from "react";
import type { DragEvent } from "react";
import { useAppStore } from "@/store";
import { AgentAvatar } from "@/components/ProviderLogo";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { confirmDelete } from "@/lib/confirm";
import { formatTimeAgo } from "@/lib/format";
import { TASK_STATUSES } from "@/lib/tasks";
import { taskStatusMeta } from "./task-meta";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";
import { Archive, ArchiveRestore, Ban, Trash2 } from "lucide-react";

interface Props {
  task: Task;
  /** How many of its dependencies have not finished yet. */
  blocked: number;
  dragging: boolean;
  onOpen(id: string): void;
  onDragStart(e: DragEvent<HTMLElement>, task: Task): void;
  onDragOver(e: DragEvent<HTMLElement>, task: Task): void;
  onDragEnd(): void;
}

export const TaskCard = memo(function TaskCard({ task, blocked, dragging, onOpen, onDragStart, onDragOver, onDragEnd }: Props) {
  const agents = useAppStore(state => state.config.agents);
  const agent = task.agentId ? agents.find(a => a.id === task.agentId) : undefined;
  const meta = taskStatusMeta[task.status];

  return (
    <TaskContextMenu task={task}>
      <article
        draggable
        role="button"
        tabIndex={0}
        aria-label={task.title}
        onDragStart={e => onDragStart(e, task)}
        onDragOver={e => onDragOver(e, task)}
        onDragEnd={onDragEnd}
        onClick={() => onOpen(task.id)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(task.id);
          }
        }}
        className={cn(
          "cursor-grab rounded-lg border border-border bg-card p-2.5 text-card-foreground shadow-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          dragging && "opacity-40"
        )}
      >
        <div className="flex items-start gap-2">
          {agent ? (
            <AgentAvatar provider={agent.provider} color={agent.color} size={22} />
          ) : (
            <span className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full border border-dashed border-border" title="Sin asignar" />
          )}
          <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug">{task.title}</p>
        </div>

        {task.branch && (
          <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground" title={task.branch}>
            {task.branch}
          </p>
        )}

        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
          <span className="truncate">{meta.label}</span>
          <span className="ml-auto shrink-0">{formatTimeAgo(task.updatedAt, Date.now())}</span>
        </div>

        {blocked > 0 && (
          <Badge variant="outline" className="mt-2 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400">
            <Ban className="h-3 w-3" /> Bloqueada por {blocked}
          </Badge>
        )}
      </article>
    </TaskContextMenu>
  );
});

/** Right click on a card: move it, hand it to somebody, archive it or drop it. */
export function TaskContextMenu({ task, children }: { task: Task; children: React.ReactNode }) {
  const agents = useAppStore(state => state.config.agents);
  const updateTask = useAppStore(state => state.updateTask);
  const moveTask = useAppStore(state => state.moveTask);
  const archiveTask = useAppStore(state => state.archiveTask);
  const removeTask = useAppStore(state => state.removeTask);

  const remove = async () => {
    if (!(await confirmDelete("la tarea", task.title))) return;
    removeTask(task.id);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuSub>
          <ContextMenuSubTrigger>Mover a</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {TASK_STATUSES.map(status => (
              <ContextMenuItem
                key={status}
                disabled={status === task.status && !task.archived}
                // Dropping it at the end of the column is what dragging it there would do.
                onSelect={() => moveTask(task.id, status, Number.MAX_SAFE_INTEGER)}
              >
                {taskStatusMeta[status].label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>Asignar a</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem disabled={!task.agentId} onSelect={() => updateTask(task.id, { agentId: undefined })}>
              Sin asignar
            </ContextMenuItem>
            <ContextMenuSeparator />
            {agents.map(agent => (
              <ContextMenuItem key={agent.id} disabled={agent.id === task.agentId} onSelect={() => updateTask(task.id, { agentId: agent.id })}>
                {agent.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => archiveTask(task.id, !task.archived)}>
          {task.archived ? <ArchiveRestore /> : <Archive />} {task.archived ? "Desarchivar" : "Archivar"}
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={() => void remove()}>
          <Trash2 /> Eliminar
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
