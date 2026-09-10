import { useAppStore, selectProject } from "@/store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GitBranchButton } from "@/components/GitStatus";
import { UsageButton } from "@/components/UsageDialog";
import { AutonomousToggleButton, AutonomousBanner } from "@/components/AutonomousControl";
import { HierarchyGraph } from "@/components/HierarchyGraph";
import { TasksView } from "@/components/tasks/TasksView";
import { OrchestratorThread } from "./OrchestratorThread";
import { ChatThread } from "./ChatThread";
import { Composer } from "./Composer";
import { useT } from "@/i18n/useT";
import { MessagesSquare, TerminalSquare, FileDiff } from "lucide-react";

/** The working screen for one project: top bar, task board / thread / hierarchy, and the composer. */
export function ProjectScreen() {
  const t = useT();
  const currentChatId = useAppStore(state => state.currentChatId);
  const projectMode = useAppStore(state => state.projectMode);
  const commPanelOpen = useAppStore(state => state.commPanelOpen);
  const diffPanelOpen = useAppStore(state => state.diffPanelOpen);
  const toggleCommPanel = useAppStore(state => state.toggleCommPanel);
  const toggleDiffPanel = useAppStore(state => state.toggleDiffPanel);
  const termPanelOpen = useAppStore(state => state.termPanelOpen);
  const toggleTermPanel = useAppStore(state => state.toggleTermPanel);
  const project = useAppStore(state => selectProject(state, state.currentProjectId));

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
      {/* A container, not the window: what is left for this bar depends on the sidebar and the
          right dock as much as on the window's own width. Below each threshold the labels drop to
          their icons, and the project name is what gives way first. */}
      <div className="@container h-12 shrink-0 overflow-hidden border-b border-border flex items-center gap-3 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
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
          {/* Below this the bar cannot hold them and the tabs — which are how you move around the
              project — would be the ones to go. The branch is in the sidebar too. */}
          <div className="hidden min-w-0 items-center gap-3 @xl:flex">
            <GitBranchButton projectId={project.id} />
            <UsageButton projectId={project.id} />
          </div>
        </div>

        <AutonomousToggleButton projectId={project.id} />

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant={commPanelOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            title={t("projectScreen.toggleComm")}
            onClick={() => toggleCommPanel()}
          >
            {/* What this panel holds is what the agents said to each other. A panel icon described
                where it opens, which is the least interesting thing about it. */}
            <MessagesSquare className="h-3.5 w-3.5" /> <span className="hidden @5xl:inline">{t("projectScreen.comm")}</span>
          </Button>
          <Button
            variant={diffPanelOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            title={t("projectScreen.toggleDiff")}
            onClick={() => toggleDiffPanel()}
          >
            <FileDiff className="h-3.5 w-3.5" /> <span className="hidden @5xl:inline">{t("projectScreen.diff")}</span>
          </Button>
          <Button
            variant={termPanelOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            title={t("projectScreen.toggleTerminals")}
            onClick={() => {
              const wasOpen = termPanelOpen;
              toggleTermPanel();
              const store = useAppStore.getState();
              const currentProjectId = store.currentProjectId;
              const projectTerminals = store.terminals.filter(t => t.projectId === currentProjectId);
              if (!wasOpen && projectTerminals.length === 0) {
                store.openTerminal();
              }
            }}
          >
            <TerminalSquare className="h-3.5 w-3.5" /> <span className="hidden @5xl:inline">{t("projectScreen.terminal")}</span>
          </Button>
        </div>
      </div>

      <AutonomousBanner projectId={project.id} />

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
