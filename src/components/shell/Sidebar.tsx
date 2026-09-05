import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectDialog } from "@/components/ProjectDialog";
import { ChatDialog } from "@/components/ChatDialog";
import { island } from "@/components/ui/island";
import { isChatActive } from "@/lib/chat";
import type { Project } from "@/types";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Home,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Settings,
  Users,
} from "lucide-react";

/** Left rail: home, the project tree with its chats, and the settings gear. */
export function Sidebar() {
  const projects = useAppStore(state => state.config.projects);
  const chats = useAppStore(state => state.config.chats);
  const runtime = useAppStore(state => state.runtime);
  const approvals = useAppStore(state => state.approvals);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const currentChatId = useAppStore(state => state.currentChatId);
  const screen = useAppStore(state => state.screen);
  const settingsOpen = useAppStore(state => state.settingsOpen);
  const sidebarCollapsed = useAppStore(state => state.sidebarCollapsed);
  const sidebarOpen = useAppStore(state => state.sidebarOpen);
  const openHome = useAppStore(state => state.openHome);
  const openProject = useAppStore(state => state.openProject);
  const openSettings = useAppStore(state => state.openSettings);
  const toggleSidebarProject = useAppStore(state => state.toggleSidebarProject);
  const setCurrentProject = useAppStore(state => state.setCurrentProject);
  const removeProject = useAppStore(state => state.removeProject);
  const removeChat = useAppStore(state => state.removeChat);

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | undefined>(undefined);

  // A chat's "is it answering right now" lives outside the store, so poll it.
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 800);
    return () => clearInterval(interval);
  }, []);

  // Counting inside a selector would return a fresh object on every call and loop forever.
  const runningByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [projectId, agents] of Object.entries(runtime)) {
      let n = 0;
      for (const r of Object.values(agents)) if (r.status === "working" || r.status === "waiting") n++;
      counts[projectId] = n;
    }
    return counts;
  }, [runtime]);

  const totalRunning = useMemo(
    () => Object.values(runningByProject).reduce((a, b) => a + b, 0),
    [runningByProject],
  );
  const pendingApprovals = useMemo(
    () => Object.values(approvals).filter(a => a.status === "pending").length,
    [approvals],
  );

  const newProject = () => {
    setEditingProject(undefined);
    setProjectDialogOpen(true);
  };

  const editProject = (p: Project) => {
    setEditingProject(p);
    setProjectDialogOpen(true);
  };

  const deleteProject = async (p: Project) => {
    const confirmed = await island.confirm({
      title: "¿Eliminar proyecto?",
      description: `Se eliminará ${p.name} y se perderán sus mensajes y runs.`,
      destructive: true,
    });
    if (confirmed) removeProject(p.id);
  };

  const newChat = (projectId: string) => {
    // ChatDialog creates the chat in `currentProjectId`, so point it at this project first.
    setCurrentProject(projectId);
    setEditingChatId(undefined);
    setChatDialogOpen(true);
  };

  const editChat = (chatId: string) => {
    setEditingChatId(chatId);
    setChatDialogOpen(true);
  };

  const deleteChat = async (chatId: string, name: string, projectId: string) => {
    const confirmed = await island.confirm({
      title: "¿Eliminar chat?",
      description: `Se eliminará ${name} y sus mensajes.`,
      destructive: true,
    });
    if (!confirmed) return;
    const wasCurrent = useAppStore.getState().currentChatId === chatId;
    removeChat(chatId);
    // Deleting the open chat falls back to the project's orchestrator thread.
    if (wasCurrent) openProject(projectId, null);
  };

  return (
    <aside
      className={`shrink-0 overflow-hidden bg-card transition-[width] duration-200 ${
        sidebarOpen ? "w-[260px] border-r border-border" : "w-0"
      }`}
      aria-hidden={!sidebarOpen}
    >
      <div className="w-[260px] h-full flex flex-col">
      <div className="p-3 flex flex-col gap-2 border-b border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold tracking-tight">ainess</span>
          <span className="text-[10px] text-muted-foreground">Orquestador</span>
        </div>
        <Button
          variant={screen === "home" ? "secondary" : "ghost"}
          size="sm"
          className="justify-start"
          onClick={openHome}
        >
          <Home className="h-4 w-4" /> Inicio
        </Button>
        <Button variant="ghost" size="sm" className="justify-start" onClick={newProject}>
          <Plus className="h-4 w-4" /> Nuevo proyecto
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {projects.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-6">Sin proyectos</div>
        )}
        {projects.map(p => {
          const collapsed = !!sidebarCollapsed[p.id];
          const running = runningByProject[p.id] ?? 0;
          const projectChats = chats.filter(c => c.projectId === p.id);
          const isOpenProject = currentProjectId === p.id && screen === "project";

          return (
            <div key={p.id} className="flex flex-col">
              <div
                className={`group flex items-center gap-1 rounded-md px-1.5 py-1.5 text-sm cursor-pointer hover:bg-accent ${isOpenProject ? "bg-accent/60" : ""}`}
                onClick={() => openProject(p.id, null)}
              >
                <button
                  type="button"
                  className="p-0.5 text-muted-foreground hover:text-foreground"
                  title={collapsed ? "Expandir" : "Colapsar"}
                  onClick={e => {
                    e.stopPropagation();
                    toggleSidebarProject(p.id);
                  }}
                >
                  {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || "#4f8cff" }} />
                <span className="truncate flex-1 font-medium">{p.name}</span>
                {running > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-orange-500/15 text-orange-500 border-orange-500/30">
                    {running}
                  </Badge>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-foreground"
                      title="Opciones del proyecto"
                      onClick={e => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                    <DropdownMenuItem onSelect={() => editProject(p)}>Editar proyecto</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => newChat(p.id)}>Nuevo chat</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => void deleteProject(p)}>
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {!collapsed && (
                <div className="ml-4 flex flex-col">
                  <button
                    type="button"
                    className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs text-left hover:bg-accent ${
                      isOpenProject && currentChatId === null ? "bg-accent font-medium" : "text-muted-foreground"
                    }`}
                    onClick={() => openProject(p.id, null)}
                  >
                    <Bot className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Orquestador</span>
                  </button>

                  {projectChats.map(chat => {
                    const active = isChatActive(chat.id);
                    const selected = currentProjectId === p.id && currentChatId === chat.id && screen === "project";
                    return (
                      <div
                        key={chat.id}
                        className={`group/chat flex items-center gap-2 rounded-md px-2 py-1 text-xs cursor-pointer hover:bg-accent ${
                          selected ? "bg-accent font-medium" : "text-muted-foreground"
                        }`}
                        onClick={() => openProject(p.id, chat.id)}
                      >
                        {chat.mode === "shared"
                          ? <Users className="h-3.5 w-3.5 shrink-0" />
                          : <MessageCircle className="h-3.5 w-3.5 shrink-0" />}
                        <span className="truncate flex-1">{chat.name}</span>
                        {active && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="p-0.5 opacity-0 group-hover/chat:opacity-100 focus:opacity-100 hover:text-foreground"
                              title="Opciones del chat"
                              onClick={e => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                            <DropdownMenuItem onSelect={() => editChat(chat.id)}>Renombrar</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => void deleteChat(chat.id, chat.name, p.id)}
                            >
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground text-left hover:bg-accent hover:text-foreground"
                    onClick={() => newChat(p.id)}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" /> Nuevo chat
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span>{totalRunning} trabajando</span>
          {pendingApprovals > 0 && (
            <Badge
              className="ml-auto cursor-pointer bg-amber-500 text-black hover:bg-amber-500"
              title="Delegaciones esperando tu aprobación"
              onClick={() => currentProjectId && openProject(currentProjectId)}
            >
              {pendingApprovals} pendiente{pendingApprovals === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <Button
          variant={settingsOpen ? "secondary" : "ghost"}
          size="sm"
          className="justify-start"
          onClick={() => openSettings()}
        >
          <Settings className="h-4 w-4" /> Configuración
        </Button>
      </div>

      <ProjectDialog
        isOpen={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        editProject={editingProject}
      />
      {/* Remounted per target so ChatDialog picks up the right initial state. */}
      {chatDialogOpen && (
        <ChatDialog
          key={editingChatId ?? "new"}
          open={chatDialogOpen}
          onOpenChange={setChatDialogOpen}
          editChatId={editingChatId}
        />
      )}
      </div>
    </aside>
  );
}
