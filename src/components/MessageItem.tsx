import { CommMessage } from "@/types";
import { useAppStore, selectAllAgents } from "@/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { kindLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";
import { useState } from "react";
import { RunDetailDialog } from "./RunDetailDialog";

export function MessageItem({ message }: { message: CommMessage }) {
  const agents = useAppStore(selectAllAgents);
  
  const fromAgent = message.fromAgentId === "user" ? null : agents.find(a => a.id === message.fromAgentId);
  const toAgent = message.toAgentId === "user" ? null : agents.find(a => a.id === message.toAgentId);
  
  const fromName = message.fromAgentId === "user" ? "Usuario" : (fromAgent?.name || message.fromAgentId);
  const fromColor = fromAgent?.color || "#888";
  
  const toName = message.toAgentId === "user" ? "Usuario" : (toAgent?.name || message.toAgentId);
  const toColor = toAgent?.color || "#888";

  const date = new Date(message.ts);
  const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;

  const isMono = message.kind === "tool" || message.kind === "stderr";
  const isDelegation = message.kind === "delegation";

  const [runDetailOpen, setRunDetailOpen] = useState(false);

  return (
    <>
      <div 
        className={cn("flex flex-col gap-1 p-3 text-sm border-b border-border", isDelegation && "border-l-4")}
        style={isDelegation ? { borderLeftColor: toColor } : undefined}
      >
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: fromColor }} />
          <span className="font-semibold">{fromName}</span>
          {message.toAgentId && (
            <>
              <span className="text-muted-foreground">→</span>
              <span className="font-semibold">{toName}</span>
            </>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{timeStr}</span>
          <Badge variant="outline">{kindLabel[message.kind] || message.kind}</Badge>
          {message.runId && (
            <Button variant="ghost" size="icon" className="h-5 w-5 ml-1 text-muted-foreground" onClick={() => setRunDetailOpen(true)}>
              <FileText className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className={cn("mt-1 whitespace-pre-wrap break-words", isMono && "font-mono text-xs text-muted-foreground")}>
          {message.text}
        </div>
      </div>
      <RunDetailDialog
        runId={message.runId || null}
        open={runDetailOpen}
        onOpenChange={setRunDetailOpen}
      />
    </>
  );
}
