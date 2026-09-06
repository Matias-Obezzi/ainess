import { useMemo } from "react";
import { useAppStore, selectProject } from "@/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApprovalsPanel } from "@/components/ApprovalsPanel";
import { GitBranchButton } from "@/components/GitStatus";
import { HierarchyGraph } from "@/components/HierarchyGraph";
import { OrchestratorThread } from "./OrchestratorThread";
import { ChatThread } from "./ChatThread";
import { Composer } from "./Composer";
import { GitBranch, MessageSquare, PanelRight, TerminalSquare } from "lucide-react";

/** The working screen for one project: top bar, thread or graph, and the composer. */
export function ProjectScreen() {
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
        <p>No hay un proyecto seleccionado.</p>
        <p className="text-sm">Elegí uno en el panel izquierdo o creá uno nuevo.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-12 shrink-0 border-b border-border flex items-center gap-3 px-4">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color || "#4f8cff" }} />
        <span className="font-semibold text-sm truncate">{project.name}</span>
        <span className="text-xs text-muted-foreground truncate max-w-[280px]" title={project.workspaceDir}>
          {project.workspaceDir}
        </span>
        <GitBranchButton projectId={project.id} />

        <Badge variant={running > 0 ? "default" : "outline"} className="ml-auto text-[10px]">
          {running} trabajando
        </Badge>

        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button
            variant={projectMode === "chat" ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            onClick={() => setProjectMode("chat")}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Chat
          </Button>
          <Button
            variant={projectMode === "graph" ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            onClick={() => setProjectMode("graph")}
          >
            <GitBranch className="h-3.5 w-3.5" /> Jerarquía
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={commPanelOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            title="Mostrar u ocultar el panel de comunicación"
            onClick={() => toggleCommPanel()}
          >
            <PanelRight className="h-3.5 w-3.5" /> Comunicación
          </Button>
          <Button
            variant={termPanelOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            title="Mostrar u ocultar las terminales (Ctrl+`)"
            onClick={() => {
              const wasOpen = termPanelOpen;
              toggleTermPanel();
              if (!wasOpen && useAppStore.getState().terminals.length === 0) {
                useAppStore.getState().openTerminal();
              }
            }}
          >
            <TerminalSquare className="h-3.5 w-3.5" /> Terminal
          </Button>
        </div>
      </div>

      <div className="px-4 pt-3 empty:hidden">
        <ApprovalsPanel />
      </div>

      <div className="flex-1 min-h-0">
        {projectMode === "graph"
          ? <HierarchyGraph />
          : currentChatId
            ? <ChatThread chatId={currentChatId} />
            : <OrchestratorThread />}
      </div>

      <Composer />
    </div>
  );
}
