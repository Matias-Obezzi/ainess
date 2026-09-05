import { Handle, Position } from "@xyflow/react";
import { AgentConfig } from "@/types";
import { useAppStore } from "@/store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "./StatusDot";
import { statusLabel, roleLabel } from "@/lib/labels";
import { PROVIDERS } from "@/lib/providers";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { InstructDialog } from "./InstructDialog";
import { RunDetailDialog } from "./RunDetailDialog";

export function AgentNode({ data }: { data: { agent: AgentConfig } }) {
  const { agent } = data;
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const runtime = useAppStore(state => {
    if (!currentProjectId) return undefined;
    return state.runtime[currentProjectId]?.[agent.id];
  });
  const binaries = useAppStore(state => state.binaries);
  const stopAgent = useAppStore(state => state.stopAgent);
  const runs = useAppStore(state => state.runs);
  
  const [instructOpen, setInstructOpen] = useState(false);
  const [runDetailOpen, setRunDetailOpen] = useState(false);

  const status = runtime?.status || "idle";
  const binaryInfo = binaries[agent.provider];

  const agentRuns = Object.values(runs)
    .filter(r => r.agentId === agent.id && r.projectId === currentProjectId)
    .sort((a, b) => b.startedAt - a.startedAt);
  const lastRunId = agentRuns.length > 0 ? agentRuns[0].id : null;

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Card 
        className="w-[220px] p-3 flex flex-col gap-2 shadow-sm"
        style={{ borderLeft: `4px solid ${agent.color || "#888"}` }}
      >
        <div className="flex justify-between items-start">
          <div className="font-semibold text-sm truncate">{agent.name}</div>
          {binaryInfo === null && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                </TooltipTrigger>
                <TooltipContent>CLI no encontrado</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="flex gap-1 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">{PROVIDERS[agent.provider]?.label || agent.provider}</Badge>
          <Badge variant="outline" className="text-[10px]">{roleLabel[agent.role] || agent.role}</Badge>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
          <StatusDot status={status} />
          <span>{statusLabel[status] || status}</span>
        </div>

        {(() => {
          const store = useAppStore.getState();
          const otherProjects = Object.entries(store.runtime).filter(([pId, pRuntime]) => pId !== currentProjectId && (pRuntime[agent.id]?.status === "working" || pRuntime[agent.id]?.status === "waiting"));
          if (otherProjects.length > 0) {
            const projectNames = otherProjects.map(([pId]) => store.config.projects.find(p => p.id === pId)?.name).filter(Boolean);
            return (
              <Badge variant="secondary" className="text-[9px] mt-1 self-start bg-orange-100 text-orange-800 border-orange-200">
                ocupado en: {projectNames.join(", ")}
              </Badge>
            );
          }
          return null;
        })()}

        {runtime?.currentTask && (
          <div className="text-xs text-muted-foreground line-clamp-2 mt-1" title={runtime.currentTask}>
            {runtime.currentTask}
          </div>
        )}

        <div className="flex gap-2 mt-2 flex-wrap">
          {(status === "working" || status === "waiting") && currentProjectId && (
            <Button size="sm" variant="destructive" className="h-6 text-xs px-2" onClick={() => void stopAgent(agent.id, currentProjectId)}>
              Detener
            </Button>
          )}
          <Button size="sm" variant="secondary" className="h-6 text-xs px-2" onClick={() => setInstructOpen(true)}>
            Indicar
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" disabled={!lastRunId} onClick={() => setRunDetailOpen(true)}>
            Ver salida
          </Button>
        </div>
      </Card>
      <Handle type="source" position={Position.Bottom} />

      <InstructDialog 
        agentId={agent.id} 
        open={instructOpen} 
        onOpenChange={setInstructOpen} 
        isWorking={status === "working"}
      />
      <RunDetailDialog
        runId={lastRunId}
        open={runDetailOpen}
        onOpenChange={setRunDetailOpen}
      />
    </>
  );
}
