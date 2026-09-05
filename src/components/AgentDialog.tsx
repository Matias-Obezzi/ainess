import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AgentConfig, ProviderId, AgentRole } from "@/types";
import { PROVIDERS } from "@/lib/providers";
import { roleLabel } from "@/lib/labels";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: AgentConfig;
}

export function AgentDialog({ open, onOpenChange, agent }: Props) {
  const config = useAppStore(state => state.config);
  const upsertAgent = useAppStore(state => state.upsertAgent);

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ProviderId>("claude");
  const [role, setRole] = useState<AgentRole>("implementer");
  const [parentId, setParentId] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [customProgram, setCustomProgram] = useState("");
  const [customArgs, setCustomArgs] = useState("");
  const [color, setColor] = useState("#888888");

  useEffect(() => {
    if (open) {
      if (agent) {
        setId(agent.id);
        setName(agent.name);
        setProvider(agent.provider);
        setRole(agent.role);
        setParentId(agent.parentId);
        setModel(agent.model || "");
        setAutoApprove(agent.autoApprove);
        setDescription(agent.description || "");
        setSystemPrompt(agent.systemPrompt || "");
        setCustomProgram(agent.customCommand?.program || "");
        setCustomArgs(agent.customCommand?.args.join(" ") || "");
        setColor(agent.color || "#888888");
      } else {
        setId(crypto.randomUUID());
        setName("");
        setProvider("claude");
        setRole("implementer");
        setParentId(null);
        setModel("");
        setAutoApprove(false);
        setDescription("");
        setSystemPrompt("");
        setCustomProgram("");
        setCustomArgs("");
        setColor("#888888");
      }
    }
  }, [open, agent]);

  // Find valid parents (not self, not descendant)
  const descendants = new Set<string>();
  if (agent) {
    const queue = [agent.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      descendants.add(cur);
      const children = config.agents.filter(a => a.parentId === cur);
      for (const c of children) queue.push(c.id);
    }
  }
  const validParents = config.agents.filter(a => !descendants.has(a.id));

  const handleSave = () => {
    const newAgent: AgentConfig = {
      id,
      name,
      provider,
      role,
      parentId,
      model: model || undefined,
      autoApprove,
      description: description || undefined,
      systemPrompt: systemPrompt || undefined,
      color
    };
    if (provider === "custom") {
      newAgent.customCommand = {
        program: customProgram,
        args: customArgs.split(" ").filter(s => s.trim() !== "")
      };
    }
    upsertAgent(newAgent);
    onOpenChange(false);
  };

  const defaultModels = PROVIDERS[provider]?.defaultModels || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{agent ? "Editar agente" : "Nuevo agente"}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 px-4 -mx-4">
          <div className="flex flex-col gap-4 py-4 px-1">
            <div className="flex gap-4">
              <div className="flex-1 space-y-1">
                <Label>Nombre</Label>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="w-20 space-y-1">
                <Label>Color</Label>
                <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 px-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={v => setProvider(v as ProviderId)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(PROVIDERS) as [ProviderId, typeof PROVIDERS[ProviderId]][]).map(([id, p]) => (
                      <SelectItem key={id} value={id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Rol</Label>
                <Select value={role} onValueChange={v => setRole(v as AgentRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(roleLabel) as [AgentRole, string][]).map(([r, label]) => (
                      <SelectItem key={r} value={r}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Padre</Label>
                <Select value={parentId || "null"} onValueChange={v => setParentId(v === "null" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">Ninguno (raíz)</SelectItem>
                    {validParents.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Modelo</Label>
                <Input 
                  value={model} 
                  onChange={e => setModel(e.target.value)} 
                  list="default-models" 
                  placeholder="Ej: gemini-3.1-pro-high"
                />
                <datalist id="default-models">
                  {defaultModels.map(m => <option key={m} value={m} />)}
                </datalist>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={autoApprove} onCheckedChange={setAutoApprove} id="auto-approve" />
              <Label htmlFor="auto-approve">Auto-aprobar herramientas</Label>
            </div>

            <div className="space-y-1">
              <Label>Descripción (para el planificador padre)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Instrucciones extra (System prompt)</Label>
              <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} />
            </div>

            {provider === "custom" && (
              <div className="grid grid-cols-2 gap-4 p-4 border rounded">
                <div className="space-y-1">
                  <Label>Programa (ej: npx)</Label>
                  <Input value={customProgram} onChange={e => setCustomProgram(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Argumentos (separados por espacio)</Label>
                  <Input value={customArgs} onChange={e => setCustomArgs(e.target.value)} placeholder="agy --prompt {prompt}" />
                </div>
              </div>
            )}
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
