// The phone UI: the same React components as the desktop app, laid out for one column and a
// thumb. The store is filled by the snapshot (see remote-client.ts) and every action that runs
// something is an HTTP call to the PC.
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore, selectAllAgents, selectProjectAgents } from "@/store";
import { AgentAvatar } from "@/components/ProviderLogo";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Island } from "@/components/ui/island";
import { Toaster } from "@/components/ui/toast";
import { roleLabelKey, statusLabelKey } from "@/lib/labels";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";
import { truncate } from "@/lib/format";
import type { RemoteSnapshot } from "@/lib/remote";
import { api, connectEvents, getToken, hydrate, installRemoteActions, RemoteError } from "./remote-client";
import {
  ArrowLeft, Bot, ChevronRight, FolderOpen, MessageSquare, MessagesSquare,
  ShieldCheck, Square, Users, WifiOff,
} from "lucide-react";

type Phase = "loading" | "no-token" | "unauthorized" | "ready";
type Tab = "thread" | "chats" | "approvals" | "agents";

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
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const installed = useRef(false);

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
  }, []);

  if (phase !== "ready") {
    return (
      <Shell>
        <Toaster position="top-center" richColors />
        <div className="flex-1 flex items-center justify-center p-6">
          {phase === "no-token" && (
            <EmptyState
              icon={ShieldCheck}
              title={t("phone.noToken.title")}
              description={t("phone.noToken.body")}
            />
          )}
          {phase === "unauthorized" && (
            <EmptyState
              icon={ShieldCheck}
              title={t("phone.badToken.title")}
              description={t("phone.badToken.body")}
            />
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

/** One column, full viewport height; everything inside scrolls on its own. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh w-full mx-auto max-w-screen-sm flex flex-col bg-background text-foreground overflow-hidden">
      {children}
    </div>
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
        {pending.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-10 gap-1.5 border-amber-500/60 text-amber-600 dark:text-amber-400"
            onClick={() => openProject(pending[0].projectId)}
          >
            <ShieldCheck className="h-4 w-4" />
            {plural(pending.length, t("phone.approvals.one", { n: pending.length }), t("phone.approvals.other", { n: pending.length }))}
          </Button>
        )}
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
  const [tab, setTab] = useState<Tab>("thread");
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
        <span className="font-semibold truncate">{project.name}</span>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
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

      <nav className="shrink-0 grid grid-cols-4 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
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
        return (
          <Card key={agent.id} className="p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <AgentAvatar provider={agent.provider} color={agent.color} size={28} />
              <div className="min-w-0 flex-1 flex flex-col">
                <span className="font-medium truncate">{agent.name}</span>
                <span className="text-xs text-muted-foreground truncate">{t(roleLabelKey[agent.role])}</span>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <StatusDot status={status} /> {t(statusLabelKey[status])}
              </span>
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
