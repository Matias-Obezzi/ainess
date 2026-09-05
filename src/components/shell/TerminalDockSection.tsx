import { useEffect, useRef, useState } from "react";
import { useAppStore, MAX_TERMINALS } from "@/store";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TerminalView } from "./TerminalView";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, TerminalSquare, X } from "lucide-react";

/** Terminals section of the right dock: tab bar plus the live xterm views. */
export function TerminalDockSection() {
  const terminals = useAppStore(state => state.terminals);
  const activeTerminalId = useAppStore(state => state.activeTerminalId);
  const shells = useAppStore(state => state.shells);
  const openTerminal = useAppStore(state => state.openTerminal);
  const closeTerminal = useAppStore(state => state.closeTerminal);
  const setActiveTerminal = useAppStore(state => state.setActiveTerminal);
  const renameTerminal = useAppStore(state => state.renameTerminal);
  const toggleTermPanel = useAppStore(state => state.toggleTermPanel);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.select();
  }, [renamingId]);

  const atLimit = terminals.length >= MAX_TERMINALS;
  const noShells = shells.length === 0;

  const startRename = (id: string, title: string) => {
    setRenamingId(id);
    setDraft(title);
  };

  const commitRename = () => {
    if (renamingId) renameTerminal(renamingId, draft);
    setRenamingId(null);
  };

  const addTitle = noShells
    ? "No se detectó ningún shell en esta máquina"
    : atLimit
      ? `Máximo de ${MAX_TERMINALS} terminales abiertas`
      : "Nueva terminal";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Terminales</span>
        <div className="ml-auto flex items-center gap-0.5">
          {/* A disabled button has `pointer-events: none`, so the tooltip lives on the wrapper. */}
          <span title={addTitle} className="inline-flex">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={atLimit || noShells}
              onClick={() => openTerminal()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-5"
                title="Elegir shell"
                disabled={atLimit || noShells}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {shells.map(shell => (
                <DropdownMenuItem key={shell.id} onSelect={() => openTerminal({ shellId: shell.id })}>
                  <TerminalSquare className="h-3.5 w-3.5" /> {shell.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Cerrar"
            onClick={() => toggleTermPanel(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {terminals.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-1.5 py-1">
          {terminals.map(tab => (
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              title={`${tab.title} — ${tab.cwd || "home"}`}
              onClick={() => setActiveTerminal(tab.id)}
              onDoubleClick={() => startRename(tab.id, tab.title)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveTerminal(tab.id);
                }
              }}
              className={cn(
                "group flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs",
                tab.id === activeTerminalId
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <TerminalSquare className="h-3.5 w-3.5 shrink-0" />
              {renamingId === tab.id ? (
                <input
                  ref={renameInputRef}
                  value={draft}
                  autoFocus
                  onChange={e => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitRename();
                    else if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="w-24 bg-transparent text-xs outline-none"
                />
              ) : (
                <span className="max-w-[120px] truncate">{tab.title}</span>
              )}
              {tab.exited != null && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
                  title={`Terminado con código ${tab.exited}`}
                />
              )}
              <button
                type="button"
                title="Cerrar terminal"
                className="ml-0.5 shrink-0 rounded opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={e => {
                  e.stopPropagation();
                  closeTerminal(tab.id);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {terminals.length === 0 ? (
          <EmptyState
            icon={TerminalSquare}
            title="No hay terminales abiertas"
            description={
              noShells
                ? "No se detectó ningún shell en esta máquina."
                : "Se abre en la carpeta del proyecto actual."
            }
            action={noShells ? undefined : { label: "Abrir terminal", onClick: () => openTerminal() }}
          />
        ) : (
          // Every tab stays mounted so its scrollback survives switching.
          terminals.map(tab => (
            <div
              key={tab.id}
              className={cn("absolute inset-0", tab.id === activeTerminalId ? "" : "hidden")}
            >
              <TerminalView terminal={tab} active={tab.id === activeTerminalId} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
