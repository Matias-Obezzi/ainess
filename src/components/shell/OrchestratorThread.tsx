import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AgentAvatar } from "@/components/ProviderLogo";
import { ProjectMascot } from "@/components/ProjectMascot";
import { mascotMood } from "@/lib/mascot";
import { useAppStore, selectAllAgents, selectProjectAgents } from "@/store";
import { stickToBottom as stick, isAtBottom, resetScrolledAncestors } from "@/lib/stick-to-bottom";
import { windowOf, isNearBottom } from "@/lib/feed-window";
import { QueuedMessages } from "./QueuedMessages";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RunDetailDialog } from "@/components/RunDetailDialog";
import { RetryRunDialog } from "@/components/RetryRunDialog";
import { QuotaCard } from "@/components/QuotaCard";
import { outOfQuota } from "@/lib/quota";
import { retriedLater } from "@/lib/quota-card";
import { shownRootRuns } from "@/lib/retry";
import { retryRun } from "@/lib/orchestrator";
import { ContextActionItems, type MenuAction } from "@/components/menu-actions";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Markdown } from "@/components/shell/Markdown";
import { cn } from "@/lib/utils";
import { RunActivity, useActivityCount, useRunTranscript } from "@/components/shell/RunActivity";
import { runAnswer } from "@/lib/run-answer";
import { QuestionGroup } from "@/components/InlineQuestion";
import { runUsageText } from "@/components/UsageDialog";
import { runStatusLabelKey } from "@/lib/labels";
import { useT, useLocale, type TFunction } from "@/i18n/useT";
import { plural } from "@/i18n";
import { interruptedOutput } from "@/lib/history";
import { formatClock, formatElapsed } from "@/lib/format";
import { copyText } from "@/lib/clipboard";
import { hasMarkdown, toPlainText } from "@/lib/text";
import { createTaskFromMessage } from "@/lib/task-from-message";
import type { Run } from "@/types";
import { ArrowDown, ChevronDown, ChevronRight, Copy, FileCode, FileText, ListTodo, MessagesSquare, RotateCw, Sparkles } from "lucide-react";
import { isLiveRun, isFinishedRun } from "@/lib/run-queue";
import { isForUser } from "@/lib/pending-question";
import { useCurrentProjectId } from "./project-pane";

/** While something streams in, follow the bottom at most this often. */
const FOLLOW_INTERVAL_MS = 150;

/** The project's main conversation: what the user asked and what the team answered. */
/** History can name an agent that the project no longer has (a rebuilt team, a deleted agent). */
const pastAgent = (t: TFunction) => t("home.formerAgent");

export function OrchestratorThread() {
  const t = useT();
  const currentProjectId = useCurrentProjectId();
  const runs = useAppStore(state => state.runs);
  const historyLoading = useAppStore(state => currentProjectId ? state.historyLoading[currentProjectId] : false);
  const hasRunning = useAppStore(state =>
    Object.values(state.runs).some(r => r.projectId === currentProjectId && isLiveRun(r.status)),
  );
  const focusedMessageId = useAppStore(state => state.focusedMessageId);

  const [limit, setLimit] = useState(20);

  useEffect(() => {
    setLimit(20);
  }, [currentProjectId]);

  // Written while an agent was working: it has not been handed over yet, and until now the thread
  // gave no sign of it.
  const runtime = useAppStore(state => currentProjectId ? state.runtime[currentProjectId] : undefined);
  const agents = useAppStore(state => selectProjectAgents(state, currentProjectId));
  // Only for the mascot on the empty thread: it needs the project's colour and the face of whoever
  // would answer first.
  const project = useAppStore(state => state.config.projects.find(p => p.id === currentProjectId));
  const planner = agents.find(a => a.role === "planner");
  // And, when it is set to stay on screen, what it acts out: the planner is who answers first, so
  // it is the one the creature stands for.
  const mascotAlways = useAppStore(state => state.config.mascotAlways ?? false);
  const plannerId = planner?.id;
  const plannerOutOfTokens = useAppStore(state =>
    Object.values(state.quotaWaiting).some(w => w.projectId === currentProjectId && w.agentId === plannerId),
  );
  const mood = plannerId ? mascotMood(runtime?.[plannerId], plannerOutOfTokens) : undefined;
  const unqueueInstruction = useAppStore(state => state.unqueueInstruction);
  const sendInstructionNow = useAppStore(state => state.sendInstructionNow);
  // A block per agent: what is waiting for one of them goes over as a single message, and what is
  // waiting for another is a different message on a different turn.
  const queued = useMemo(() => {
    if (!runtime || !currentProjectId) return [];
    return agents.map(agent => ({
      // Only worth naming when the project has more than one agent to send to.
      to: agents.length > 1 ? agent.name : undefined,
      lines: (runtime[agent.id]?.queuedInstructions ?? []).map((text, index) => ({
        text,
        onCancel: () => unqueueInstruction(currentProjectId, agent.id, index),
      })),
      onSendNow: () => void sendInstructionNow(currentProjectId, agent.id),
    }));
  }, [runtime, agents, currentProjectId, unqueueInstruction, sendInstructionNow]);

  // A retried run takes the place of the one it replaced instead of landing at the bottom, and
  // that one stops being drawn: see `shownRootRuns`.
  const rootRuns = useMemo(
    () => shownRootRuns(
      Object.values(runs).filter(r => r.projectId === currentProjectId && r.parentRunId === null && r.kind !== "chat"),
    ),
    [runs, currentProjectId],
  );

  // Only the tail of the feed is drawn, so a turn the search palette points at can sit outside the
  // window — and what is not in the DOM cannot be scrolled to. The window is stretched back just
  // far enough to reach it, which is the whole point of the jump; "show older" is left with
  // whatever is still hidden behind it.
  const focusedAt = focusedMessageId ? rootRuns.findIndex(r => r.id === focusedMessageId) : -1;
  const reach = focusedAt >= 0 ? Math.max(limit, rootRuns.length - focusedAt) : limit;

  const { shown: shownRuns, hidden: hiddenRuns } = windowOf(rootRuns, reach);

  const prevScrollHeightRef = useRef<number | null>(null);

  const handleShowOlder = () => {
    if (scrollRef.current) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight;
    }
    setLimit(l => l + 20);
  };

  useLayoutEffect(() => {
    if (prevScrollHeightRef.current !== null && scrollRef.current) {
      const newScrollHeight = scrollRef.current.scrollHeight;
      scrollRef.current.scrollTop += (newScrollHeight - prevScrollHeightRef.current);
      prevScrollHeightRef.current = null;
    }
  }, [shownRuns.length]);

  const [stickToBottom, setStickToBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(rootRuns.length);

  // The bubble clears `focusedMessageId` when its flash ends, and that must not read as "a project
  // was just opened": the turn it took you to stays where it is. Holds the project the jump
  // happened in, so moving to another one still lands on its newest turn.
  const jumpedIn = useRef<string | null>(null);

  // Opening a project (or finishing its first load) lands on the newest turn, not the oldest,
  // unless a specific turn was requested by the search palette.
  useEffect(() => {
    if (historyLoading) return;
    if (focusedMessageId) {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${focusedMessageId}"]`);
      if (el) {
        jumpedIn.current = currentProjectId;
        setStickToBottom(false);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    if (jumpedIn.current !== null && jumpedIn.current === currentProjectId) {
      jumpedIn.current = null;
      return;
    }
    const id = requestAnimationFrame(() => stick(scrollRef.current));
    return () => cancelAnimationFrame(id);
  }, [currentProjectId, historyLoading, focusedMessageId]);

  // Which project the count above belongs to: another project is another bottom, and its turns are
  // not turns arriving here.
  const countedIn = useRef(currentProjectId);

  useEffect(() => {
    if (countedIn.current !== currentProjectId) {
      countedIn.current = currentProjectId;
      prevCount.current = rootRuns.length;
      return;
    }
    if (rootRuns.length > prevCount.current) {
      // A turn of your own lands at the bottom, so that is where you are taken. A round > 0 run is
      // an automatic continuation, not something the user typed, and reading back through those is
      // exactly what must keep working. Not while the search palette is taking you somewhere: that
      // jump owns the scroll until its flash ends.
      const mine = !focusedMessageId && rootRuns[rootRuns.length - 1]?.round === 0;
      if (mine) {
        setStickToBottom(true);
        setNewCount(0);
      }
      if (stickToBottom || mine) stick(scrollRef.current, mine ? "smooth" : "auto");
      else setNewCount(n => n + (rootRuns.length - prevCount.current));
    }
    prevCount.current = rootRuns.length;
  // `focusedMessageId` is read above but not watched: a flash ending is not a turn arriving.
  }, [rootRuns.length, currentProjectId, stickToBottom]);

  // A run streams dozens of deltas per second: follow the bottom on a timer (and inside a frame)
  // instead of scrolling on every one of them.
  //
  // `stick` and not `scrollIntoView`: this is the loop that runs while a message is being answered,
  // and `scrollIntoView` scrolls every scroll container above the element as well — including the
  // `overflow: hidden` ones, which have no scrollbar to put back. See `lib/stick-to-bottom.ts`.
  useEffect(() => {
    if (!hasRunning || !stickToBottom) return;
    const interval = setInterval(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el || isAtBottom(el)) return;
        stick(el);
        // Nothing above a thread is meant to scroll, so if something did, this is where it shows.
        resetScrolledAncestors(el, "thread");
      });
    }, FOLLOW_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasRunning, stickToBottom]);

  /**
   * A change of height (the phone's keyboard or URL bar, a rotation, the dock being resized)
   * moves the content under the viewport and the browser fires a scroll for it. Read as a user
   * scrolling up, that unpinned the thread and left the conversation jumping around mid-task, so
   * the scroll that belongs to a resize is ignored and the bottom is taken back.
   */
  const stickRef = useRef(stickToBottom);
  stickRef.current = stickToBottom;
  const lastHeight = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      lastHeight.current = el.clientHeight;
      if (stickRef.current) stick(el);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    if (!scrollRef.current) return;
    // A frame fires the scroll before the observer above runs, so telling the two apart cannot
    // wait for it: a different height means this scroll came with the resize, not from a finger.
    if (scrollRef.current.clientHeight !== lastHeight.current) {
      lastHeight.current = scrollRef.current.clientHeight;
      return;
    }
    const atBottom = isNearBottom(scrollRef.current);
    setStickToBottom(atBottom);
    if (atBottom) setNewCount(0);
  };

  const scrollToBottom = () => {
    setStickToBottom(true);
    setNewCount(0);
    stick(scrollRef.current, "smooth");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4">
        {historyLoading ? (
          <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            <RunBubbleSkeleton />
            <RunBubbleSkeleton />
          </div>
        ) : rootRuns.length === 0 && queued.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            visual={project && <ProjectMascot projectId={project.id} projectName={project.name} color={project.color} provider={planner?.provider} mood={mood} size={128} className="mb-2" />}
            title={t("thread.empty.title")}
            description={t("thread.empty.body")}
            className="h-full"
          />
        ) : (
          <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            {hiddenRuns > 0 && (
              <div className="flex justify-center pb-2">
                <Button variant="ghost" size="sm" className="text-xs" onClick={handleShowOlder}>
                  {t("thread.showOlder", { n: hiddenRuns })}
                </Button>
              </div>
            )}
            {shownRuns.map(run => <RunBubble key={run.id} run={run} />)}
            <QueuedMessages groups={queued} />
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Set to stay, it watches from the corner of a thread that already has something in it. On
          the left, because the button back to the bottom owns the other corner. */}
      {mascotAlways && project && !historyLoading && (rootRuns.length > 0 || queued.length > 0) && (
        <ProjectMascot
          projectId={project.id}
          projectName={project.name}
          color={project.color}
          mood={mood}
          size={56}
          className="pointer-events-none absolute bottom-2 left-3 opacity-90"
        />
      )}

      {/* Read back far enough and the way down is gone exactly when it is needed, so it shows for
          as long as you are not at the bottom. What it says is the only thing the count changes. */}
      {!stickToBottom && (
        <Button data-testid="to-bottom" size="sm" className="absolute bottom-4 right-4 rounded-full shadow-md z-10 gap-2" onClick={scrollToBottom}>
          <ArrowDown className="h-4 w-4" />
          {newCount > 0
            ? plural(newCount, t("thread.newMessages.one", { n: newCount }), t("thread.newMessages.other", { n: newCount }))
            : t("thread.toLatest")}
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

export const RunBubble = memo(function RunBubble({ run }: { run: Run }) {
  const t = useT();
  const locale = useLocale();
  const agents = useAppStore(selectAllAgents);
  const [activityOpen, setActivityOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);
  const steps = useActivityCount(run.id);
  const transcript = useRunTranscript(run.id);

  // Arrived here from the search palette: the turn lights up for a moment so the eye finds it.
  const focusedMessageId = useAppStore(state => state.focusedMessageId);
  const focusMessage = useAppStore(state => state.focusMessage);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (focusedMessageId === run.id) {
      setFlashing(true);
      const timer = setTimeout(() => {
        setFlashing(false);
        focusMessage(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [focusedMessageId, run.id, focusMessage]);

  // A pending question is answered from the composer, which takes over the input box for it;
  // showing it here too would let it be answered twice. An answered question stays, since the
  // read-only line it renders is the only record in the thread that it was ever asked.
  const questionIdsStr = useAppStore(state =>
    Object.values(state.questions)
      .filter(q => q.runId === run.id && q.status !== "pending" && isForUser(q))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(q => q.id)
      .join(',')
  );
  const questionIds = useMemo(() => questionIdsStr ? questionIdsStr.split(',') : [], [questionIdsStr]);

  const agent = agents.find(a => a.id === run.agentId);
  const agentName = (id: string) => agents.find(a => a.id === id)?.name ?? pastAgent(t);
  const elapsed = formatElapsed(((run.endedAt ?? Date.now()) - run.startedAt) / 1000);
  const interrupted = run.output === interruptedOutput();
  const output = interrupted ? "" : (run.output ?? "");
  // What the CLI said this run consumed. Empty when it reported nothing: then nothing is shown.
  const usage = runUsageText(run, locale, t);
  const answer = useMemo(() => runAnswer(interrupted ? "" : transcript, output), [interrupted, transcript, output]);
  // Died of quota: the provider's boilerplate is not the answer, the card under the transcript is.
  const quotaDead = run.status === "error" && outOfQuota(output);
  const retried = useAppStore(state => (quotaDead ? retriedLater(state.runs, run) : false));

  // Same agent, same model, no dialog — and in the place of the run it is retrying, like every
  // other retry: what the user asked is already above, it does not get written again.
  const retry = () => retryRun(run.id, { agentId: run.agentId, model: run.model });

  const messageActions: MenuAction[] = [
    {
      key: "copy",
      label: t("message.copyText"),
      icon: Copy,
      disabled: !output,
      onSelect: () => void copyText(toPlainText(output), t("message.textCopied")),
    },
    {
      key: "copy-markdown",
      label: t("message.copyMarkdown"),
      icon: FileCode,
      disabled: !output || !hasMarkdown(output),
      onSelect: () => void copyText(output, t("message.markdownCopied")),
    },
    {
      key: "task",
      label: t("message.createTask"),
      icon: ListTodo,
      separatorBefore: true,
      disabled: !output,
      onSelect: () => createTaskFromMessage({ projectId: run.projectId, text: output, agentId: run.agentId, runId: run.id }),
    },
    { key: "detail", label: t("message.viewDetail"), icon: FileText, onSelect: () => setDetailOpen(true) },
    // Retrying only means something on a run the app cut short.
    ...(interrupted ? [{ key: "retry", label: t("common.retry"), icon: RotateCw, onSelect: retry } satisfies MenuAction] : []),
    // A fresh run with the same prompt, on an agent and model picked in the dialog — unlike the
    // one above, which resumes the run that was cut short, this always starts from zero.
    ...(isFinishedRun(run.status) ? [{ key: "retry-with", label: t("retry.action"), icon: Sparkles, onSelect: () => setRetryOpen(true) } satisfies MenuAction] : []),
  ];

  return (
    <div data-message-id={run.id} className={cn("flex flex-col gap-3 transition-colors rounded-lg", flashing && "animate-flash-highlight p-1")}>
      {/* A round > 0 run is an automatic continuation, not something the user typed. */}
      {run.round === 0 && (
        <div className="flex flex-col items-end gap-1">
          {/* Shown as you wrote it — and when you wrote a list, a link or a block of code, as
              those: the box helps you write them, so the thread has to draw them. */}
          <div data-testid="user-bubble" className={cn("rounded-xl px-3.5 py-2 max-w-[85%] text-sm break-words bg-muted", !hasMarkdown(run.prompt) && "whitespace-pre-wrap")}>
            {hasMarkdown(run.prompt) ? <Markdown text={run.prompt} /> : run.prompt}
          </div>
          <span className="text-[11px] text-muted-foreground">
            → {agentName(run.agentId)}
            {run.model ? ` · ${run.model}` : ""} · {formatClock(run.startedAt, locale)}
          </span>
        </div>
      )}

      {/* The answer reads like a document, not a bubble: a header line and the content below it. */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="group flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              {agent ? <AgentAvatar provider={agent.provider} color={agent.color} size={22} /> : <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-muted-foreground" />}
              <span className="font-semibold">{agent?.name ?? pastAgent(t)}</span>
              {run.round > 0 && <Badge variant="outline" className="text-[10px]">{t("thread.round", { n: run.round + 1 })}</Badge>}
              {(run.status === "error" || run.status === "killed") && (
                <Badge variant={run.status === "error" ? "destructive" : "secondary"} className="text-[10px]">
                  {t(runStatusLabelKey[run.status])}
                </Badge>
              )}
              <span className="ml-auto text-muted-foreground">{formatClock(run.startedAt, locale)}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                title={t("thread.rawOutput")}
                onClick={() => setDetailOpen(true)}
              >
                <FileText className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="pl-[18px] flex flex-col gap-2">
              {isLiveRun(run.status) ? (
                <RunActivity runId={run.id} />
              ) : (
                <>
                  {(steps > 0 || usage) && (
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {steps > 0 && (
                          <button
                            type="button"
                            className="flex items-center gap-1 hover:text-foreground"
                            onClick={() => setActivityOpen(o => !o)}
                          >
                            {activityOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            {plural(steps, t("thread.activity.one", { n: steps, elapsed }), t("thread.activity.other", { n: steps, elapsed }))}
                          </button>
                        )}
                        {usage && <span>{steps > 0 ? `· ${usage}` : usage}</span>}
                      </div>
                      {activityOpen && steps > 0 && (
                        <div className="rounded-md border border-border bg-muted/40 p-2">
                          <RunActivity runId={run.id} mode="full" />
                        </div>
                      )}
                    </div>
                  )}

                  {interrupted ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                      <span>{t("thread.interrupted")}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={retry}
                      >
                        {t("common.retry")}
                      </Button>
                    </div>
                  ) : quotaDead ? (
                    <>
                      {answer.transcript && <Markdown text={answer.transcript} />}
                      <QuotaCard run={run} agent={agent} retried={retried} onRetryWith={() => setRetryOpen(true)} />
                    </>
                  ) : answer.transcript || answer.final ? (
                    <>
                      {/* What it said while it worked, which `run.output` is only the last line of.
                          See `lib/run-answer.ts`: the final answer follows only when it adds to it. */}
                      {answer.transcript && <Markdown text={answer.transcript} />}
                      {answer.final && <Markdown text={answer.final} />}
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground italic">{t("thread.noOutput")}</div>
                  )}

                  {/* A run that ended asking something ends here, with the options it offered. All
                      of them together: they came from one turn and go back as one answer. */}
                  {questionIds.length > 0 && <RunQuestions ids={questionIds} />}
                </>
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextActionItems actions={messageActions} />
        </ContextMenuContent>
      </ContextMenu>

      <RunDetailDialog runId={run.id} open={detailOpen} onOpenChange={setDetailOpen} />
      <RetryRunDialog runId={run.id} open={retryOpen} onOpenChange={setRetryOpen} />
    </div>
  );
});

/** The questions of one run, in the order they were asked, answered in one go. */
function RunQuestions({ ids }: { ids: string[] }) {
  const questions = useAppStore(state => state.questions);
  const answerQuestions = useAppStore(state => state.answerQuestions);
  const group = ids.map(id => questions[id]).filter(Boolean);
  if (group.length === 0) return null;
  return <QuestionGroup questions={group} onAnswer={answerQuestions} />;
}
