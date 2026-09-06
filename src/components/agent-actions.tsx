// The actions an agent exposes in the hierarchy view (node and inspector share them so the
// semantics never drift): stop, instruct, view output, chat, reset session and edit.
import { useMemo, useState } from "react";
import { FileText, MessageCircle, MessageSquareText, Pencil, RotateCcw, Square } from "lucide-react";
import { useAppStore } from "@/store";
import type { AgentConfig, AgentStatus, Run } from "@/types";
import { ContextActionItems, type MenuAction } from "@/components/menu-actions";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { InstructDialog } from "./InstructDialog";
import { RunDetailDialog } from "./RunDetailDialog";

export interface AgentActions {
  status: AgentStatus;
  currentTask?: string;
  currentRunId?: string;
  lastError?: string;
  /** Runs of this agent in the current project, newest first. */
  runs: Run[];
  /** Newest run of this agent in the current project, if any. */
  lastRunId: string | null;
  /** Whether there is something to stop (working or waiting). */
  busy: boolean;
  /** Whether the current project is set (every action needs one). */
  ready: boolean;
  stop(): void;
  instruct(): void;
  viewOutput(): void;
  openChat(): void;
  resetSession(): void;
  editAgent(): void;
  instructOpen: boolean;
  setInstructOpen(open: boolean): void;
  runDetailOpen: boolean;
  setRunDetailOpen(open: boolean): void;
}

export function useAgentActions(agent: AgentConfig): AgentActions {
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const runtime = useAppStore(state =>
    state.currentProjectId ? state.runtime[state.currentProjectId]?.[agent.id] : undefined
  );
  const allRuns = useAppStore(state => state.runs);
  const stopAgent = useAppStore(state => state.stopAgent);
  const resetSession = useAppStore(state => state.resetSession);
  const openSettings = useAppStore(state => state.openSettings);

  const [instructOpen, setInstructOpen] = useState(false);
  const [runDetailOpen, setRunDetailOpen] = useState(false);

  const runs = useMemo(
    () =>
      Object.values(allRuns)
        .filter(r => r.agentId === agent.id && r.projectId === currentProjectId)
        .sort((a, b) => b.startedAt - a.startedAt),
    [allRuns, agent.id, currentProjectId]
  );

  const status = runtime?.status ?? "idle";
  const busy = status === "working" || status === "waiting";

  // Opens (or creates) this agent's individual chat and switches the project screen to it.
  const openChat = () => {
    const state = useAppStore.getState();
    if (!currentProjectId) return;
    const existing = state.config.chats.find(
      c =>
        c.projectId === currentProjectId &&
        c.mode === "individual" &&
        c.participants.length === 1 &&
        c.participants[0].agentId === agent.id
    );
    const chatId = existing
      ? existing.id
      : state.createChat({
          projectId: currentProjectId,
          name: agent.name,
          mode: "individual",
          participants: [{ agentId: agent.id, role: "asistente" }]
        });
    state.openProject(currentProjectId, chatId);
    state.setProjectMode("chat");
  };

  return {
    status,
    currentTask: runtime?.currentTask,
    currentRunId: runtime?.currentRunId,
    lastError: runtime?.lastError,
    runs,
    lastRunId: runs.length > 0 ? runs[0].id : null,
    busy,
    ready: !!currentProjectId,
    stop: () => {
      if (currentProjectId) void stopAgent(agent.id, currentProjectId);
    },
    instruct: () => setInstructOpen(true),
    viewOutput: () => setRunDetailOpen(true),
    openChat,
    resetSession: () => {
      if (currentProjectId) resetSession(agent.id, currentProjectId);
    },
    editAgent: () => openSettings("agents"),
    instructOpen,
    setInstructOpen,
    runDetailOpen,
    setRunDetailOpen
  };
}

/**
 * The same actions as a menu list. `onViewOutput` lets a host that tracks which run it is showing
 * (the inspector) take over "Ver salida".
 */
export function agentMenuActions(actions: AgentActions, onViewOutput?: () => void): MenuAction[] {
  return [
    {
      key: "stop",
      label: "Detener",
      icon: Square,
      disabled: !actions.ready || !actions.busy,
      onSelect: actions.stop
    },
    { key: "instruct", label: "Indicar", icon: MessageSquareText, disabled: !actions.ready, onSelect: actions.instruct },
    {
      key: "output",
      label: "Ver salida",
      icon: FileText,
      disabled: !actions.lastRunId,
      onSelect: onViewOutput ?? actions.viewOutput
    },
    { key: "chat", label: "Chatear", icon: MessageCircle, disabled: !actions.ready, onSelect: actions.openChat },
    {
      key: "reset",
      label: "Reiniciar sesión",
      icon: RotateCcw,
      disabled: !actions.ready,
      separatorBefore: true,
      onSelect: actions.resetSession
    },
    { key: "edit", label: "Editar agente", icon: Pencil, onSelect: actions.editAgent }
  ];
}

/** Right click on an agent — its node, its row in the inspector — opens the actions above. */
export function AgentContextMenu({
  actions,
  onViewOutput,
  children
}: {
  actions: AgentActions;
  onViewOutput?: () => void;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextActionItems actions={agentMenuActions(actions, onViewOutput)} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The dialogs the actions open. Rendered once next to whatever hosts the buttons. */
export function AgentActionDialogs({ agent, actions, runId }: { agent: AgentConfig; actions: AgentActions; runId?: string | null }) {
  return (
    <>
      <InstructDialog
        agentId={agent.id}
        open={actions.instructOpen}
        onOpenChange={actions.setInstructOpen}
        isWorking={actions.status === "working"}
      />
      <RunDetailDialog
        runId={runId !== undefined ? runId : actions.lastRunId}
        open={actions.runDetailOpen}
        onOpenChange={actions.setRunDetailOpen}
      />
    </>
  );
}
