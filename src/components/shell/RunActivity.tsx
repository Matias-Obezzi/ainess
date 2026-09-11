// What an agent is doing right now (and what it did): streamed text, every tool call and the
// nested activity of the agents it delegated to. Fed by the `messages` feed, filtered by runId.
//
// Only the current step is on screen. A working agent writes a line per tool call and a long run
// writes hundreds, so the list of everything it had already finished pushed the conversation off
// the top of the screen and buried the one line worth reading. The steps run through a ticker
// instead — one line tall, the finished step leaving through the top as the new one arrives from
// below — and clicking it opens the history above. See `lib/activity-view` for what folds and why.
import { ProviderLogo } from "@/components/ProviderLogo";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { StatusDot } from "@/components/StatusDot";
import { Markdown } from "@/components/shell/Markdown";
import { ErrorMessage } from "@/components/ErrorMessage";
import { InlineApproval } from "@/components/InlineApproval";
import { toolIcon } from "@/lib/tool-summary";
import { runDotStatus, runStatusLabelKey } from "@/lib/labels";
import { activityView } from "@/lib/activity-view";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";
import { clip, formatElapsed, truncate } from "@/lib/format";
import type { CommMessage } from "@/types";
import { ChevronDown, ChevronUp, CornerDownRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Shimmer } from "@/components/ui/shimmer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactElement } from "react";

/** Kinds that belong in the activity stream (a `result` would just repeat the final answer). */
const ACTIVITY_KINDS = new Set(["text", "tool", "delegation", "error", "stderr", "system"]);

const FULL_ROWS = 30;
const COMPACT_ROWS = 6;

/**
 * How the activity is drawn.
 *
 * `live` is the thread: the ticker, with the history one click behind it. `full` is the panel a
 * finished run's "Actividad (23 pasos)" header already opens — that click *was* the request to see
 * everything, so folding it again behind a second one would be asking twice.
 */
export type ActivityMode = "live" | "full";

/** How long the leaving step stays mounted. Matches `step-out` in index.css. */
const STEP_EXIT_MS = 260;

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

export function activityByRun(messages: CommMessage[]): Map<string, CommMessage[]> {
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

/**
 * Everything the agent said during the run, as one piece of text.
 *
 * The stream is kept as a single `text-<runId>` message that grows, so in practice this is one
 * string; it is joined anyway because nothing guarantees a turn produced exactly one.
 */
export function useRunTranscript(runId: string): string {
  return useAppStore(state => {
    let text = "";
    for (const m of activityByRun(state.messages).get(runId) ?? NO_MESSAGES) {
      if (m.kind === "text") text = text ? `${text}\n${m.text}` : m.text;
    }
    return text;
  });
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

export function RunActivity({ runId, compact = false, mode = "live" }: { runId: string; compact?: boolean; mode?: ActivityMode }) {
  const t = useT();
  const rows = useRunMessages(runId);
  const run = useAppStore(state => state.runs[runId]);
  /** Whether the ticker's history is open. */
  const [open, setOpen] = useState(false);
  /** Second step: even opened, a run with hundreds of steps only draws its last `limit`. */
  const [showAll, setShowAll] = useState(false);

  const live = mode === "live";
  const view = useMemo(
    () => (live ? activityView(rows, open) : { rows, current: null, hidden: 0 }),
    [rows, live, open],
  );

  const limit = compact ? COMPACT_ROWS : FULL_ROWS;
  const shown = visibleActivityRows(view.rows, limit, showAll);
  const hiddenCount = view.rows.length - shown.length;

  const isRunning = run?.status === "running";

  if (rows.length === 0 && !isRunning) return null;

  return (
    <div className="flex flex-col gap-1">
      {hiddenCount > 0 && (
        <button
          type="button"
          className="self-start text-[11px] text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setShowAll(true)}
        >
          {compact ? t("activity.showAll", { n: hiddenCount }) : t("activity.moreSteps", { n: hiddenCount })}
        </button>
      )}

      {shown.map(msg => <ActivityRow key={msg.id} msg={msg} parentRunId={runId} mode={mode} />)}

      {/* Last, always: the ticker is the floor of the run, and the history opens above it so the
          line you were reading does not move out from under the pointer when you click it. */}
      {live && run && (view.current || isRunning) && (
        <ActivityTicker
          step={view.current}
          running={!!isRunning}
          startedAt={run.startedAt}
          open={open}
          hidden={view.hidden}
          onToggle={() => setOpen(o => !o)}
          label={open ? t("activity.collapse") : t("activity.expand")}
        />
      )}
    </div>
  );
}

function ActivityRow({ msg, parentRunId, mode }: { msg: CommMessage; parentRunId: string; mode: ActivityMode }) {
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

  if (msg.kind === "delegation") return <DelegationRow msg={msg} parentRunId={parentRunId} mode={mode} />;

  if (msg.kind === "error" || msg.kind === "stderr") {
    return <ErrorMessage text={msg.text} className="my-1" />;
  }

  return <div className="text-xs text-muted-foreground italic break-words">{msg.text}</div>;
}

/** A delegation: who got the task, plus that agent's own activity nested underneath. */
function DelegationRow({ msg, parentRunId, mode }: { msg: CommMessage; parentRunId: string; mode: ActivityMode }) {
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
        <RunActivity runId={childRun.id} compact mode={mode} />
      ) : (
        <div className="text-[11px] text-muted-foreground italic">{t("activity.waitingToStart")}</div>
      )}
    </div>
  );
}

/** Icon and text of one step, drawn on a single line. */
function TickerLine({ step, running }: { step: CommMessage | null; running: boolean }) {
  const t = useT();

  if (!step) {
    return <Shimmer className="truncate">{t("activity.thinking")}</Shimmer>;
  }

  const failed = step.kind === "tool" && step.meta?.failed;
  const Icon = step.kind === "tool" ? toolIcon(step.meta?.tool ?? step.text) : Info;
  // A failed call says so: its summary describes the call, not what became of it.
  const label = truncate(failed ? step.text : (step.meta?.summary ?? step.text), 90);

  return (
    <>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", failed && "text-amber-600 dark:text-amber-400")} />
      {running
        ? <Shimmer className="truncate">{label}</Shimmer>
        : <span className={cn("truncate", failed && "text-amber-600 dark:text-amber-400")}>{label}</span>}
    </>
  );
}

/**
 * The one line that stands for everything the agent is doing, and the handle for the rest.
 *
 * The window is a single row tall with its overflow hidden, so a new step arriving pushes the last
 * one out through the top. The movement is the point: a line that swaps its text in place looks
 * the same whether it changed once or forty times, and "is this thing still going" was the
 * question people were asking of a wall of static text. The step on its way out stays mounted for
 * as long as it takes to leave and not a frame longer.
 */
function ActivityTicker({ step, running, startedAt, open, hidden, onToggle, label }: {
  step: CommMessage | null;
  running: boolean;
  startedAt: number;
  open: boolean;
  hidden: number;
  onToggle: () => void;
  label: string;
}) {
  const t = useT();
  const [leaving, setLeaving] = useState<CommMessage | null>(null);
  const previous = useRef<CommMessage | null>(step);

  // Layout, not effect: the outgoing step has to be in the same paint as the incoming one, or it
  // flashes back into the row it already left before starting to animate away.
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = step;
    if (!before || !step || before.id === step.id) return;
    setLeaving(before);
    const timer = setTimeout(() => setLeaving(null), STEP_EXIT_MS);
    return () => clearTimeout(timer);
  }, [step?.id]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // A run that ended is not counting: no timer, and nothing re-rendering once a second.
    if (!running) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const Chevron = open ? ChevronDown : ChevronUp;
  const full = step ? (step.meta?.failed && step.meta?.error ? `${step.text}\n\n${step.meta.error}` : step.text) : "";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="group flex w-full items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
    >
      <StepTooltip text={full}>
        <span className="relative block h-4 min-w-0 flex-1 overflow-hidden">
          {leaving && (
            <span
              key={`out-${leaving.id}`}
              className="animate-step-out absolute inset-x-0 top-0 flex h-4 items-center gap-1.5 font-mono leading-4"
            >
              <TickerLine step={leaving} running={false} />
            </span>
          )}
          <span
            key={`in-${step?.id ?? "idle"}`}
            className="animate-step-in absolute inset-x-0 top-0 flex h-4 items-center gap-1.5 font-mono leading-4"
          >
            <TickerLine step={step} running={running} />
          </span>
        </span>
      </StepTooltip>

      {/* What is behind the line, so a collapsed ticker still says there is something to open. */}
      {!open && hidden > 0 && (
        <span className="shrink-0 text-[10px] tabular-nums">
          {plural(hidden, t("activity.stepsHidden.one", { n: hidden }), t("activity.stepsHidden.other", { n: hidden }))}
        </span>
      )}
      {running && <span className="shrink-0 tabular-nums">{formatElapsed((now - startedAt) / 1000)}</span>}
      <Chevron className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
      {/* Last, so the button reads "<what it is doing>, show previous steps". An aria-label would
          have named it that and nothing else, losing the step it is showing. */}
      <span className="sr-only">{label}</span>
    </button>
  );
}
