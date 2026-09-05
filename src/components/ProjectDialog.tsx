import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@/lib/tauri";
import { useAppStore } from "@/store";
import { Project } from "@/types";
import { toast } from "@/components/ui/toast";

export function ProjectDialog({
  isOpen,
  onOpenChange,
  editProject,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editProject?: Project;
}) {
  const [name, setName] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [color, setColor] = useState("#4f8cff");
  const store = useAppStore();

  useEffect(() => {
    if (isOpen) {
      if (editProject) {
        setName(editProject.name);
        setWorkspaceDir(editProject.workspaceDir);
        setColor(editProject.color || "#4f8cff");
      } else {
        setName("");
        setWorkspaceDir("");
        setColor("#4f8cff");
      }
    }
  }, [isOpen, editProject]);

  const handleSelectDir = async () => {
    if (!isTauri()) {
      toast.error("No disponible en la web");
      return;
    }
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        setWorkspaceDir(selected);
        if (!name) {
          const folder = selected.replace(/\\/g, "/").split("/").pop();
          if (folder) setName(folder);
        }
      }
    } catch {
      toast.error("Error al abrir diálogo");
    }
  };

  const handleSave = () => {
    if (!name || !workspaceDir) return;
    
    if (editProject) {
      store.updateProject(editProject.id, { name, workspaceDir, color });
    } else {
      store.addProject({ name, workspaceDir, color });
      const newP = useAppStore.getState().config.projects.find(p => p.name === name && p.workspaceDir === workspaceDir);
      if (newP) store.setCurrentProject(newP.id);
    }
    
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editProject ? "Editar Proyecto" : "Nuevo Proyecto"}</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Carpeta (Workspace)</Label>
            <div className="flex gap-2">
              <Input value={workspaceDir} readOnly placeholder="Ruta de la carpeta..." />
              <Button type="button" variant="outline" onClick={handleSelectDir}>Examinar...</Button>
            </div>
          </div>
          
          <div className="grid gap-2">
            <Label>Nombre</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Mi proyecto" />
          </div>
          
          <div className="grid gap-2">
            <Label>Color (opcional)</Label>
            <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-16 h-8 p-1" />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name || !workspaceDir}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
