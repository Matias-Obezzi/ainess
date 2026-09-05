// One agent in the hierarchy graph: who it is, what it is doing right now and the actions
// available on it, all as icons. The details live in the inspector (AgentInspector.tsx).
import { useEffect, useMemo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import type { AgentConfig, CommMessage } from "@/types";
import { useAppStore } from "@/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "./StatusDot";
import { statusLabel, roleLabel } from "@/lib/labels";
import { PROVIDERS } from "@/lib/providers";
import { formatElapsed } from "@/lib/format";
import { toolIcon } from "@/lib/tool-summary";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  FileText,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Square
} from "lucide-react";
import { useAgentActions, AgentActionDialogs, type AgentActions } from "./agent-actions";

const HANDLE_STYLE = {
  width: 8,
  height: 8,
  border: "none",
  background: "var(--muted-foreground)"
} as const;

/** A clock that only ticks while the agent is actually running something. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);
  return now;
}

/** Last tool call of a run, for the one-line "what it is doing" hint. */
function useLastTool(runId: string | undefined): { tool: string; summary: string } | null {
  const messages = useAppStore(state => state.messages);
  return useMemo(() => {
    if (!runId) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m: CommMessage = messages[i];
      if (m.runId !== runId || m.kind !== "tool") continue;
      return { tool: m.meta?.tool ?? m.text, summary: m.meta?.summary ?? m.text };
    }
    return null;
  }, [messages, runId]);
}

/** Projects other than the current one where this agent is busy right now. */
function useBusyElsewhere(agentId: string): string[] {
  const runtime = useAppStore(state => state.runtime);
  const projects = useAppStore(state => state.config.projects);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  return useMemo(() => {
    const names: string[] = [];
    for (const [projectId, projectRuntime] of Object.entries(runtime)) {
      if (projectId === currentProjectId) continue;
      const status = projectRuntime[agentId]?.status;
      if (status !== "working" && status !== "waiting") continue;
      names.push(projects.find(p => p.id === projectId)?.name ?? "otro proyecto");
    }
    return names;
  }, [runtime, projects, currentProjectId, agentId]);
}

/** A ghost icon button with its tooltip: every action in the hierarchy view looks like this. */
export function IconAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  destructive
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          className={cn("h-7 w-7", destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive")}
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The four actions an agent always has, so the node and the inspector never drift apart. */
export function agentActionItems(actions: AgentActions) {
  return {
    stop: { icon: Square, label: "Detener", onClick: actions.stop, disabled: !actions.ready, destructive: true },
    instruct: { icon: MessageSquareText, label: "Indicar", onClick: actions.instruct, disabled: !actions.ready },
    output: { icon: FileText, label: "Ver salida", onClick: actions.viewOutput, disabled: !actions.lastRunId },
    chat: { icon: MessageCircle, label: "Chatear", onClick: actions.openChat, disabled: !actions.ready }
  };
}

export function AgentNode({ data, selected }: { data: { agent: AgentConfig }; selected?: boolean }) {
  const { agent } = data;
  const binaryInfo = useAppStore(state => state.binaries[agent.provider]);
  const runStartedAt = useAppStore(state => {
    const projectId = state.currentProjectId;
    if (!projectId) return undefined;
    const runId = state.runtime[projectId]?.[agent.id]?.currentRunId;
    return runId ? state.runs[runId]?.startedAt : undefined;
  });

  const actions = useAgentActions(agent);
  const { status } = actions;
  const busyElsewhere = useBusyElsewhere(agent.id);
  const lastTool = useLastTool(status === "working" ? actions.currentRunId : undefined);
  const now = useNow(actions.busy);

  const color = agent.color || "#888888";
  const initial = (agent.name.trim()[0] || "?").toUpperCase();

  const elapsed = status === "working" && runStartedAt ? formatElapsed((now - runStartedAt) / 1000) : null;
  const stateText =
    status === "working"
      ? `Trabajando${elapsed ? ` · ${elapsed}` : ""}`
      : status === "waiting"
        ? "Esperando a sus hijos"
        : statusLabel[status];

  const items = agentActionItems(actions);
  const LastToolIcon = lastTool ? toolIcon(lastTool.tool) : null;

  return (
    <>
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />

      <div
        className={cn(
          "w-[260px] rounded-xl border bg-card text-card-foreground shadow-sm",
          selected && "ring-2 ring-primary/60"
        )}
        style={{ borderTopWidth: 3, borderTopColor: color }}
      >
        <div className="flex flex-col gap-2 p-3">
          {/* Who */}
          <div className="flex items-start gap-2">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
              style={{ backgroundColor: color }}
              aria-hidden
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold" title={agent.name}>
                {agent.name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {PROVIDERS[agent.provider]?.label || agent.provider} · {roleLabel[agent.role] || agent.role}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
              {binaryInfo === null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>CLI no encontrado: configuralo en Agentes</TooltipContent>
                </Tooltip>
              )}
              <StatusDot status={status} className={cn("h-2.5 w-2.5", status === "working" && "animate-pulse")} />
            </div>
          </div>

          {/* What it is doing */}
          <div className="flex items-center gap-1.5">
            {status === "error" && actions.lastError ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-xs text-destructive">Error</span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs whitespace-pre-wrap">{actions.lastError}</TooltipContent>
              </Tooltip>
            ) : (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  status === "working" ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {stateText}
              </span>
            )}
            {busyElsewhere.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="ml-auto max-w-[110px] truncate border-amber-500/40 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400"
                  >
                    en {busyElsewhere[0]}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Ocupado en: {busyElsewhere.join(", ")}</TooltipContent>
              </Tooltip>
            )}
          </div>

          {actions.currentTask && (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="line-clamp-2 cursor-help text-xs text-muted-foreground">{actions.currentTask}</p>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm whitespace-pre-wrap">{actions.currentTask}</TooltipContent>
            </Tooltip>
          )}

          {lastTool && LastToolIcon && (
            <div
              className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
              title={lastTool.summary}
            >
              <LastToolIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{lastTool.summary}</span>
            </div>
          )}
        </div>

        {/* Actions: the click belongs to the button, not to the canvas. */}
        <div
          className="nodrag nopan flex items-center gap-0.5 border-t border-border px-2 py-1"
          onClick={e => e.stopPropagation()}
        >
          {actions.busy && <IconAction {...items.stop} />}
          <IconAction {...items.instruct} />
          <IconAction {...items.output} />
          <IconAction {...items.chat} />
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7"
                    aria-label="Más acciones"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Más acciones</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!actions.ready} onSelect={() => actions.resetSession()}>
                <RotateCcw /> Reiniciar sesión
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.editAgent()}>
                <Pencil /> Editar agente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />

      <AgentActionDialogs agent={agent} actions={actions} />
    </>
  );
}
