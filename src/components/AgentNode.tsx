// One agent in the hierarchy graph: who it is, what it is doing right now and the actions
// available on it, all as icons. The details live in the inspector (AgentInspector.tsx).
import { AgentAvatar } from "@/components/ProviderLogo";
import { QuotaRing, useAgentQuota } from "@/components/QuotaRing";
import { useEffect, useMemo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import type { AgentConfig, CommMessage } from "@/types";
import { useAppStore, selectWorktree } from "@/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "./StatusDot";
import { statusLabelKey, roleLabelKey } from "@/lib/labels";
import { useT, type TFunction } from "@/i18n/useT";
import { PROVIDERS } from "@/lib/providers";
import { formatElapsed, truncate } from "@/lib/format";
import { toolIcon } from "@/lib/tool-summary";
import { worktreeBranch } from "@/lib/worktree";
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
  Copy,
  FileText,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Square,
  Trash2
} from "lucide-react";
import { useAgentActions, AgentActionDialogs, AgentContextMenu, type AgentActions } from "./agent-actions";

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
  const t = useT();
  const runtime = useAppStore(state => state.runtime);
  const projects = useAppStore(state => state.config.projects);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  return useMemo(() => {
    const names: string[] = [];
    for (const [projectId, projectRuntime] of Object.entries(runtime)) {
      if (projectId === currentProjectId) continue;
      const status = projectRuntime[agentId]?.status;
      if (status !== "working" && status !== "waiting") continue;
      names.push(projects.find(p => p.id === projectId)?.name ?? t("agentNode.otherProject"));
    }
    return names;
  }, [runtime, projects, currentProjectId, agentId, t]);
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
export function agentActionItems(actions: AgentActions, t: TFunction) {
  return {
    stop: { icon: Square, label: t("composer.stop"), onClick: actions.stop, disabled: !actions.ready, destructive: true },
    instruct: { icon: MessageSquareText, label: t("agentActions.instruct"), onClick: actions.instruct, disabled: !actions.ready },
    output: { icon: FileText, label: t("agentActions.viewOutput"), onClick: actions.viewOutput, disabled: !actions.lastRunId },
    chat: { icon: MessageCircle, label: t("agentActions.chat"), onClick: actions.openChat, disabled: !actions.ready }
  };
}

export function AgentNode({ data, selected }: { data: { agent: AgentConfig }; selected?: boolean }) {
  const { agent } = data;
  const t = useT();
  const binaryInfo = useAppStore(state => state.binaries[agent.provider]);
  const runStartedAt = useAppStore(state => {
    const projectId = state.currentProjectId;
    if (!projectId) return undefined;
    const runId = state.runtime[projectId]?.[agent.id]?.currentRunId;
    return runId ? state.runs[runId]?.startedAt : undefined;
  });

  // The branch it works on, once it has a worktree; before the first run, the one it will get.
  const worktree = useAppStore(state => selectWorktree(state, state.currentProjectId, agent.id));
  const preparing = useAppStore(state =>
    state.currentProjectId ? state.runtime[state.currentProjectId]?.[agent.id]?.preparing : undefined
  );
  const branch = agent.worktree ? worktree?.branch ?? worktreeBranch(agent.name) : null;

  const actions = useAgentActions(agent);
  const { status } = actions;
  const busyElsewhere = useBusyElsewhere(agent.id);
  const lastTool = useLastTool(status === "working" ? actions.currentRunId : undefined);
  const quota = useAgentQuota(agent);
  const now = useNow(actions.busy);

  const color = agent.color || "#888888";

  const elapsed = status === "working" && runStartedAt ? formatElapsed((now - runStartedAt) / 1000) : null;
  const stateText =
    preparing
      ? preparing
      : status === "working"
      ? (elapsed ? t("agentNode.workingElapsed", { elapsed }) : t("label.status.working"))
      : status === "waiting"
        ? t("inspector.waitingForChildren")
        : t(statusLabelKey[status]);

  const items = agentActionItems(actions, t);
  const LastToolIcon = lastTool ? toolIcon(lastTool.tool) : null;

  return (
    <>
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />

      <AgentContextMenu actions={actions}>
        <div
          className={cn(
            "w-[260px] rounded-xl border bg-card text-card-foreground shadow-sm",
            selected && "ring-2 ring-primary/60"
          )}
          style={{ borderLeftWidth: 3, borderLeftColor: color }}
        >
          <div className="flex flex-col gap-2 p-3">
            {/* Who */}
            <div className="flex items-start gap-2">
              <AgentAvatar provider={agent.provider} color={color} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold" title={agent.name}>
                  {agent.name}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {PROVIDERS[agent.provider]?.label || agent.provider} · {t(roleLabelKey[agent.role]) || agent.role}
                </div>
                {branch && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="truncate font-mono text-[10px] text-muted-foreground" title={branch}>
                        {branch}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {worktree ? t("agentNode.worksIn", { path: worktree.path }) : t("agentNode.ownWorktree")}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                {binaryInfo === null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t("agentNode.cliMissing")}</TooltipContent>
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
                    <span className="cursor-help text-xs text-destructive">{t("label.status.error")}</span>
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
              {/* How much quota is left for this agent, from what the store already knows. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-auto flex cursor-help items-center gap-1">
                    <QuotaRing fraction={quota.fraction} label={quota.label} size={14} />
                    {quota.fraction !== null && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">{quota.label}</span>
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("agents.quota", { detail: quota.detail })}</TooltipContent>
              </Tooltip>
              {busyElsewhere.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="max-w-[110px] truncate border-amber-500/40 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400"
                    >
                      {t("agentNode.busyIn", { name: busyElsewhere[0] })}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{t("agentNode.busyInList", { names: busyElsewhere.join(", ") })}</TooltipContent>
                </Tooltip>
              )}
            </div>

            {actions.currentTask && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="line-clamp-2 cursor-help text-xs text-muted-foreground">{actions.currentTask}</p>
                </TooltipTrigger>
                {/* A delegated brief can be pages long: the popover shows a taste, the inspector the rest. */}
                <TooltipContent className="max-w-sm whitespace-pre-wrap">
                  {truncate(actions.currentTask, 240)}
                  {actions.currentTask.length > 240 && (
                    <span className="mt-1 block text-[10px] opacity-70">{t("agentNode.clickForFullTask")}</span>
                  )}
                </TooltipContent>
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
            data-node-actions
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
                      aria-label={t("agentNode.moreActions")}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{t("agentNode.moreActions")}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={!actions.ready} onSelect={() => actions.resetSession()}>
                  <RotateCcw /> {t("agentActions.resetSession")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.editAgent()}>
                  <Pencil /> {t("agentActions.editAgent")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!actions.ready} onSelect={() => actions.duplicate()}>
                  <Copy /> {t("agentActions.duplicate")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!actions.ready}
                  onSelect={() => actions.removeAgent()}
                >
                  <Trash2 /> {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </AgentContextMenu>

      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />

      <AgentActionDialogs agent={agent} actions={actions} />
    </>
  );
}
