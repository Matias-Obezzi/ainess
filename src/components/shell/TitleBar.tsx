import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronLeft, ChevronRight, Copy, Loader2, Minus, PanelLeft, Search, Smartphone, Square, X } from "lucide-react";
import { useAppStore, canGoBack, canGoForward } from "@/store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { isTauri } from "@/lib/tauri";
import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/components/shell/NotificationBell";

/**
 * Turns the remote server on and off from the window bar, so the phone can be let in without
 * opening Configuración. The state comes from `remoteStatus`, which the app keeps in sync.
 */
function RemoteButton() {
  const running = useAppStore(state => state.remoteStatus.running);
  const ip = useAppStore(state => state.remoteStatus.ip);
  const port = useAppStore(state => state.config.remote.port);
  const busy = useAppStore(state => state.remoteBusy);
  const toggleRemote = useAppStore(state => state.toggleRemote);

  const click = async () => {
    const turningOn = !running;
    try {
      await toggleRemote(turningOn);
      toast.success(turningOn ? "Acceso remoto activo" : "Acceso remoto apagado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={running ? "Apagar el acceso remoto" : "Prender el acceso remoto"}
          disabled={busy}
          onClick={() => void click()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Smartphone className={running ? "h-4 w-4 text-emerald-500" : "h-4 w-4"} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {busy ? "Un momento…" : running ? `Acceso remoto activo en ${ip ?? "la red local"}:${port}` : "Prender el acceso remoto"}
      </TooltipContent>
    </Tooltip>
  );
}

/** Window controls are Windows-sized (46x40) and never carry the drag region. */
function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    const sync = () => {
      void win.isMaximized().then(v => {
        if (!cancelled) setMaximized(v);
      }).catch(() => {});
    };
    sync();
    void win.onResized(sync).then(fn => {
      if (cancelled) fn();
      else unlisten = fn;
    }).catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const base = "h-10 w-[46px] inline-flex items-center justify-center text-muted-foreground transition-colors";

  return (
    <div className="flex items-stretch">
      <button
        type="button"
        title="Minimizar"
        aria-label="Minimizar"
        className={`${base} hover:bg-accent hover:text-accent-foreground`}
        onClick={() => void getCurrentWindow().minimize().catch(() => {})}
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        title={maximized ? "Restaurar" : "Maximizar"}
        aria-label={maximized ? "Restaurar" : "Maximizar"}
        className={`${base} hover:bg-accent hover:text-accent-foreground`}
        onClick={() => void getCurrentWindow().toggleMaximize().catch(() => {})}
      >
        {maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        title="Cerrar"
        aria-label="Cerrar"
        className={`${base} hover:bg-destructive hover:text-white`}
        // Goes through close() so the tray's CloseRequested handler still decides what happens.
        onClick={() => void getCurrentWindow().close().catch(() => {})}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Custom title bar: drag region, sidebar toggle, search, back/forward and the window controls. */
export function TitleBar() {
  const sidebarOpen = useAppStore(state => state.sidebarOpen);
  const toggleSidebar = useAppStore(state => state.toggleSidebar);
  const toggleSearch = useAppStore(state => state.toggleSearch);
  const goBack = useAppStore(state => state.goBack);
  const goForward = useAppStore(state => state.goForward);
  const backEnabled = useAppStore(canGoBack);
  const forwardEnabled = useAppStore(canGoForward);

  return (
    <div
      data-tauri-drag-region
      className="h-[var(--titlebar-h)] shrink-0 relative z-[60] flex items-center justify-between border-b border-border bg-card select-none pointer-events-auto"
    >
      <div className="flex items-center gap-1 px-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={sidebarOpen ? "Ocultar sidebar" : "Mostrar sidebar"}
              onClick={() => toggleSidebar()}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{sidebarOpen ? "Ocultar sidebar" : "Mostrar sidebar"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Buscar"
              onClick={() => toggleSearch(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Buscar (Ctrl+K)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Atrás"
              disabled={!backEnabled}
              onClick={goBack}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Atrás</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Adelante"
              disabled={!forwardEnabled}
              onClick={goForward}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Adelante</TooltipContent>
        </Tooltip>
      </div>

      <span
        data-tauri-drag-region
        className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 pointer-events-none text-xs font-semibold tracking-wide text-muted-foreground"
      >
        <Logo size={14} />
        ainess
      </span>

      <div className="flex items-center">
        <NotificationBell />
        <RemoteButton />
        {isTauri() ? <WindowControls /> : <div className="w-2" />}
      </div>
    </div>
  );
}
