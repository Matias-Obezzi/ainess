import { useEffect, useRef, useState } from "react";
import { useAppStore, MAX_TERMINALS } from "@/store";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ContextActionItems, type MenuAction } from "@/components/menu-actions";
import { TerminalView } from "./TerminalView";
import { useProjectCommands } from "@/hooks/useProjectCommands";
import { QuickCommandsDialog } from "@/components/QuickCommandsDialog";
import { selectProject } from "@/store";
import { disposeTerminal, liveTerminalIds } from "@/lib/terminal-registry";
import { cn } from "@/lib/utils";
import { ChevronDown, Pencil, Play, Plus, Settings2, TerminalSquare, X } from "lucide-react";
import { useT } from "@/i18n/useT";

/** Terminals section of the right dock: tab bar plus the live xterm views. */
export function TerminalDockSection() {
  const t = useT();
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const allTerminals = useAppStore(state => state.terminals);
  const terminals = allTerminals.filter(t => t.projectId === currentProjectId);
  const activeTerminalIds = useAppStore(state => state.activeTerminalIds);
  // What this project was last looking at, when it is still open: a remembered tab can be gone (a
  // restart drops every shell) and a bar with tabs and nothing in front shows an empty panel.
  const remembered = activeTerminalIds[currentProjectId ?? "home"] ?? null;
  const activeTerminalId = terminals.some(t => t.id === remembered) ? remembered : (terminals[0]?.id ?? null);
  const shells = useAppStore(state => state.shells);
  const openTerminal = useAppStore(state => state.openTerminal);
  const closeTerminal = useAppStore(state => state.closeTerminal);
  const setActiveTerminal = useAppStore(state => state.setActiveTerminal);
  const renameTerminal = useAppStore(state => state.renameTerminal);
  const moveTerminal = useAppStore(state => state.moveTerminal);
  const toggleTermPanel = useAppStore(state => state.toggleTermPanel);

  // What this project's own files say it can run: the `scripts` of a package.json, the targets of a
  // Makefile, cargo's four. Read when the panel opens — the section only mounts then.
  const project = useAppStore(state => selectProject(state, state.currentProjectId));
  const detected = useProjectCommands(project?.workspaceDir);
  const [commandsOpen, setCommandsOpen] = useState(false);

  // The user's own first: they were added on purpose, and there are few of them. What a manifest
  // declares follows, already ordered by `sortCommands`.
  const own = (project?.commands ?? []).map(entry => ({ ...entry, source: "custom" as const }));
  const commands = [...own, ...detected];

  /**
   * Runs a script, or goes to it if it is already running.
   *
   * Pressing "dev" twice should not start a second dev server: the second one loses the race for
   * the port and dies with an error that looks like the app's fault. A tab whose shell already
   * exited does not count — that one is finished, and pressing the button again means run it again.
   */
  const runCommand = (command: string, label: string) => {
    const running = terminals.find(tab => tab.command === command && tab.exited == null);
    if (running) {
      setActiveTerminal(running.id);
      return;
    }
    openTerminal({ command, title: label });
  };

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  /** The tab being carried, and where it would land in the bar. */
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const atLimit = allTerminals.length >= MAX_TERMINALS;
  const noShells = shells.length === 0;

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.select();
    }
  }, [renamingId]);

  // Terminals outlive their view on purpose, so the one thing that must tear them down is the tab
  // going away: drop every live session that no longer has a tab. It reads the whole list, never
  // the ones this project is showing — walking into another project would kill the shells of the
  // one you just left.
  useEffect(() => {
    const open = new Set(allTerminals.map(t => t.id));
    for (const id of liveTerminalIds()) {
      if (!open.has(id)) disposeTerminal(id);
    }
  }, [allTerminals]);

  const startRename = (id: string, title: string) => {
    setDraft(title);
    setRenamingId(id);
  };

  const commitRename = () => {
    if (renamingId) renameTerminal(renamingId, draft);
    setRenamingId(null);
  };

  // Right click on a tab: what the tab bar itself offers, without hijacking the xterm area below
  // (there the right click belongs to the terminal, for pasting).
  const tabActions = (id: string, title: string): MenuAction[] => [
    {
      key: "new",
      label: t("terminals.new"),
      icon: Plus,
      disabled: atLimit || noShells,
      onSelect: () => openTerminal(),
    },
    { key: "rename", label: t("common.rename"), icon: Pencil, onSelect: () => startRename(id, title) },
    {
      key: "close",
      label: t("common.close"),
      icon: X,
      destructive: true,
      separatorBefore: true,
      onSelect: () => closeTerminal(id),
    },
  ];

  const addTitle = noShells
    ? t("terminals.noShells")
    : atLimit
      ? t("terminals.atLimit", { n: MAX_TERMINALS })
      : t("terminals.new");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">{t("terminals.title")}</span>
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
                title={t("terminals.pickShell")}
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
          {/* A row of buttons meant a horizontal scrollbar in a panel that is already narrow, and a
              project with twenty scripts hid nineteen of them behind it. A menu holds them all at
              full width, in the same shape as the shell picker beside it. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                title={t("terminals.scripts")}
                disabled={noShells}
              >
                <Play className="h-3.5 w-3.5" />
                <span className="hidden @sm:inline">{t("terminals.scripts")}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
              {commands.length === 0 && (
                <DropdownMenuLabel className="font-normal text-muted-foreground">
                  {t("terminals.scripts.none")}
                </DropdownMenuLabel>
              )}
              {commands.map(command => {
                const running = terminals.some(tab => tab.command === command.command && tab.exited == null);
                return (
                  <DropdownMenuItem
                    key={command.id}
                    // Full terminals stop new ones, never the jump to one that is already open.
                    disabled={atLimit && !running}
                    onSelect={() => runCommand(command.command, command.label)}
                  >
                    {running
                      ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                      : <Play className="h-3.5 w-3.5 shrink-0 opacity-60" />}
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{command.source}</span>
                  </DropdownMenuItem>
                );
              })}
              {project && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setCommandsOpen(true)}>
                    <Settings2 className="h-3.5 w-3.5" /> {t("terminals.commands.manage")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={t("common.close")}
            onClick={() => toggleTermPanel(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {terminals.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-1.5 py-1">
          {terminals.map((tab, index) => (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div
                  role="button"
                  tabIndex={0}
                  title={`${tab.title} — ${tab.cwd || "home"}`}
                  // Dragged by the tab itself. Not while renaming: there the pointer is selecting
                  // text in the field, and a drag would take the tab instead.
                  draggable={renamingId !== tab.id}
                  onDragStart={e => {
                    setDragging(tab.id);
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox starts no drag at all without something on the transfer.
                    e.dataTransfer.setData("text/plain", tab.id);
                  }}
                  onDragEnd={() => { setDragging(null); setDropIndex(null); }}
                  onDragOver={e => {
                    if (!dragging || dragging === tab.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    // Past the middle of a tab means "after it", the way tab bars behave.
                    const box = e.currentTarget.getBoundingClientRect();
                    setDropIndex(e.clientX > box.left + box.width / 2 ? index + 1 : index);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragging && dropIndex !== null) {
                      const from = terminals.findIndex(t => t.id === dragging);
                      // Removing it first shifts everything after it one to the left.
                      moveTerminal(dragging, from < dropIndex ? dropIndex - 1 : dropIndex);
                    }
                    setDragging(null);
                    setDropIndex(null);
                  }}
                  onClick={() => setActiveTerminal(tab.id)}
                  // Right clicking a tab brings it to the front first, like any tabbed editor.
                  onContextMenu={() => setActiveTerminal(tab.id)}
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
                    dragging === tab.id && "opacity-40",
                    // Where it would land, drawn as a line on that side.
                    dragging && dragging !== tab.id && dropIndex === index && "border-l-2 border-primary",
                    dragging && dragging !== tab.id && dropIndex === index + 1 && "border-r-2 border-primary",
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
                      // Inside a field the right click belongs to the browser, for pasting.
                      onContextMenu={e => e.stopPropagation()}
                      className="w-24 bg-transparent text-xs outline-none"
                    />
                  ) : (
                    <span className="max-w-[120px] truncate">{tab.title}</span>
                  )}
                  {tab.exited != null && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
                      title={t("terminals.exitedWith", { code: tab.exited })}
                    />
                  )}
                  <button
                    type="button"
                    title={t("terminals.close")}
                    className="ml-0.5 shrink-0 rounded opacity-0 group-hover:opacity-100 focus:opacity-100"
                    onClick={e => {
                      e.stopPropagation();
                      closeTerminal(tab.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextActionItems actions={tabActions(tab.id, tab.title)} />
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      )}

      {project && (
        <QuickCommandsDialog projectId={project.id} open={commandsOpen} onOpenChange={setCommandsOpen} />
      )}

      <div className="relative min-h-0 flex-1">
        {terminals.length === 0 ? (
          <EmptyState
            icon={TerminalSquare}
            title={t("terminals.empty.title")}
            description={noShells ? t("terminals.empty.noShells") : t("terminals.empty.body")}
            action={noShells ? undefined : { label: t("terminals.empty.action"), onClick: () => openTerminal() }}
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
