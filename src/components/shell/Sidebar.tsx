import { useEffect, useMemo, useState } from "react";
import { useAppStore, selectProjectAgents, PANE_MIN_WIDTH, PANE_MAX_WIDTH } from "@/store";
import { ResizeHandle } from "./ResizeHandle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ContextActionItems, DropdownActionItems, type MenuAction } from "@/components/menu-actions";
import { ProjectDialog } from "@/components/ProjectDialog";
import { GitStatusLine } from "@/components/GitStatus";
import { ChatDialog } from "@/components/ChatDialog";
import { toast } from "@/components/ui/toast";
import { copyText } from "@/lib/clipboard";
import { openFolder } from "@/lib/open-external";
import { confirm } from "@/lib/confirm";
import { openExternal } from "@/lib/open-external";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isChatActive } from "@/lib/chat";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";
import { pendingApprovals } from "@/lib/approvals";
import { isAutonomous } from "@/lib/autonomous";
import type { Chat, Project } from "@/types";
import { FolderOpen,
  Bot,
  Bug,
  ChevronDown,
  ChevronRight,
  Copy,
  GitBranch,
  Home,
  ListTodo,
  Moon,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Users,
} from "lucide-react";

/** Straight to the issue templates, opened in the user's own browser. */
const ISSUES_URL = "https://github.com/Matias-Obezzi/ainess/issues/new/choose";

/** Left rail: home, the project tree with its chats, and the settings gear. */
export function Sidebar() {
  const t = useT();
  const projects = useAppStore(state => state.config.projects);
  const chats = useAppStore(state => state.config.chats);
  const runtime = useAppStore(state => state.runtime);
  const approvals = useAppStore(state => state.approvals);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const currentChatId = useAppStore(state => state.currentChatId);
  const screen = useAppStore(state => state.screen);
  // Which of the three rows is the one you are looking at.
  const projectMode = useAppStore(state => state.projectMode);
  const settingsOpen = useAppStore(state => state.settingsOpen);
  const sidebarCollapsed = useAppStore(state => state.sidebarCollapsed);
  const sidebarOpen = useAppStore(state => state.sidebarOpen);
  const width = useAppStore(state => state.paneWidths.sidebar);
  const setPaneWidth = useAppStore(state => state.setPaneWidth);
  // While the divider is held the width follows the pointer, so the open/close animation is off.
  const [resizing, setResizing] = useState(false);
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
  const pendingCount = useMemo(
    () => pendingApprovals(approvals, projects).length,
    [approvals, projects],
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
    const confirmed = await confirm({
      title: t("sidebar.deleteProject.title"),
      description: t("sidebar.deleteProject.body", { name: p.name }),
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

  // Starting over: every agent forgets this project's session, so the next prompt has no context.
  const newConversation = (projectId: string) => {
    const s = useAppStore.getState();
    for (const a of selectProjectAgents(s, projectId)) s.resetSession(a.id, projectId);
    toast.success(t("sidebar.newConversationDone"));
  };

  const deleteChat = async (chatId: string, name: string, projectId: string) => {
    const confirmed = await confirm({
      title: t("sidebar.deleteChat.title"),
      description: t("sidebar.deleteChat.body", { name }),
      destructive: true,
    });
    if (!confirmed) return;
    const wasCurrent = useAppStore.getState().currentChatId === chatId;
    removeChat(chatId);
    // Deleting the open chat falls back to the project's orchestrator thread.
    if (wasCurrent) openProject(projectId, null);
  };

  // The three-dot menu and the right click on a project row share these actions; only the right
  // click, where the pointer is already on the row, offers the path.
  /**
   * What a project offers. The right click and the three dots are the same menu in two shapes, so
   * they render this same list: the path used to be in one and not the other.
   */
  const projectActions = (p: Project): MenuAction[] => [
    { key: "edit", label: t("sidebar.editProject"), icon: Pencil, onSelect: () => editProject(p) },
    { key: "new-chat", label: t("sidebar.newChat"), icon: Plus, onSelect: () => newChat(p.id) },
    { key: "new-conversation", label: t("sidebar.newConversation"), icon: RotateCcw, onSelect: () => newConversation(p.id) },
    {
      key: "open-folder",
      label: t("project.openFolder"),
      icon: FolderOpen,
      disabled: !p.workspaceDir,
      separatorBefore: true,
      onSelect: () => void openFolder(p.workspaceDir),
    },
    {
      key: "copy-path",
      label: t("sidebar.copyPath"),
      icon: Copy,
      disabled: !p.workspaceDir,
      onSelect: () => void copyText(p.workspaceDir, t("sidebar.pathCopied")),
    },
    {
      key: "delete",
      label: t("common.delete"),
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      onSelect: () => void deleteProject(p),
    },
  ];

  const chatActions = (chat: Chat, projectId: string): MenuAction[] => [
    {
      key: "open",
      label: t("common.open"),
      icon: MessageCircle,
      onSelect: () => openProject(projectId, chat.id),
    },
    { key: "rename", label: t("common.rename"), icon: Pencil, onSelect: () => editChat(chat.id) },
    {
      key: "delete",
      label: t("common.delete"),
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      onSelect: () => void deleteChat(chat.id, chat.name, projectId),
    },
  ];

  return (
    <>
    <aside
      className={`shrink-0 overflow-hidden bg-card ${resizing ? "" : "transition-[width] duration-200"} ${
        sidebarOpen ? "border-r border-border" : ""
      }`}
      style={{ width: sidebarOpen ? width : 0 }}
      aria-hidden={!sidebarOpen}
    >
      {/* The inner column keeps its width while the outer one animates to zero, so closing
          slides the menu out instead of squeezing it. */}
      <div className="h-full flex flex-col" style={{ width }}>
      <div className="p-3 flex flex-col gap-2 border-b border-border">
        <Button
          variant={screen === "home" ? "secondary" : "ghost"}
          size="sm"
          className="justify-start"
          onClick={openHome}
        >
          <Home className="h-4 w-4" /> {t("sidebar.home")}
        </Button>
        <Button variant="ghost" size="sm" className="justify-start" onClick={newProject}>
          <Plus className="h-4 w-4" /> {t("sidebar.newProject")}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {projects.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-6">{t("sidebar.noProjects")}</div>
        )}
        {projects.map(p => {
          const collapsed = !!sidebarCollapsed[p.id];
          const running = runningByProject[p.id] ?? 0;
          const projectChats = chats.filter(c => c.projectId === p.id);
          const isOpenProject = currentProjectId === p.id && screen === "project";

          return (
            <div key={p.id} className="flex flex-col gap-0.5">
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    className={`group flex flex-col rounded-md px-1.5 py-1.5 text-sm cursor-pointer hover:bg-accent ${isOpenProject ? "bg-accent/60" : ""}`}
                    // First click lands where the project was left; a click on the project that is
                    // already open is a way back to its orchestrator from wherever it was left in.
                    onClick={() => (isOpenProject ? openProject(p.id, null, "chat") : openProject(p.id))}
                    // Right clicking a row selects it first, the way a file explorer does.
                    onContextMenu={() => openProject(p.id)}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="p-0.5 text-muted-foreground hover:text-foreground"
                        title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
                        onClick={e => {
                          e.stopPropagation();
                          toggleSidebarProject(p.id);
                        }}
                      >
                        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      {/* Working shows in the dot itself: the orange count next to the name read
                          like something waiting for an answer. */}
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${running > 0 ? "animate-breathe" : ""}`}
                        style={{ backgroundColor: p.color || "#4f8cff" }}
                        title={running > 0 ? t("projectScreen.working", { n: running }) : undefined}
                      />
                      <span className="truncate flex-1 font-medium">{p.name}</span>
                      {/* A project left running unattended is the one thing about it you want to
                          know without opening it — the button that turns it on is inside. */}
                      {isAutonomous(p) && (
                        <Moon
                          className="h-3.5 w-3.5 shrink-0 text-amber-500"
                          aria-label={t("autonomous.mode")}
                        >
                          <title>{t("autonomous.mode")}</title>
                        </Moon>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-foreground"
                            title={t("sidebar.projectOptions")}
                            onClick={e => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                          <DropdownActionItems actions={projectActions(p)} />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <GitStatusLine projectId={p.id} />
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextActionItems actions={projectActions(p)} />
                </ContextMenuContent>
              </ContextMenu>

              {!collapsed && (
                <div className="ml-4 mt-0.5 mb-1 flex flex-col gap-0.5">
                  {/* The project's three views. They were a segmented control in the top bar, which
                      is the one place that has to hold the project name, the branch, the spend and
                      every panel toggle — and they are navigation, which is what this rail is for.
                      Each row says which view it opens rather than leaving the mode to whatever the
                      project was last left in. */}
                  {([
                    { mode: "chat", icon: Bot, label: t("sidebar.orchestrator") },
                    { mode: "tasks", icon: ListTodo, label: t("projectScreen.tasks") },
                    { mode: "graph", icon: GitBranch, label: t("projectScreen.hierarchy") },
                  ] as const).map(row => {
                    // A chat of its own is showing: none of the three is where you are, not even
                    // the orchestrator, whose row means "the project's own thread".
                    const here = isOpenProject && currentChatId === null && projectMode === row.mode;
                    const Icon = row.icon;
                    return (
                      <button
                        key={row.mode}
                        type="button"
                        className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs text-left hover:bg-accent ${
                          here ? "bg-accent font-medium" : "text-muted-foreground"
                        }`}
                        onClick={() => openProject(p.id, null, row.mode)}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{row.label}</span>
                      </button>
                    );
                  })}

                  {projectChats.map(chat => {
                    const active = isChatActive(chat.id);
                    const selected = currentProjectId === p.id && currentChatId === chat.id && screen === "project";
                    return (
                      <ContextMenu key={chat.id}>
                        <ContextMenuTrigger asChild>
                          <div
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
                                  title={t("sidebar.chatOptions")}
                                  onClick={e => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                                <DropdownActionItems actions={chatActions(chat, p.id)} />
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                          <ContextActionItems actions={chatActions(chat, p.id)} />
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}

                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground text-left hover:bg-accent hover:text-foreground"
                    onClick={() => newChat(p.id)}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" /> {t("sidebar.newChat")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span>{t("sidebar.working", { n: totalRunning })}</span>
          {pendingCount > 0 && (
            <Badge
              className="ml-auto cursor-pointer bg-amber-500 text-black hover:bg-amber-500"
              title={t("sidebar.pendingTitle")}
              onClick={() => currentProjectId && openProject(currentProjectId)}
            >
              {plural(pendingCount, t("sidebar.pending.one", { n: pendingCount }), t("sidebar.pending.other", { n: pendingCount }))}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={settingsOpen ? "secondary" : "ghost"}
            size="sm"
            className="flex-1 justify-start"
            onClick={() => openSettings()}
          >
            <Settings className="h-4 w-4" /> {t("sidebar.settings")}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={t("sidebar.reportIssue")}
                onClick={() => void openExternal(ISSUES_URL)}
              >
                <Bug className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("sidebar.reportIssue")}</TooltipContent>
          </Tooltip>
        </div>
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
    {sidebarOpen && (
      <ResizeHandle
        side="left"
        width={width}
        min={PANE_MIN_WIDTH.sidebar}
        max={PANE_MAX_WIDTH.sidebar}
        onResize={w => setPaneWidth("sidebar", w)}
        onResizingChange={setResizing}
      />
    )}
    </>
  );
}
