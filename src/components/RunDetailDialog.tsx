import { useState } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export function RunDetailDialog({ runId, open, onOpenChange }: { runId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const runs = useAppStore(state => state.runs);
  const agents = useAppStore(state => state.config.agents);

  const run = runId ? runs[runId] : null;
  const agent = run ? agents.find(a => a.id === run.agentId) : null;

  const [promptOpen, setPromptOpen] = useState(false);

  if (!run) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>Run no encontrado</DialogTitle></DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const duration = run.endedAt ? ((run.endedAt - run.startedAt) / 1000).toFixed(1) + "s" : "-";
  const startStr = new Date(run.startedAt).toLocaleTimeString();
  const endStr = run.endedAt ? new Date(run.endedAt).toLocaleTimeString() : "-";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Detalle del Run</DialogTitle>
          <DialogDescription className="flex gap-2 items-center flex-wrap">
            <Badge>{agent?.name || run.agentId}</Badge>
            <Badge variant="outline">{run.status}</Badge>
            <span className="text-xs">Ronda {run.round}</span>
            <span className="text-xs text-muted-foreground">
              {startStr} - {endStr} ({duration})
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          <div>
            <div 
              className="font-semibold text-sm mb-1 cursor-pointer flex justify-between items-center bg-muted p-2 rounded"
              onClick={() => setPromptOpen(!promptOpen)}
            >
              <span>Prompt</span>
              <span>{promptOpen ? "Ocultar" : "Mostrar"}</span>
            </div>
            {promptOpen && (
              <div className="whitespace-pre-wrap text-sm border p-2 rounded bg-background">
                {run.prompt}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-1">Salida final</h4>
            <div className="whitespace-pre-wrap text-sm border p-2 rounded bg-background">
              {run.output || "Sin salida"}
            </div>
          </div>

          <div className="flex-1 min-h-[200px] flex flex-col">
            <h4 className="font-semibold text-sm mb-1">Salida cruda (stdout/stderr)</h4>
            <div className="flex-1 border p-2 rounded bg-muted overflow-auto font-mono text-xs whitespace-pre-wrap">
              {run.rawLines?.join("\n") || "Sin logs"}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
