import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skill } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill?: Skill | null;
}

export function SkillDialog({ open, onOpenChange, skill }: Props) {
  const config = useAppStore(state => state.config);
  const upsertSkill = useAppStore(state => state.upsertSkill);

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [allAgents, setAllAgents] = useState(true);
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      if (skill) {
        setId(skill.id);
        setName(skill.name);
        setDescription(skill.description || "");
        setContent(skill.content);
        setAllAgents(skill.enabledFor === "all");
        setEnabledAgents(skill.enabledFor === "all" ? new Set() : new Set(skill.enabledFor));
      } else {
        setId(crypto.randomUUID());
        setName("");
        setDescription("");
        setContent("");
        setAllAgents(true);
        setEnabledAgents(new Set());
      }
    }
  }, [open, skill]);

  const handleSave = () => {
    upsertSkill({
      id,
      name,
      description: description || undefined,
      content,
      enabledFor: allAgents ? "all" : Array.from(enabledAgents)
    });
    onOpenChange(false);
  };

  const toggleAgent = (agentId: string) => {
    const next = new Set(enabledAgents);
    if (next.has(agentId)) {
      next.delete(agentId);
    } else {
      next.add(agentId);
    }
    setEnabledAgents(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col max-w-2xl">
        <DialogHeader>
          <DialogTitle>{skill ? "Editar Skill" : "Nuevo Skill"}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 px-4 -mx-4">
          <div className="flex flex-col gap-4 py-4 px-1">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Descripción</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} />
            </div>

            <div className="space-y-1 flex-1 flex flex-col min-h-[200px]">
              <Label>Contenido</Label>
              <Textarea 
                className="flex-1 font-mono resize-none min-h-[200px]" 
                value={content} 
                onChange={e => setContent(e.target.value)} 
              />
            </div>

            <div className="space-y-2 border p-4 rounded-md">
              <div className="flex items-center gap-2">
                <Switch checked={allAgents} onCheckedChange={setAllAgents} id="all-agents" />
                <Label htmlFor="all-agents">Habilitado para todos los agentes</Label>
              </div>

              {!allAgents && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {config.agents.map(a => (
                    <Button 
                      key={a.id} 
                      variant={enabledAgents.has(a.id) ? "default" : "outline"} 
                      size="sm"
                      onClick={() => toggleAgent(a.id)}
                    >
                      {a.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
