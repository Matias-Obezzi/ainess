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

export function AgentNode({ data }: { data: { agent: AgentConfig } }) {
  const { agent } = data;
  const runtime = useAppStore(state => state.runtime[agent.id]);
  const binaries = useAppStore(state => state.binaries);
  const stopAgent = useAppStore(state => state.stopAgent);
  
  const [instructOpen, setInstructOpen] = useState(false);

  const status = runtime?.status || "idle";
  const binaryInfo = binaries[agent.provider];

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

        {runtime?.currentTask && (
          <div className="text-xs text-muted-foreground line-clamp-2 mt-1" title={runtime.currentTask}>
            {runtime.currentTask}
          </div>
        )}

        <div className="flex gap-2 mt-2">
          {(status === "working" || status === "waiting") && (
            <Button size="sm" variant="destructive" className="h-6 text-xs px-2" onClick={() => void stopAgent(agent.id)}>
              Detener
            </Button>
          )}
          <Button size="sm" variant="secondary" className="h-6 text-xs px-2" onClick={() => setInstructOpen(true)}>
            Indicar
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
    </>
  );
}
