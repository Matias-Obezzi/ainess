import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/StatusDot";
import { RunDetailDialog } from "@/components/RunDetailDialog";
import { Markdown } from "@/components/shell/Markdown";
import { RunActivity, useActivityCount } from "@/components/shell/RunActivity";
import { runDotStatus, runStatusLabel } from "@/lib/labels";
import { formatClock, formatElapsed, truncate } from "@/lib/format";
import type { Run } from "@/types";
import { ArrowDown, ChevronDown, ChevronRight, MessagesSquare } from "lucide-react";

/** Output longer than this is folded behind "Ver más". */
const COLLAPSED_OUTPUT_LINES = 12;
/** While something streams in, follow the bottom at most this often. */
const FOLLOW_INTERVAL_MS = 150;

/** The project's main conversation: what the user asked and what the team answered. */
export function OrchestratorThread() {
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const runs = useAppStore(state => state.runs);
  const historyLoading = useAppStore(state => currentProjectId ? state.historyLoading[currentProjectId] : false);
  const hasRunning = useAppStore(state =>
    Object.values(state.runs).some(r => r.projectId === currentProjectId && r.status === "running"),
  );

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

  // A run streams dozens of deltas per second: follow the bottom on a timer (and inside a frame)
  // instead of scrolling on every one of them.
  useEffect(() => {
    if (!hasRunning || !stickToBottom) return;
    const interval = setInterval(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 4) return;
        bottomRef.current?.scrollIntoView({ block: "end" });
      });
    }, FOLLOW_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasRunning, stickToBottom]);

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
  const [activityOpen, setActivityOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const steps = useActivityCount(run.id);

  const isRunning = run.status === "running";
  const agent = agents.find(a => a.id === run.agentId);
  const agentName = (id: string) => agents.find(a => a.id === id)?.name ?? id;

  // Direct delegations of this run (a continuation round has its own children).
  const children = useMemo(
    () => Object.values(runs).filter(r => r.parentRunId === run.id).sort((a, b) => a.startedAt - b.startedAt),
    [runs, run.id],
  );

  const isLong = (run.output || "").split("\n").length > COLLAPSED_OUTPUT_LINES;
  const elapsed = formatElapsed(((run.endedAt ?? Date.now()) - run.startedAt) / 1000);

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
          <StatusDot status={runDotStatus[run.status]} />
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
          <RunActivity runId={run.id} />
        ) : (
          <>
            {steps > 0 && (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="self-start flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setActivityOpen(o => !o)}
                >
                  {activityOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Actividad ({steps} paso{steps === 1 ? "" : "s"} · {elapsed})
                </button>
                {activityOpen && (
                  <div className="rounded-md border border-border bg-background/40 p-2">
                    <RunActivity runId={run.id} showFooter={false} />
                  </div>
                )}
              </div>
            )}

            {run.output ? (
              <div className={!expanded && isLong ? "max-h-64 overflow-hidden" : undefined}>
                <Markdown text={run.output} />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">Sin salida</div>
            )}

            {isLong && (
              <button
                type="button"
                className="self-start text-xs text-primary hover:underline"
                onClick={() => setExpanded(e => !e)}
              >
                {expanded ? "Ver menos" : "Ver más"}
              </button>
            )}
          </>
        )}

        {children.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {children.map(c => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px]"
                title={c.prompt}
              >
                <StatusDot status={runDotStatus[c.status]} />
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
