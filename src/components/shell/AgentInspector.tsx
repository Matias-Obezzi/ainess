// The side panel of the hierarchy board: everything about the selected agent that does not fit
// in its node — the full task, its live activity, its last runs and the actions with a label.
import { AgentAvatar } from "@/components/ProviderLogo";
import { useEffect, useRef, useState } from "react";
import type { AgentConfig } from "@/types";
import { useAppStore, selectWorktree } from "@/store";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusDot } from "@/components/StatusDot";
import { RunActivity } from "@/components/shell/RunActivity";
import { AgentActionDialogs, AgentContextMenu, useAgentActions } from "@/components/agent-actions";
import { statusLabel, roleLabel, runDotStatus, runStatusLabel } from "@/lib/labels";
import { PROVIDERS } from "@/lib/providers";
import { worktreeBranch } from "@/lib/worktree";
import { formatClock, truncate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Copy, FileText, MessageCircle, MessageSquareText, Pencil, RotateCcw, Square, Trash2, X } from "lucide-react";

const RECENT_RUNS = 3;

export function AgentInspector({ agent, onClose }: { agent: AgentConfig; onClose: () => void }) {
  const actions = useAgentActions(agent);
  const binaryInfo = useAppStore(state => state.binaries[agent.provider]);
  const worktree = useAppStore(state => selectWorktree(state, state.currentProjectId, agent.id));
  const preparing = useAppStore(state =>
    state.currentProjectId ? state.runtime[state.currentProjectId]?.[agent.id]?.preparing : undefined
  );
  const branch = agent.worktree ? worktree?.branch ?? worktreeBranch(agent.name) : null;
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the panel so Escape reaches it first (the composer ignores keys from `[data-inspector]`).
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, [agent.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if ((e.target as HTMLElement | null)?.closest?.("[role=dialog], .xterm")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const color = agent.color || "#888888";
  const recentRuns = actions.runs.slice(0, RECENT_RUNS);
  const showLive = actions.status === "working" && !!actions.currentRunId;

  const openDetail = (runId: string | null) => {
    setDetailRunId(runId);
    actions.viewOutput();
  };

  return (
    <div
      ref={panelRef}
      data-inspector=""
      tabIndex={-1}
      role="complementary"
      aria-label={`Detalle de ${agent.name}`}
      className="absolute bottom-3 right-3 top-3 z-10 flex w-[360px] flex-col rounded-xl border border-border bg-card text-card-foreground shadow-lg outline-none"
    >
      {/* The header stands for the agent itself, so it carries the same actions on right click. */}
      <AgentContextMenu actions={actions} onViewOutput={() => openDetail(actions.lastRunId)}>
        <div className="flex items-start gap-2 border-b border-border p-3">
          <AgentAvatar provider={agent.provider} color={color} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{agent.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {PROVIDERS[agent.provider]?.label || agent.provider} · {roleLabel[agent.role] || agent.role}
            </div>
            {branch && (
              <div className="truncate font-mono text-[10px] text-muted-foreground" title={worktree?.path ?? branch}>
                {branch}
              </div>
            )}
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <StatusDot status={actions.status} />
              <span>
                {preparing
                  ? preparing
                  : actions.status === "waiting"
                    ? "Esperando a sus hijos"
                    : statusLabel[actions.status]}
              </span>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Cerrar" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </AgentContextMenu>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {binaryInfo === null && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            CLI no encontrado: configuralo en Agentes.
          </p>
        )}

        {actions.lastError && (
          <Section title="Último error">
            <p className="whitespace-pre-wrap break-words text-xs text-destructive">{actions.lastError}</p>
          </Section>
        )}

        {actions.currentTask && (
          <Section title="Tarea actual">
            <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{actions.currentTask}</p>
          </Section>
        )}

        {showLive && actions.currentRunId ? (
          <Section title="Actividad en vivo">
            <RunActivity runId={actions.currentRunId} />
          </Section>
        ) : (
          <Section title="Últimas tareas">
            {recentRuns.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todavía no corrió nada en este proyecto.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {recentRuns.map(run => (
                  <li key={run.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                    <StatusDot status={runDotStatus[run.status]} className="mt-1 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">{formatClock(run.startedAt)}</span>
                        <span>{runStatusLabel[run.status]}</span>
                      </div>
                      <p className="break-words text-xs" title={run.prompt}>
                        {truncate(run.prompt, 110)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 shrink-0 px-2 text-xs"
                      onClick={() => openDetail(run.id)}
                    >
                      Ver
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-2 p-3">
        <div className="grid grid-cols-2 gap-2">
          {actions.busy && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={actions.stop}
            >
              <Square className="h-3.5 w-3.5" /> Detener
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start"
            disabled={!actions.ready}
            onClick={actions.instruct}
          >
            <MessageSquareText className="h-3.5 w-3.5" /> Indicar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start"
            disabled={!actions.lastRunId}
            onClick={() => openDetail(actions.lastRunId)}
          >
            <FileText className="h-3.5 w-3.5" /> Ver salida
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start"
            disabled={!actions.ready}
            onClick={actions.openChat}
          >
            <MessageCircle className="h-3.5 w-3.5" /> Chatear
          </Button>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-7 px-2 text-xs text-muted-foreground")}
            disabled={!actions.ready}
            onClick={actions.resetSession}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reiniciar sesión
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={actions.editAgent}
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            disabled={!actions.ready}
            onClick={actions.duplicate}
          >
            <Copy className="h-3.5 w-3.5" /> Duplicar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={!actions.ready}
            onClick={actions.removeAgent}
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </Button>
        </div>
      </div>

      <AgentActionDialogs agent={agent} actions={actions} runId={detailRunId ?? actions.lastRunId} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}
