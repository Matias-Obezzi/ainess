import { useEffect, useMemo, useRef, useState } from "react";
import { AgentAvatar } from "@/components/ProviderLogo";
import { useAppStore, selectAllAgents, selectProjectAgents } from "@/store";
import { QueuedMessages } from "./QueuedMessages";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RunDetailDialog } from "@/components/RunDetailDialog";
import { ContextActionItems, type MenuAction } from "@/components/menu-actions";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Markdown } from "@/components/shell/Markdown";
import { RunActivity, useActivityCount } from "@/components/shell/RunActivity";
import { InlineQuestion } from "@/components/InlineQuestion";
import { runUsageText } from "@/components/UsageDialog";
import { runStatusLabelKey } from "@/lib/labels";
import { useT, useLocale, type TFunction } from "@/i18n/useT";
import { plural } from "@/i18n";
import { INTERRUPTED_OUTPUT } from "@/lib/history";
import { formatClock, formatElapsed } from "@/lib/format";
import { copyText } from "@/lib/clipboard";
import { hasMarkdown, toPlainText } from "@/lib/text";
import { createTaskFromMessage } from "@/lib/task-from-message";
import type { Run } from "@/types";
import { ArrowDown, ChevronDown, ChevronRight, Copy, FileCode, FileText, ListTodo, MessagesSquare, RotateCw } from "lucide-react";

/** While something streams in, follow the bottom at most this often. */
const FOLLOW_INTERVAL_MS = 150;

/** The project's main conversation: what the user asked and what the team answered. */
/** History can name an agent that the project no longer has (a rebuilt team, a deleted agent). */
const pastAgent = (t: TFunction) => t("home.formerAgent");

export function OrchestratorThread() {
  const t = useT();
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const runs = useAppStore(state => state.runs);
  const historyLoading = useAppStore(state => currentProjectId ? state.historyLoading[currentProjectId] : false);
  const hasRunning = useAppStore(state =>
    Object.values(state.runs).some(r => r.projectId === currentProjectId && r.status === "running"),
  );

  // Written while an agent was working: it has not been handed over yet, and until now the thread
  // gave no sign of it.
  const runtime = useAppStore(state => currentProjectId ? state.runtime[currentProjectId] : undefined);
  const agents = useAppStore(state => selectProjectAgents(state, state.currentProjectId));
  const unqueueInstruction = useAppStore(state => state.unqueueInstruction);
  const queued = useMemo(() => {
    if (!runtime || !currentProjectId) return [];
    return agents.flatMap(agent =>
      (runtime[agent.id]?.queuedInstructions ?? []).map((text, index) => ({
        text,
        // Only worth naming when the project has more than one agent to send to.
        to: agents.length > 1 ? agent.name : undefined,
        onCancel: () => unqueueInstruction(currentProjectId, agent.id, index),
      })),
    );
  }, [runtime, agents, currentProjectId, unqueueInstruction]);

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

  // Opening a project (or finishing its first load) lands on the newest turn, not the oldest.
  useEffect(() => {
    if (historyLoading) return;
    const id = requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
    return () => cancelAnimationFrame(id);
  }, [currentProjectId, historyLoading]);

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
      if (stickRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
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
        ) : rootRuns.length === 0 && queued.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title={t("thread.empty.title")}
            description={t("thread.empty.body")}
            className="h-full"
          />
        ) : (
          <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            {rootRuns.map(run => <RunBubble key={run.id} run={run} />)}
            <QueuedMessages messages={queued} />
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {!stickToBottom && hasNewMessages && (
        <Button size="sm" className="absolute bottom-4 right-4 rounded-full shadow-md z-10 gap-2" onClick={scrollToBottom}>
          <ArrowDown className="h-4 w-4" /> {t("thread.newMessages")}
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
  const t = useT();
  const locale = useLocale();
  const agents = useAppStore(selectAllAgents);
  const [activityOpen, setActivityOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const steps = useActivityCount(run.id);
  const allQuestions = useAppStore(state => state.questions);
  const questions = useMemo(
    () => Object.values(allQuestions).filter(q => q.runId === run.id).sort((a, b) => a.createdAt - b.createdAt),
    [allQuestions, run.id],
  );

  const isRunning = run.status === "running";
  const agent = agents.find(a => a.id === run.agentId);
  const agentName = (id: string) => agents.find(a => a.id === id)?.name ?? pastAgent(t);
  const elapsed = formatElapsed(((run.endedAt ?? Date.now()) - run.startedAt) / 1000);
  const interrupted = run.output === INTERRUPTED_OUTPUT;
  const output = interrupted ? "" : (run.output ?? "");
  // What the CLI said this run consumed. Empty when it reported nothing: then nothing is shown.
  const usage = runUsageText(run, locale, t);

  const retry = () =>
    void useAppStore.getState().submitPrompt(run.prompt, run.agentId, run.projectId, { model: run.model });

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
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* A round > 0 run is an automatic continuation, not something the user typed. */}
      {run.round === 0 && (
        <div className="flex flex-col items-end gap-1">
          <div className="rounded-xl px-3.5 py-2 max-w-[85%] text-sm whitespace-pre-wrap break-words bg-muted">
            {run.prompt}
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
              {isRunning ? (
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
                          <RunActivity runId={run.id} showFooter={false} />
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
                  ) : run.output ? (
                    <Markdown text={run.output} />
                  ) : (
                    <div className="text-sm text-muted-foreground italic">{t("thread.noOutput")}</div>
                  )}

                  {/* A run that ended asking something ends here, with the options it offered. */}
                  {questions.map(q => <InlineQuestion key={q.id} questionId={q.id} />)}
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
    </div>
  );
}
