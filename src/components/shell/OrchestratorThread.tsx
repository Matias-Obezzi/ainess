import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/StatusDot";
import { RunDetailDialog } from "@/components/RunDetailDialog";
import { formatClock, formatElapsed, truncate } from "@/lib/format";
import type { AgentStatus, Run, RunStatus } from "@/types";
import { ArrowDown, MessagesSquare } from "lucide-react";

/** How a run's status shows up on the little colored dot. */
const dotStatus: Record<RunStatus, AgentStatus> = {
  running: "working",
  done: "idle",
  error: "error",
  killed: "stopped",
};

const runStatusLabel: Record<RunStatus, string> = {
  running: "En curso",
  done: "Terminada",
  error: "Error",
  killed: "Detenida",
};

const MAX_COLLAPSED_LINES = 12;

/** The project's main conversation: what the user asked and what the team answered. */
export function OrchestratorThread() {
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const runs = useAppStore(state => state.runs);
  const historyLoading = useAppStore(state => currentProjectId ? state.historyLoading[currentProjectId] : false);

  const rootRuns = useMemo(
    () => Object.values(runs)
      .filter(r => r.projectId === currentProjectId && r.parentRunId === null && r.kind !== "chat")
      .sort((a, b) => a.startedAt - b.startedAt),
    [runs, currentProjectId],
  );

  const [stickToBottom, setStickToBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(rootRuns.length);

  useEffect(() => {
    if (rootRuns.length > prevCount.current) {
      if (stickToBottom) bottomRef.current?.scrollIntoView();
      else setHasNewMessages(true);
    }
    prevCount.current = rootRuns.length;
  }, [rootRuns.length, stickToBottom]);

  const onScroll = () => {
    if (!scrollRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setStickToBottom(atBottom);
    if (atBottom) setHasNewMessages(false);
  };

  const scrollToBottom = () => {
    setStickToBottom(true);
    setHasNewMessages(false);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4">
        {historyLoading ? (
          <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            <RunBubbleSkeleton />
            <RunBubbleSkeleton />
          </div>
        ) : rootRuns.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="Todavía no hay tareas en este proyecto"
            description='Escribí abajo qué querés que haga el equipo. El planificador (Claude) analiza, delega a los implementadores y te responde acá. Ejemplo: «Agregá tests para el módulo de autenticación y arreglá lo que falle.»'
            className="h-full"
          />
        ) : (
          <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            {rootRuns.map(run => <RunBubble key={run.id} run={run} />)}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {!stickToBottom && hasNewMessages && (
        <Button size="sm" className="absolute bottom-4 right-4 rounded-full shadow-md z-10 gap-2" onClick={scrollToBottom}>
          <ArrowDown className="h-4 w-4" /> Nuevos mensajes
        </Button>
      )}
    </div>
  );
}

function RunBubbleSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col items-end gap-1">
        <Skeleton className="h-8 w-48 rounded-lg" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  );
}

function RunBubble({ run }: { run: Run }) {
  const agents = useAppStore(state => state.config.agents);
  const runs = useAppStore(state => state.runs);
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  const isRunning = run.status === "running";
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const agent = agents.find(a => a.id === run.agentId);
  const agentName = (id: string) => agents.find(a => a.id === id)?.name ?? id;

  // Direct delegations of this run (a continuation round has its own children).
  const children = useMemo(
    () => Object.values(runs).filter(r => r.parentRunId === run.id).sort((a, b) => a.startedAt - b.startedAt),
    [runs, run.id],
  );

  const lines = (run.output || "").split("\n");
  const isLong = lines.length > MAX_COLLAPSED_LINES;
  const shownOutput = !expanded && isLong ? lines.slice(0, MAX_COLLAPSED_LINES).join("\n") : run.output;

  return (
    <div className="flex flex-col gap-2">
      {/* A round > 0 run is an automatic continuation, not something the user typed. */}
      {run.round === 0 && (
        <div className="flex flex-col items-end gap-1">
          <div className="rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap break-words bg-primary text-primary-foreground">
            {run.prompt}
          </div>
          <span className="text-[11px] text-muted-foreground">
            → {agentName(run.agentId)}
            {run.model ? ` · ${run.model}` : ""} · {formatClock(run.startedAt)}
          </span>
        </div>
      )}

      <div
        className="rounded-lg bg-muted px-3 py-2 flex flex-col gap-2 max-w-[95%] self-start w-full"
        style={{ borderLeft: `3px solid ${agent?.color || "#888"}` }}
      >
        <div className="flex items-center gap-2 text-xs">
          <StatusDot status={dotStatus[run.status]} />
          <span className="font-medium">{agent?.name ?? run.agentId}</span>
          {run.round > 0 && <Badge variant="outline" className="text-[10px]">Ronda {run.round + 1}</Badge>}
          {(run.status === "error" || run.status === "killed") && (
            <Badge variant={run.status === "error" ? "destructive" : "secondary"} className="text-[10px]">
              {runStatusLabel[run.status]}
            </Badge>
          )}
          <span className="ml-auto text-muted-foreground">{formatClock(run.startedAt)}</span>
        </div>

        {isRunning ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Trabajando… <span className="tabular-nums">{formatElapsed((now - run.startedAt) / 1000)}</span>
          </div>
        ) : (
          <div className="text-sm whitespace-pre-wrap break-words">
            {shownOutput || <span className="text-muted-foreground italic">Sin salida</span>}
          </div>
        )}

        {!isRunning && isLong && (
          <button
            type="button"
            className="self-start text-xs text-primary hover:underline"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? "Ver menos" : `Ver más (${lines.length} líneas)`}
          </button>
        )}

        {children.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {children.map(c => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px]"
                title={c.prompt}
              >
                <StatusDot status={dotStatus[c.status]} />
                <span className="font-medium">{agentName(c.agentId)}:</span>
                <span className="text-muted-foreground">{truncate(c.prompt, 60)}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setDetailOpen(true)}>
            Detalles
          </Button>
        </div>
      </div>

      <RunDetailDialog runId={run.id} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
