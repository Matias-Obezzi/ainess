// What an agent is doing right now (and what it did): streamed text, every tool call and the
// nested activity of the agents it delegated to. Fed by the `messages` feed, filtered by runId.
import { ProviderLogo } from "@/components/ProviderLogo";
import { useEffect, useMemo, useState } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { StatusDot } from "@/components/StatusDot";
import { Markdown } from "@/components/shell/Markdown";
import { ErrorMessage } from "@/components/ErrorMessage";
import { InlineApproval } from "@/components/InlineApproval";
import { toolIcon } from "@/lib/tool-summary";
import { runDotStatus, runStatusLabelKey } from "@/lib/labels";
import { useT } from "@/i18n/useT";
import { clip, formatElapsed, truncate } from "@/lib/format";
import type { CommMessage } from "@/types";
import { CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/ui/shimmer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactElement } from "react";

/** Kinds that belong in the activity stream (a `result` would just repeat the final answer). */
const ACTIVITY_KINDS = new Set(["text", "tool", "delegation", "error", "stderr", "system"]);

const FULL_ROWS = 30;
const COMPACT_ROWS = 6;

/**
 * How much of a step the tooltip will show.
 *
 * Generous, because the whole point is reading the call the row had to cut short — but not
 * unbounded: a tooltip is not scrollable, so past a screenful it stops being something you can read
 * and starts being something covering the screen. What does not fit lives in the raw view.
 */
const STEP_TOOLTIP_MAX = 1600;

/**
 * The full text of a step, on hover.
 *
 * These rows are cut short in every direction — a tool line shows its summary, a delegation shows
 * ninety characters of the task — and the way to read the rest was the browser's own `title`: a
 * second of waiting, a bare box wherever the pointer happened to be, whitespace collapsed and no
 * way to style what came out. This is the app's tooltip instead: monospace, line breaks kept,
 * anchored to the row it belongs to.
 */
function StepTooltip({ text, children }: { text: string; children: ReactElement }) {
  // Nothing to add is not a tooltip: an empty black box following the pointer around is worse than
  // no affordance at all.
  if (!text.trim()) return children;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        collisionPadding={8}
        className="max-w-[min(38rem,80vw)] whitespace-pre-wrap break-words text-left font-mono text-[11px] leading-relaxed"
      >
        {clip(text, STEP_TOOLTIP_MAX)}
      </TooltipContent>
    </Tooltip>
  );
}

const NO_MESSAGES: CommMessage[] = [];

/**
 * The whole feed grouped by run, rebuilt once per `messages` identity and shared by every
 * component on screen (a thread can hold hundreds of bubbles and a run streams many deltas
 * per second, so one pass beats one filter per bubble).
 */
let indexCache: { messages: CommMessage[]; byRun: Map<string, CommMessage[]> } | null = null;

function activityByRun(messages: CommMessage[]): Map<string, CommMessage[]> {
  if (indexCache && indexCache.messages === messages) return indexCache.byRun;
  const byRun = new Map<string, CommMessage[]>();
  for (const m of messages) {
    if (!m.runId || !ACTIVITY_KINDS.has(m.kind)) continue;
    const list = byRun.get(m.runId);
    if (list) list.push(m);
    else byRun.set(m.runId, [m]);
  }
  indexCache = { messages, byRun };
  return byRun;
}

/** Messages of one run, in arrival order. */
function useRunMessages(runId: string): CommMessage[] {
  const messages = useAppStore(state => state.messages);
  return useMemo(() => activityByRun(messages).get(runId) ?? NO_MESSAGES, [messages, runId]);
}

/** How many steps (tools, delegations, errors) a run has taken. Used for the "Actividad" header. */
export function useActivityCount(runId: string): number {
  // A number, not an array: a finished bubble then only re-renders when its own count moves.
  return useAppStore(state => {
    let count = 0;
    for (const m of activityByRun(state.messages).get(runId) ?? NO_MESSAGES) {
      if (m.kind !== "text") count++;
    }
    return count;
  });
}

/**
 * The rows actually rendered: only the last `limit` ones once there are too many, except the
 * streamed text, which is never folded away.
 */
export function visibleActivityRows<T extends { kind: string }>(rows: T[], limit: number, expanded: boolean): T[] {
  if (expanded || rows.length <= limit) return rows;
  return rows.filter((m, i) => i >= rows.length - limit || m.kind === "text");
}

export function RunActivity({ runId, compact = false, showFooter = true }: { runId: string; compact?: boolean; showFooter?: boolean }) {
  const t = useT();
  const rows = useRunMessages(runId);
  const run = useAppStore(state => state.runs[runId]);
  const [expanded, setExpanded] = useState(false);

  const limit = compact ? COMPACT_ROWS : FULL_ROWS;
  const shown = visibleActivityRows(rows, limit, expanded);
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
          {compact ? t("activity.showAll", { n: hiddenCount }) : t("activity.moreSteps", { n: hiddenCount })}
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
    const isFailed = msg.meta?.failed;
    const full = isFailed && msg.meta?.error ? `${msg.text}\n\n${msg.meta.error}` : msg.text;
    const colorClass = isFailed ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground";
    return (
      <StepTooltip text={full}>
        <div className={cn("flex items-start gap-1.5 font-mono text-xs", colorClass)}>
          <Icon className="h-3.5 w-3.5 shrink-0 mt-[1px]" />
          {/* A failed call says so: its summary describes the call, not what became of it. */}
          <span className="break-all">{isFailed ? msg.text : (msg.meta?.summary ?? msg.text)}</span>
        </div>
      </StepTooltip>
    );
  }

  if (msg.kind === "delegation") return <DelegationRow msg={msg} parentRunId={parentRunId} />;

  if (msg.kind === "error" || msg.kind === "stderr") {
    return <ErrorMessage text={msg.text} className="my-1" />;
  }

  return <div className="text-xs text-muted-foreground italic break-words">{msg.text}</div>;
}

/** A delegation: who got the task, plus that agent's own activity nested underneath. */
function DelegationRow({ msg, parentRunId }: { msg: CommMessage; parentRunId: string }) {
  const t = useT();
  const agents = useAppStore(selectAllAgents);
  const runs = useAppStore(state => state.runs);

  const childRun = useMemo(() => {
    if (!msg.toAgentId) return undefined;
    return Object.values(runs)
      .filter(r => r.parentRunId === parentRunId && r.agentId === msg.toAgentId)
      .sort((a, b) => b.startedAt - a.startedAt)[0];
  }, [runs, parentRunId, msg.toAgentId]);

  const agent = agents.find(a => a.id === msg.toAgentId);
  const name = agent?.name ?? msg.toAgentId ?? "?";

  // A delegation that is waiting for a yes is answered right here, where it was read. It used to
  // live in a bar across the top of the screen, away from the thing it was about.
  const pending = useAppStore(state =>
    Object.values(state.approvals).find(a =>
      a.status === "pending" && a.payload.parentRunId === parentRunId && a.toAgentId === msg.toAgentId,
    ),
  );

  return (
    <div className="my-1 rounded-md border border-border bg-background/40 p-2 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs">
        <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {childRun && <StatusDot status={runDotStatus[childRun.status]} />}
        {agent && <ProviderLogo provider={agent.provider} size={14} />}
        <span className="font-medium shrink-0">{name}</span>
        <StepTooltip text={msg.text}>
          <span className="text-muted-foreground truncate">{truncate(msg.text, 90)}</span>
        </StepTooltip>
        {childRun && childRun.status !== "running" && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{t(runStatusLabelKey[childRun.status])}</span>
        )}
      </div>
      {/* Under the line it is about, across the whole card: beside it, the question and the task it
          asks about were squeezed into half a phone screen each. */}
      {pending && <InlineApproval approvalId={pending.id} />}
      {childRun ? (
        <RunActivity runId={childRun.id} compact />
      ) : (
        <div className="text-[11px] text-muted-foreground italic">{t("activity.waitingToStart")}</div>
      )}
    </div>
  );
}

/**
 * The foot of a run that is still going: the step it is on, and how long it has been at it.
 *
 * The light sweeping across the line is the "alive" of it — a run that ended has no footer at
 * all, so nothing moves once there is nothing happening.
 */
function ActivityFooter({ startedAt, label }: { startedAt: number; label?: string }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <StepTooltip text={label ?? ""}>
        <Shimmer className="truncate">
          {label ? truncate(label, 70) : t("activity.thinking")}
        </Shimmer>
      </StepTooltip>
      <span className="ml-auto shrink-0 tabular-nums">{formatElapsed((now - startedAt) / 1000)}</span>
    </div>
  );
}
