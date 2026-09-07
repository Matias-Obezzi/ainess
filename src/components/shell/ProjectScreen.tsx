import { useMemo } from "react";
import { useAppStore, selectProject } from "@/store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { GitBranchButton } from "@/components/GitStatus";
import { UsageButton } from "@/components/UsageDialog";
import { HierarchyGraph } from "@/components/HierarchyGraph";
import { TasksView } from "@/components/tasks/TasksView";
import { OrchestratorThread } from "./OrchestratorThread";
import { ChatThread } from "./ChatThread";
import { Composer } from "./Composer";
import { useT } from "@/i18n/useT";
import { GitBranch, ListTodo, MessageSquare, PanelRight, TerminalSquare } from "lucide-react";

/** The working screen for one project: top bar, task board / thread / hierarchy, and the composer. */
export function ProjectScreen() {
  const t = useT();
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const currentChatId = useAppStore(state => state.currentChatId);
  const projectMode = useAppStore(state => state.projectMode);
  const setProjectMode = useAppStore(state => state.setProjectMode);
  const commPanelOpen = useAppStore(state => state.commPanelOpen);
  const toggleCommPanel = useAppStore(state => state.toggleCommPanel);
  const termPanelOpen = useAppStore(state => state.termPanelOpen);
  const toggleTermPanel = useAppStore(state => state.toggleTermPanel);
  const runtime = useAppStore(state => state.runtime);
  const project = useAppStore(state => selectProject(state, state.currentProjectId));

  // Counting in a selector would build a new object each call and re-render forever.
  const running = useMemo(() => {
    if (!currentProjectId) return 0;
    const projectRuntime = runtime[currentProjectId];
    if (!projectRuntime) return 0;
    return Object.values(projectRuntime).filter(r => r.status === "working" || r.status === "waiting").length;
  }, [runtime, currentProjectId]);

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2">
        <p>{t("projectScreen.noProject.title")}</p>
        <p className="text-sm">{t("projectScreen.noProject.body")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-12 shrink-0 border-b border-border flex items-center gap-3 px-4">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color || "#4f8cff" }} />
        {/* The path is long, never read at a glance and was eating the bar: it lives on the name. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-semibold text-sm truncate">{project.name}</span>
          </TooltipTrigger>
          {/* Below the name and aligned to it: on top (the default) a path this long went under
              the window bar, where it is clipped and unreadable. */}
          <TooltipContent side="bottom" align="start" sideOffset={6} className="font-mono text-xs">
            {project.workspaceDir}
          </TooltipContent>
        </Tooltip>
        <GitBranchButton projectId={project.id} />
        <UsageButton projectId={project.id} />

        <Badge variant={running > 0 ? "default" : "outline"} className="ml-auto text-[10px]">
          {t("projectScreen.working", { n: running })}
        </Badge>

        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button
            variant={projectMode === "tasks" ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            onClick={() => setProjectMode("tasks")}
          >
            <ListTodo className="h-3.5 w-3.5" /> {t("projectScreen.tasks")}
          </Button>
          <Button
            variant={projectMode === "chat" ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            onClick={() => setProjectMode("chat")}
          >
            <MessageSquare className="h-3.5 w-3.5" /> {t("projectScreen.chat")}
          </Button>
          <Button
            variant={projectMode === "graph" ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            onClick={() => setProjectMode("graph")}
          >
            <GitBranch className="h-3.5 w-3.5" /> {t("projectScreen.hierarchy")}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={commPanelOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            title={t("projectScreen.toggleComm")}
            onClick={() => toggleCommPanel()}
          >
            <PanelRight className="h-3.5 w-3.5" /> {t("projectScreen.comm")}
          </Button>
          <Button
            variant={termPanelOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            title={t("projectScreen.toggleTerminals")}
            onClick={() => {
              const wasOpen = termPanelOpen;
              toggleTermPanel();
              if (!wasOpen && useAppStore.getState().terminals.length === 0) {
                useAppStore.getState().openTerminal();
              }
            }}
          >
            <TerminalSquare className="h-3.5 w-3.5" /> {t("projectScreen.terminal")}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {projectMode === "tasks"
          ? <TasksView projectId={project.id} />
          : projectMode === "graph"
            ? <HierarchyGraph />
            : currentChatId
              ? <ChatThread chatId={currentChatId} />
              : <OrchestratorThread />}
      </div>

      {/* Only the conversation takes a prompt: the board and the hierarchy are not places to type. */}
      {projectMode === "chat" && <Composer />}
    </div>
  );
}
