// What an agent is doing right now (and what it did): streamed text, every tool call and the
// nested activity of the agents it delegated to. Fed by the `messages` feed, filtered by runId.
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store";
import { StatusDot } from "@/components/StatusDot";
import { Markdown } from "@/components/shell/Markdown";
import { toolIcon } from "@/lib/tool-summary";
import { runDotStatus, runStatusLabel } from "@/lib/labels";
import { formatElapsed, truncate } from "@/lib/format";
import type { CommMessage } from "@/types";
import { CornerDownRight } from "lucide-react";

/** Kinds that belong in the activity stream (a `result` would just repeat the final answer). */
const ACTIVITY_KINDS = new Set(["text", "tool", "delegation", "error", "stderr", "system"]);

const FULL_ROWS = 30;
const COMPACT_ROWS = 6;

/** Messages of one run, in arrival order. */
function useRunMessages(runId: string): CommMessage[] {
  const messages = useAppStore(state => state.messages);
  return useMemo(
    () => messages.filter(m => m.runId === runId && ACTIVITY_KINDS.has(m.kind)),
    [messages, runId],
  );
}

/** How many steps (tools, delegations, errors) a run has taken. Used for the "Actividad" header. */
export function useActivityCount(runId: string): number {
  const messages = useRunMessages(runId);
  return useMemo(() => messages.filter(m => m.kind !== "text").length, [messages]);
}

export function RunActivity({ runId, compact = false, showFooter = true }: { runId: string; compact?: boolean; showFooter?: boolean }) {
  const rows = useRunMessages(runId);
  const run = useAppStore(state => state.runs[runId]);
  const [expanded, setExpanded] = useState(false);

  const limit = compact ? COMPACT_ROWS : FULL_ROWS;
  // The streamed text is never folded away: only the steps around it are.
  const shown = !expanded && rows.length > limit
    ? rows.filter((m, i) => i >= rows.length - limit || m.kind === "text")
    : rows;
  const hiddenCount = rows.length - shown.length;

  const isRunning = run?.status === "running";
  const lastTool = [...rows].reverse().find(m => m.kind === "tool");

  if (rows.length === 0 && !isRunning) return null;

  return (
    <div className="flex flex-col gap-1">
      {hiddenCount > 0 && (
        <button
          type="button"
          className="self-start text-[11px] text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setExpanded(true)}
        >
          {compact ? `Ver todo (${hiddenCount} pasos más)` : `… ${hiddenCount} pasos más`}
        </button>
      )}

      {shown.map(msg => <ActivityRow key={msg.id} msg={msg} parentRunId={runId} />)}

      {showFooter && isRunning && run && <ActivityFooter startedAt={run.startedAt} label={lastTool?.meta?.summary ?? lastTool?.text} />}
    </div>
  );
}

function ActivityRow({ msg, parentRunId }: { msg: CommMessage; parentRunId: string }) {
  if (msg.kind === "text") return <Markdown text={msg.text} />;

  if (msg.kind === "tool") {
    const Icon = toolIcon(msg.meta?.tool ?? msg.text);
    return (
      <div className="flex items-start gap-1.5 font-mono text-xs text-muted-foreground" title={msg.text}>
        <Icon className="h-3.5 w-3.5 shrink-0 mt-[1px]" />
        <span className="break-all">{msg.meta?.summary ?? msg.text}</span>
      </div>
    );
  }

  if (msg.kind === "delegation") return <DelegationRow msg={msg} parentRunId={parentRunId} />;

  if (msg.kind === "error" || msg.kind === "stderr") {
    return <div className="text-xs text-destructive break-words whitespace-pre-wrap">{msg.text}</div>;
  }

  return <div className="text-xs text-muted-foreground italic break-words">{msg.text}</div>;
}

/** A delegation: who got the task, plus that agent's own activity nested underneath. */
function DelegationRow({ msg, parentRunId }: { msg: CommMessage; parentRunId: string }) {
  const agents = useAppStore(state => state.config.agents);
  const runs = useAppStore(state => state.runs);

  const childRun = useMemo(() => {
    if (!msg.toAgentId) return undefined;
    return Object.values(runs)
      .filter(r => r.parentRunId === parentRunId && r.agentId === msg.toAgentId)
      .sort((a, b) => b.startedAt - a.startedAt)[0];
  }, [runs, parentRunId, msg.toAgentId]);

  const agent = agents.find(a => a.id === msg.toAgentId);
  const name = agent?.name ?? msg.toAgentId ?? "?";

  return (
    <div className="my-1 rounded-md border border-border bg-background/40 p-2 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs">
        <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {childRun && <StatusDot status={runDotStatus[childRun.status]} />}
        <span className="font-medium shrink-0">{name}</span>
        <span className="text-muted-foreground truncate" title={msg.text}>{truncate(msg.text, 90)}</span>
        {childRun && childRun.status !== "running" && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{runStatusLabel[childRun.status]}</span>
        )}
      </div>
      {childRun ? (
        <RunActivity runId={childRun.id} compact />
      ) : (
        <div className="text-[11px] text-muted-foreground italic">Esperando a que arranque…</div>
      )}
    </div>
  );
}

/** Pulsing footer with the current step and the elapsed time. */
function ActivityFooter({ startedAt, label }: { startedAt: number; label?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
      <span className="truncate">{label ? truncate(label, 70) : "Pensando…"}</span>
      <span className="ml-auto shrink-0 tabular-nums">{formatElapsed((now - startedAt) / 1000)}</span>
    </div>
  );
}
