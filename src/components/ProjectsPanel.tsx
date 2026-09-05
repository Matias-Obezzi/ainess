import { useAppStore, selectRunningCount } from "@/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Folder, PlayCircle } from "lucide-react";
import { useState } from "react";
import { ProjectDialog } from "./ProjectDialog";
import { toast } from "@/components/ui/toast";

export function ProjectsPanel() {
  const projects = useAppStore(state => state.config.projects);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const setCurrentProject = useAppStore(state => state.setCurrentProject);
  const removeProject = useAppStore(state => state.removeProject);
  
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);

  const handleEdit = (p: any) => {
    setEditingProject(p);
    setProjectDialogOpen(true);
  };

  const handleRemove = (id: string) => {
    if (confirm("¿Estás seguro de eliminar este proyecto? Se perderán sus mensajes y runs en memoria.")) {
      removeProject(id);
      toast.success("Proyecto eliminado");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto pr-2 gap-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Proyectos</h2>
        <Button onClick={() => { setEditingProject(null); setProjectDialogOpen(true); }}>
          Nuevo proyecto
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(p => {
          const running = selectRunningCount(useAppStore.getState(), p.id);
          const isCurrent = p.id === currentProjectId;
          
          return (
            <Card key={p.id} className={`p-4 flex flex-col gap-3 ${isCurrent ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color || "#4f8cff" }} />
                <h3 className="font-bold truncate">{p.name}</h3>
                {isCurrent && <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Actual</span>}
              </div>
              
              <div className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
                <Folder className="w-4 h-4 shrink-0" />
                <span className="truncate">{p.workspaceDir}</span>
              </div>
              
              <div className="text-sm flex items-center gap-1.5">
                <PlayCircle className="w-4 h-4 text-orange-500" />
                {running} tareas activas
              </div>

              <div className="flex gap-2 mt-auto pt-2">
                <Button size="sm" variant={isCurrent ? "secondary" : "default"} onClick={() => setCurrentProject(p.id)} className="flex-1">
                  {isCurrent ? "Seleccionado" : "Abrir"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEdit(p)}>Editar</Button>
                <Button size="sm" variant="destructive" onClick={() => handleRemove(p.id)}>Eliminar</Button>
              </div>
            </Card>
          );
        })}
        {projects.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No hay proyectos configurados.
          </div>
        )}
      </div>

      <ProjectDialog 
        isOpen={projectDialogOpen} 
        onOpenChange={setProjectDialogOpen} 
        editProject={editingProject} 
      />
    </div>
  );
}
