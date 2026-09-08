// The phone UI: the same React components as the desktop app, laid out for one column and a
// thumb. The store is filled by the snapshot (see remote-client.ts) and every action that runs
// something is an HTTP call to the PC.
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore, selectAllAgents, selectProjectAgents } from "@/store";
import { AgentAvatar } from "@/components/ProviderLogo";
import { TasksTab } from "./TasksTab";
import { Logo } from "@/components/Logo";
import { StatusDot } from "@/components/StatusDot";
import { ApprovalsPanel } from "@/components/ApprovalsPanel";
import { InstructDialog } from "@/components/InstructDialog";
import { ChatThread } from "@/components/shell/ChatThread";
import { Composer } from "@/components/shell/Composer";
import { OrchestratorThread } from "@/components/shell/OrchestratorThread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Island } from "@/components/ui/island";
import { useKeyboardInset } from "./useKeyboardInset";
import { Toaster, toast } from "@/components/ui/toast";
import { roleLabelKey, statusLabelKey } from "@/lib/labels";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  askForNotifications,
  notificationState,
  registerServiceWorker,
  useWebNotifications,
  type NotificationState,
} from "./web-notifications";
import { truncate } from "@/lib/format";
import type { RemoteSnapshot } from "@/lib/remote";
import { api, connectEvents, forgetToken, getToken, hydrate, installRemoteActions, rememberToken, RemoteError, runDiagnostics } from "./remote-client";
import {
  ArrowLeft, Bell, BellOff, Bot, ChevronRight, FolderOpen, ListTodo, MessageSquare, MessagesSquare,
  ShieldCheck, Square, Users, WifiOff, Stethoscope, RefreshCw, Loader2,
  AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import { summarizeAgentQuota } from "@/lib/quota-summary";
import { QuotaRing } from "@/components/QuotaRing";
import type { DiagnosticResult } from "@/lib/diagnostics";

type Phase = "loading" | "no-token" | "unauthorized" | "ready";
type Tab = "tasks" | "thread" | "chats" | "approvals" | "agents";

/** Straight to the store: the phone has no back/forward stack and nothing to persist. */
function goHome(): void {
  useAppStore.setState({ currentProjectId: null, currentChatId: null });
}

function openProject(projectId: string): void {
  useAppStore.setState({ currentProjectId: projectId, currentChatId: null });
}

export function RemoteApp() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("loading");
  const [connected, setConnected] = useState(false);
  // Bumped by the token form: it is what makes the effect below try again with the new token.
  const [attempt, setAttempt] = useState(0);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const installed = useRef(false);

  // What needs you, on the phone's own notifications: only while the page is not in front, and
  // only once it has been allowed from the bell.
  useWebNotifications();

  useEffect(() => {
    if (!getToken()) {
      setPhase("no-token");
      return;
    }
    let cancelled = false;
    let stop: (() => void) | undefined;

    const apply = (snapshot: RemoteSnapshot) => {
      hydrate(snapshot);
      // Once, and only after the store has something: the components read these on mount.
      if (!installed.current) {
        installRemoteActions();
        installed.current = true;
      }
      setPhase("ready");
      setConnected(true);
    };

    void (async () => {
      try {
        apply((await api("/api/state")) as unknown as RemoteSnapshot);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof RemoteError && (e.status === 401 || e.status === 403)) {
          // A token that no longer works is worse than none: kept, it would greet the next launch
          // with the same error instead of the form.
          forgetToken();
          setPhase("unauthorized");
          return;
        }
        // The PC may just be busy: the SSE loop below keeps trying and hydrates when it lands.
      }
      if (cancelled) return;
      stop = connectEvents({
        onState: apply,
        onConnected: () => setConnected(true),
        onDisconnected: () => setConnected(false),
      });
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [attempt]);

  if (phase !== "ready") {
    return (
      <Shell>
        <Toaster position="top-center" richColors />
        <div className="flex-1 flex items-center justify-center p-6">
          {(phase === "no-token" || phase === "unauthorized") && (
            <div className="w-full max-w-sm flex flex-col gap-5">
              <EmptyState
                icon={ShieldCheck}
                title={phase === "no-token" ? t("phone.noToken.title") : t("phone.badToken.title")}
                description={phase === "no-token" ? t("phone.noToken.body") : t("phone.badToken.body")}
              />
              <TokenForm
                onSubmit={token => {
                  rememberToken(token);
                  setPhase("loading");
                  setAttempt(n => n + 1);
                }}
              />
            </div>
          )}
          {phase === "loading" && <p className="text-sm text-muted-foreground">{t("phone.connecting")}</p>}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Island position="top" idle={false} />
      <Toaster position="top-center" richColors />
      {!connected && (
        <div className="shrink-0 flex items-center justify-center gap-2 bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs py-1.5">
          <WifiOff className="h-3.5 w-3.5" /> {t("phone.reconnecting")}
        </div>
      )}
      {currentProjectId ? <ProjectView projectId={currentProjectId} /> : <HomeView />}
    </Shell>
  );
}

/**
 * One column, as tall as the small viewport; everything inside scrolls on its own.
 *
 * `svh` and not `dvh`: the dynamic unit follows the browser UI as it appears and disappears, so
 * the tab bar at the bottom would shift (and hide behind Chrome) whenever the viewport changed.
 */
function Shell({ children }: { children: React.ReactNode }) {
  useKeyboardInset();
  return (
    <div
      className="w-full mx-auto max-w-screen-sm flex flex-col bg-background text-foreground overflow-hidden"
      // Shortened by whatever the keyboard is covering, so the box being typed in stays visible.
      style={{ height: "calc(100svh - var(--kb, 0px))" }}
    >
      {children}
    </div>
  );
}

/**
 * Way in for an installed app. Its start URL carries no `?token=`, so without somewhere to type it
 * the page could only ever answer "invalid token"; what is typed here is kept on the device.
 */
function TokenForm({ onSubmit }: { onSubmit(token: string): void }) {
  const t = useT();
  const [value, setValue] = useState("");
  const clean = value.trim();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={e => {
        e.preventDefault();
        if (clean) onSubmit(clean);
      }}
    >
      <label className="text-xs font-medium text-muted-foreground" htmlFor="remote-token">
        {t("phone.token.label")}
      </label>
      <Input
        id="remote-token"
        type="password"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="h-11"
        placeholder={t("phone.token.placeholder")}
        value={value}
        onChange={e => setValue(e.target.value)}
      />
      <Button type="submit" className="h-11" disabled={!clean}>{t("phone.token.submit")}</Button>
      <p className="text-xs text-muted-foreground">{t("phone.token.help")}</p>
    </form>
  );
}

// ---- Home: the project list ----

function HomeView() {
  const t = useT();
  const projects = useAppStore(state => state.config.projects);
  const runs = useAppStore(state => state.runs);
  const runtime = useAppStore(state => state.runtime);
  const approvals = useAppStore(state => state.approvals);

  const pending = useMemo(
    () => Object.values(approvals).filter(a => a.status === "pending").sort((a, b) => a.createdAt - b.createdAt),
    [approvals],
  );

  return (
    <>
      <header className="shrink-0 flex items-center gap-2 px-4 h-14 border-b border-border">
        <Logo size={20} />
        <h1 className="font-semibold">ainess</h1>
        <div className="ml-auto flex items-center gap-2">
          {pending.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1.5 border-amber-500/60 text-amber-600 dark:text-amber-400"
              onClick={() => openProject(pending[0].projectId)}
            >
              <ShieldCheck className="h-4 w-4" />
              {plural(pending.length, t("phone.approvals.one", { n: pending.length }), t("phone.approvals.other", { n: pending.length }))}
            </Button>
          )}
          <AlertsButton />
          <DiagnosticsButton />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
        {projects.length === 0 ? (
          <EmptyState icon={FolderOpen} title={t("home.empty.title")} description={t("phone.createOnDesktop")} />
        ) : (
          projects.map(project => {
            const working = Object.values(runtime[project.id] ?? {}).filter(r => r.status === "working" || r.status === "waiting").length;
            const last = Object.values(runs)
              .filter(r => r.projectId === project.id && r.parentRunId === null && r.kind !== "chat")
              .sort((a, b) => b.startedAt - a.startedAt)[0];
            return (
              <button key={project.id} type="button" className="w-full text-left" onClick={() => openProject(project.id)}>
                {/* Card is a column by default: force the row, or the dot, name and chevron stack up. */}
                <Card className="flex-row items-center gap-3 px-3 py-3 min-h-16">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color || "#888" }} />
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <span className="font-medium truncate">{project.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {last ? truncate(last.prompt.replace(/\s+/g, " "), 70) : t("phone.noTasksYet")}
                    </span>
                  </div>
                  {working > 0 && <Badge variant="secondary" className="shrink-0">{t("sidebar.working", { n: working })}</Badge>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Card>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

// ---- Project: header, body and the bottom tab bar ----

function ProjectView({ projectId }: { projectId: string }) {
  const t = useT();
  // The board is the project home on the desktop, so the phone opens there too.
  const [tab, setTab] = useState<Tab>("tasks");
  const project = useAppStore(state => state.config.projects.find(p => p.id === projectId));
  const approvals = useAppStore(state => state.approvals);
  const currentChatId = useAppStore(state => state.currentChatId);

  const pending = useMemo(
    () => Object.values(approvals).filter(a => a.status === "pending" && a.projectId === projectId).length,
    [approvals, projectId],
  );

  // A tab that is not "chats" always talks to the orchestrator, so no chat may stay selected.
  const selectTab = (next: Tab) => {
    setTab(next);
    if (next !== "chats" && currentChatId) useAppStore.setState({ currentChatId: null });
  };

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <EmptyState icon={FolderOpen} title={t("phone.projectGone")} action={{ label: t("phone.back"), onClick: goHome }} />
      </div>
    );
  }

  return (
    <>
      <header className="shrink-0 flex items-center gap-2 px-2 h-14 border-b border-border">
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label={t("phone.back")} onClick={goHome}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="font-semibold truncate flex-1">{project.name}</span>
        <AlertsButton />
        <DiagnosticsButton />
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "tasks" && <TasksTab projectId={projectId} />}
        {tab === "thread" && (
          <>
            <div className="flex-1 min-h-0"><OrchestratorThread /></div>
            <Composer />
          </>
        )}
        {tab === "chats" && (
          currentChatId ? (
            <>
              <div className="flex-1 min-h-0"><ChatThread chatId={currentChatId} /></div>
              <Composer />
            </>
          ) : (
            <ChatList projectId={projectId} />
          )
        )}
        {tab === "approvals" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {pending > 0 ? (
              <ApprovalsPanel />
            ) : (
              <EmptyState icon={ShieldCheck} title={t("phone.noApprovals.title")} description={t("phone.noApprovals.body")} />
            )}
          </div>
        )}
        {tab === "agents" && <AgentsTab projectId={projectId} />}
      </div>

      <nav className="shrink-0 grid grid-cols-5 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
        <TabButton icon={ListTodo} label={t("projectScreen.tasks")} active={tab === "tasks"} onClick={() => selectTab("tasks")} />
        <TabButton icon={MessagesSquare} label={t("sidebar.orchestrator")} active={tab === "thread"} onClick={() => selectTab("thread")} />
        <TabButton icon={MessageSquare} label={t("search.group.chats")} active={tab === "chats"} onClick={() => selectTab("chats")} />
        <TabButton icon={ShieldCheck} label={t("phone.tab.approvals")} active={tab === "approvals"} badge={pending} onClick={() => selectTab("approvals")} />
        <TabButton icon={Users} label={t("settings.section.agents")} active={tab === "agents"} onClick={() => selectTab("agents")} />
      </nav>
    </>
  );
}

function TabButton({ icon: Icon, label, active, badge, onClick }: {
  icon: typeof MessageSquare;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative min-h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-foreground" : "text-muted-foreground"}`}
    >
      <Icon className="h-5 w-5" />
      {label}
      {!!badge && badge > 0 && (
        <span className="absolute top-1.5 right-[calc(50%-1.6rem)] min-w-4 h-4 px-1 rounded-full bg-amber-500 text-[10px] leading-4 text-black text-center">
          {badge}
        </span>
      )}
      {active && <span className="absolute top-0 left-0 right-0 h-0.5 bg-foreground" />}
    </button>
  );
}

// ---- Chats tab ----

function ChatList({ projectId }: { projectId: string }) {
  const t = useT();
  const allChats = useAppStore(state => state.config.chats);
  const agents = useAppStore(selectAllAgents);
  const active = useAppStore(state => state.remoteActiveChats);
  // Filtering inside the selector would hand zustand a new array on every render (infinite loop).
  const chats = useMemo(() => allChats.filter(c => c.projectId === projectId), [allChats, projectId]);

  if (chats.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <EmptyState icon={MessageSquare} title={t("phone.noChats")} description={t("phone.createOnDesktop")} />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
      {chats.map(chat => (
        <button key={chat.id} type="button" className="text-left" onClick={() => useAppStore.setState({ currentChatId: chat.id })}>
          <Card className="p-3 flex items-center gap-3 min-h-16">
            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
              <span className="font-medium truncate">{chat.name}</span>
              <span className="text-xs text-muted-foreground truncate">
                {chat.participants.map(p => agents.find(a => a.id === p.agentId)?.name ?? "?").join(" · ")}
              </span>
            </div>
            {active.includes(chat.id) && <Badge variant="secondary" className="shrink-0">{t("phone.answering")}</Badge>}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Card>
        </button>
      ))}
    </div>
  );
}

// ---- Agents tab ----

function AgentsTab({ projectId }: { projectId: string }) {
  const t = useT();
  const agents = useAppStore(state => selectProjectAgents(state, projectId));
  const runtime = useAppStore(state => state.runtime[projectId]);
  const stopAgent = useAppStore(state => state.stopAgent);
  const quota = useAppStore(state => state.quota);
  const [instructing, setInstructing] = useState<string | null>(null);

  if (agents.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <EmptyState icon={Bot} title={t("phone.noAgents")} description={t("phone.addOnDesktop")} />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
      {agents.map(agent => {
        const rt = runtime?.[agent.id];
        const status = rt?.status ?? "idle";
        const working = status === "working" || status === "waiting";
        const agentQuota = quota[agent.provider];
        const summary = summarizeAgentQuota(agentQuota, { model: agent.model });
        return (
          <Card key={agent.id} className="p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <AgentAvatar provider={agent.provider} color={agent.color} size={28} />
              <div className="min-w-0 flex-1 flex flex-col">
                <span className="font-medium truncate">{agent.name}</span>
                <span className="text-xs text-muted-foreground truncate">{t(roleLabelKey[agent.role])}</span>
              </div>
              <div className="flex flex-col items-end shrink-0 gap-0.5">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusDot status={status} /> {t(statusLabelKey[status])}
                </span>
                {summary.fraction !== null && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <QuotaRing fraction={summary.fraction} label={summary.label} size={12} />
                    <span className="truncate max-w-[120px] tabular-nums" title={summary.detail}>{summary.label}</span>
                  </span>
                )}
              </div>
            </div>
            {rt?.currentTask && (
              <p className="text-xs text-muted-foreground line-clamp-3">{rt.currentTask}</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-10 flex-1" onClick={() => setInstructing(agent.id)}>
                {t("agentActions.instruct")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-10 flex-1"
                disabled={!working}
                onClick={() => void stopAgent(agent.id, projectId)}
              >
                <Square className="h-4 w-4" /> {t("composer.stop")}
              </Button>
            </div>
          </Card>
        );
      })}

      {instructing && (
        <InstructDialog
          key={instructing}
          agentId={instructing}
          open
          onOpenChange={open => { if (!open) setInstructing(null); }}
          isWorking={(runtime?.[instructing]?.status ?? "idle") === "working"}
        />
      )}
    </div>
  );
}


const LEVEL_ICON = { ok: CheckCircle2, warn: AlertTriangle, error: XCircle };
const LEVEL_COLOR = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-destructive",
};

/**
 * Turns on the notifications of this phone. It has to be a button: the browser only takes the
 * request from a gesture, and iOS only from an app installed to the home screen.
 */
function AlertsButton() {
  const t = useT();
  const [state, setState] = useState<NotificationState>(() => notificationState());

  // The worker is what shows them, and what makes this installable; registering it does not ask
  // for anything.
  useEffect(() => {
    if (state === "granted") void registerServiceWorker();
  }, [state]);

  const label = {
    unsupported: t("phone.alerts.unsupported"),
    insecure: t("phone.alerts.insecure"),
    denied: t("phone.alerts.denied"),
    granted: t("phone.alerts.on"),
    default: t("phone.alerts.enable"),
  }[state];

  const off = state !== "default";
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-10 w-10", state === "granted" ? "text-emerald-500" : "text-muted-foreground")}
      aria-label={`${t("phone.alerts.label")}: ${label}`}
      title={label}
      disabled={off && state !== "granted"}
      onClick={() => { if (!off) void askForNotifications().then(setState); }}
    >
      {state === "granted" ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
    </Button>
  );
}

function DiagnosticsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground" onClick={() => setOpen(true)}>
        <Stethoscope className="h-5 w-5" />
      </Button>
      {open && <DiagnosticsSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function DiagnosticsSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [results, setResults] = useState<DiagnosticResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = async (refreshQuota: boolean) => {
    setRunning(true);
    try {
      setResults(await runDiagnostics(refreshQuota));
    } catch (e) {
      // Un error del comando (la PC no contesta, el comando falla) se muestra como mensaje
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const worst = results ? (results.some(r => r.level === "error") ? "error" : results.some(r => r.level === "warn") ? "warn" : "ok") : null;
  const WorstIcon = worst ? LEVEL_ICON[worst] : null;

  const counts = {
    ok: results?.filter(r => r.level === "ok").length ?? 0,
    warn: results?.filter(r => r.level === "warn").length ?? 0,
    error: results?.filter(r => r.level === "error").length ?? 0,
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-center gap-2 px-2 h-14 border-b border-border">
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="font-semibold truncate flex-1">{t("settings.section.diagnostics")}</span>
        {worst && WorstIcon && <WorstIcon className={cn("h-5 w-5 shrink-0 mr-2", LEVEL_COLOR[worst])} />}
      </header>
      
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div className="flex gap-2">
          <Button className="flex-1" variant="outline" disabled={running} onClick={() => void run(false)}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Stethoscope className="mr-2 h-4 w-4" />}
            {results ? t("settings.option.diagnostics.recheck") : t("diagnostics.run")}
          </Button>
          {results && (
            <Button variant="outline" disabled={running} onClick={() => void run(true)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("agents.refreshQuota")}
            </Button>
          )}
        </div>
        
        <p className="text-xs text-muted-foreground">{t("diagnostics.description")}</p>
        
        {results && (
          <span className="text-xs text-muted-foreground">{t("diagnostics.summary", counts)}</span>
        )}

        {!results && !running && (
           <EmptyState icon={Stethoscope} title={t("settings.section.diagnostics")} description={t("diagnostics.description")} />
        )}

        {results && (
          <div className="flex flex-col gap-2">
            {results.map(result => {
              const Icon = LEVEL_ICON[result.level];
              return (
                <div key={result.id} className="flex gap-3 rounded-md border border-border p-3">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", LEVEL_COLOR[result.level])} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium">{result.title}</span>
                    <span className="text-xs break-words text-muted-foreground">{result.detail}</span>
                    {result.hint && <span className="text-xs break-words text-foreground/80">→ {result.hint}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
