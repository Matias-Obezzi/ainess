import { useAppStore, selectRunningCount } from "@/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { useState } from "react";
import { ProjectDialog } from "./ProjectDialog";
import { Folder } from "lucide-react";

export function Header() {
  const config = useAppStore(state => state.config);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const setCurrentProject = useAppStore(state => state.setCurrentProject);
  const stopAll = useAppStore(state => state.stopAll);
  
  const approvals = useAppStore(state => state.approvals);
  const pendingApprovals = Object.values(approvals).filter(a => a.status === "pending").length;
  const currentRunningCount = selectRunningCount(useAppStore.getState(), currentProjectId || undefined);
  const totalRunningCount = selectRunningCount(useAppStore.getState());
  const otherRunningCount = totalRunningCount - currentRunningCount;

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
      <div className="flex flex-col">
        <h1 className="text-xl font-bold tracking-tight">AIS</h1>
        <span className="text-xs text-muted-foreground">Orquestador de agentes</span>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Select value={currentProjectId || "none"} onValueChange={(val) => {
            if (val === "new") {
              setProjectDialogOpen(true);
            } else {
              setCurrentProject(val === "none" ? null : val);
            }
          }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Seleccionar proyecto" />
            </SelectTrigger>
            <SelectContent>
              {config.projects.length === 0 && <SelectItem value="none" disabled>Sin proyectos</SelectItem>}
              {config.projects.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || "#4f8cff" }} />
                    {p.name}
                  </div>
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value="new">
                <div className="flex items-center gap-2 text-primary">
                  <Folder className="w-4 h-4" />
                  Nuevo proyecto...
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          
          {otherRunningCount > 0 && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-800 hover:bg-orange-100">
              {otherRunningCount} en otros proyectos
            </Badge>
          )}
        </div>
        
        {pendingApprovals > 0 && (
          <Badge className="bg-amber-500 text-black hover:bg-amber-500" title="Delegaciones esperando tu aprobación">
            {pendingApprovals} {pendingApprovals === 1 ? "aprobación pendiente" : "aprobaciones pendientes"}
          </Badge>
        )}
        <div className="text-sm">
          {currentRunningCount} trabajando
        </div>
        
        <Button 
          variant="destructive" 
          disabled={currentRunningCount === 0} 
          onClick={(e) => {
            if (e.shiftKey) stopAll();
            else stopAll(currentProjectId || undefined);
          }}
          title="Click: Detener actual. Shift+Click: Detener todos los proyectos."
        >
          Detener
        </Button>
      </div>

      <ProjectDialog isOpen={projectDialogOpen} onOpenChange={setProjectDialogOpen} />
    </header>
  );
}
