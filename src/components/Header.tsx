import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "@/components/ui/toast";
import { isTauri } from "@/lib/tauri";

export function Header() {
  const config = useAppStore(state => state.config);
  const setWorkspaceDir = useAppStore(state => state.setWorkspaceDir);
  const stopAll = useAppStore(state => state.stopAll);
  const runs = useAppStore(state => state.runs);

  const runningCount = Object.values(runs).filter(r => r.status === "running").length;

  const handleOpenWorkspace = async () => {
    if (!isTauri()) {
      toast.error("No disponible en el navegador");
      return;
    }
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        setWorkspaceDir(selected);
      }
    } catch (e) {
      toast.error("Error al abrir diálogo");
    }
  };

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
      <div className="flex flex-col">
        <h1 className="text-xl font-bold tracking-tight">AIS</h1>
        <span className="text-xs text-muted-foreground">Orquestador de agentes</span>
      </div>
      
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={handleOpenWorkspace}>
          {config.workspaceDir ?? "Elegir workspace…"}
        </Button>
        
        <div className="text-sm">
          {runningCount} trabajando
        </div>
        
        <Button 
          variant="destructive" 
          disabled={runningCount === 0} 
          onClick={() => void stopAll()}
        >
          Detener todo
        </Button>
      </div>
    </header>
  );
}
