import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { Sidebar } from "@/components/shell/Sidebar";
import { TitleBar } from "@/components/shell/TitleBar";
import { SearchPalette } from "@/components/shell/SearchPalette";
import { ShortcutsDialog } from "@/components/shell/ShortcutsDialog";
import { HomeScreen } from "@/components/shell/HomeScreen";
import { ProjectPanes } from "@/components/shell/ProjectPanes";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { ApprovalsPanel } from "@/components/ApprovalsPanel";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { EditContextMenu } from "@/components/EditContextMenu";
import { Island } from "@/components/ui/island";
import { Toaster, toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { PasswordField } from "@/components/ui/password-field";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNotifications } from "@/hooks/useNotifications";
import { resolveGlobalShortcut, shortcutPlatform } from "@/lib/shortcuts";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/utils";
import {
  askForNotifications,
  notificationState,
  registerServiceWorker,
  useWebNotifications,
  type NotificationState,
} from "./web-notifications";
import type { RemoteSnapshot } from "@/lib/remote";
import {
  api,
  connectEvents,
  forgetToken,
  getToken,
  installRemoteActions,
  rememberToken,
  RemoteError,
  runDiagnostics,
} from "./remote-client";
import { readRemoteNav, restoreNav, writeRemoteLayout, writeRemoteNav } from "./remote-nav";
import { hydrateWithSettings, installRemoteSettings, restoreRemoteTheme } from "./remote-settings-client";
import {
  ArrowLeft, Bell, BellOff, RefreshCw, ShieldCheck,
  Smartphone, Stethoscope, WifiOff, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import type { DiagnosticResult } from "@/lib/diagnostics";

type Phase = "loading" | "no-token" | "unauthorized" | "ready";

export function RemoteDesktopApp() {
  const t = useT();
  const screen = useAppStore(state => state.screen);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const currentChatId = useAppStore(state => state.currentChatId);

  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState(0);
  const [connected, setConnected] = useState(true);
  const installed = useRef(false);
  const restoredRef = useRef(false);

  useEffect(() => {
    useAppStore.setState({ remoteLayout: "desktop" });
    restoreRemoteTheme();
  }, []);

  // Prevent unhandled drag/drop from navigating the browser window when dragging cards or files.
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  // Global keyboard shortcuts for desktop remote view.
  useEffect(() => {
    const platform = shortcutPlatform();
    const handler = (e: KeyboardEvent) => {
      const shortcut = resolveGlobalShortcut(e, platform);
      if (!shortcut) return;
      e.preventDefault();
      const state = useAppStore.getState();
      switch (shortcut.id) {
        case "settings":
          state.openSettings();
          break;
        case "palette":
          state.toggleSearch();
          break;
        case "find":
          state.toggleSearch(true, "messages");
          break;
        case "sidebar":
          state.cycleSidebar();
          break;
        case "shortcuts":
          state.toggleShortcuts();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useWebNotifications();
  useNotifications();

  const goToMobile = () => {
    if (typeof localStorage !== "undefined") {
      writeRemoteLayout(localStorage, "mobile");
    }
    const token = getToken();
    const search = window.location.search || (token ? `?token=${encodeURIComponent(token)}` : "");
    window.location.href = `/${search}`;
  };

  // Persist navigation on every change, but only after initial restore has run.
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      if (typeof localStorage !== "undefined") {
        const activeProjectId = screen === "home" ? null : currentProjectId;
        writeRemoteNav(localStorage, {
          projectId: activeProjectId,
          chatId: currentChatId,
          tab: "tasks",
          threadOpen: false,
        });
      }
    } catch {
      // Storage unavailable or disabled
    }
  }, [screen, currentProjectId, currentChatId]);

  useEffect(() => {
    if (!getToken()) {
      setPhase("no-token");
      return;
    }
    let cancelled = false;
    let stop: (() => void) | undefined;

    const apply = (snapshot: RemoteSnapshot) => {
      hydrateWithSettings(snapshot);
      if (!installed.current) {
        installRemoteActions();
        // The configuration screens edit for real here, checked by the host.
        installRemoteSettings();
        installed.current = true;
        try {
          if (typeof localStorage !== "undefined") {
            const saved = readRemoteNav(localStorage);
            const state = useAppStore.getState();
            const restored = restoreNav(saved, state.config.projects, state.config.chats);
            const pid = restored.projectId;
            const openProjects = pid
              ? (state.openProjects.includes(pid) ? state.openProjects : [...state.openProjects, pid])
              : state.openProjects;
            const mode = restored.tab === "conversations" && (restored.threadOpen || Boolean(restored.chatId))
              ? "chat"
              : "tasks";
            useAppStore.setState({
              screen: pid ? "project" : "home",
              currentProjectId: pid,
              currentChatId: restored.chatId,
              openProjects,
              projectMode: pid ? mode : state.projectMode,
            });
          }
        } catch {
          // Swallow any storage read or restore failure
        }
        restoredRef.current = true;
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
          forgetToken();
          setPhase("unauthorized");
          return;
        }
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
      <div className="h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <Toaster position="top-center" richColors />
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
    );
  }

  return (
    <div
      className="h-screen flex flex-col bg-background text-foreground overflow-hidden relative"
      data-testid="remote-desktop-shell"
    >
      <TitleBar
        rightSlot={
          <div className="flex items-center gap-0.5">
            <LayoutSwitchButton onSwitch={goToMobile} compact />
            <AlertsButton compact />
            <DiagnosticsButton compact />
          </div>
        }
      />
      {!connected && (
        <div className="shrink-0 flex items-center justify-center gap-2 bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs py-1.5">
          <WifiOff className="h-3.5 w-3.5" /> {t("phone.reconnecting")}
        </div>
      )}

      <div className="flex-1 min-h-0 flex relative">
        <Island position="top" idle={false} />
        <Toaster position="bottom-right" richColors />
        <ConfirmDialogHost />
        <EditContextMenu />

        <Sidebar />

        <main className="flex-1 min-w-0 flex flex-col relative">
          {screen === "home" && (
            <>
              <div className="px-6 pt-4 empty:hidden">
                <ApprovalsPanel all />
              </div>
              <HomeScreen />
            </>
          )}
          {screen === "project" && <ProjectPanes />}
        </main>
      </div>

      <SettingsDialog />
      <SearchPalette />
      <ShortcutsDialog />
    </div>
  );
}

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
      <label className="text-xs font-medium text-muted-foreground" htmlFor="remote-desktop-token">
        {t("phone.token.label")}
      </label>
      <PasswordField
        id="remote-desktop-token"
        autoComplete="off"
        labels={{ reveal: t("common.showSecret") }}
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputClassName="h-11"
        placeholder={t("phone.token.placeholder")}
        value={value}
        onChange={e => setValue(e.target.value)}
      />
      <Button type="submit" className="h-11" disabled={!clean}>{t("phone.token.submit")}</Button>
      <p className="text-xs text-muted-foreground">{t("phone.token.help")}</p>
    </form>
  );
}

function LayoutSwitchButton({ onSwitch, compact = false }: { onSwitch(): void; compact?: boolean }) {
  const t = useT();
  const label = t("phone.mobileView");
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(compact ? "h-7 w-7 rounded" : "h-10 w-10", "text-muted-foreground hover:text-foreground")}
      aria-label={label}
      title={label}
      onClick={onSwitch}
    >
      <Smartphone className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} />
    </Button>
  );
}

function AlertsButton({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const [state, setState] = useState<NotificationState>(() => notificationState());

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
  const iconClass = compact ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        compact ? "h-7 w-7 rounded" : "h-10 w-10",
        state === "granted" ? "text-emerald-500" : "text-muted-foreground",
      )}
      aria-label={`${t("phone.alerts.label")}: ${label}`}
      title={label}
      disabled={off && state !== "granted"}
      onClick={() => { if (!off) void askForNotifications().then(setState); }}
    >
      {state === "granted" ? <Bell className={iconClass} /> : <BellOff className={iconClass} />}
    </Button>
  );
}

const LEVEL_COLOR = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-destructive",
};

const LEVEL_ICON = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
};

function DiagnosticsButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn(compact ? "h-7 w-7 rounded" : "h-10 w-10", "text-muted-foreground hover:text-foreground")}
        onClick={() => setOpen(true)}
      >
        <Stethoscope className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} />
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
            {running ? <Spinner aria-hidden className="mr-2 h-4 w-4" /> : <Stethoscope className="mr-2 h-4 w-4" />}
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
