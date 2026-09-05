import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDERS } from "@/lib/providers";

interface Preset {
  id: string;
  name: string;
  prompt: string;
  agentId?: string;
  model?: string;
}

export function PresetDialog({ open, onOpenChange, preset }: { open: boolean, onOpenChange: (open: boolean) => void, preset: Preset | null }) {
  const store = useAppStore();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState<string>("none");
  const [model, setModel] = useState<string>("none");

  useEffect(() => {
    if (preset) {
      setName(preset.name);
      setPrompt(preset.prompt);
      setAgentId(preset.agentId || "none");
      setModel(preset.model || "none");
    } else {
      setName("");
      setPrompt("");
      setAgentId("none");
      setModel("none");
    }
  }, [preset, open]);

  const handleSave = () => {
    const newPreset: Preset = {
      id: preset?.id || crypto.randomUUID(),
      name,
      prompt,
      agentId: agentId === "none" ? undefined : agentId,
      model: model === "none" ? undefined : model
    };
    
    let presets = [...store.config.presets];
    const idx = presets.findIndex(p => p.id === newPreset.id);
    if (idx >= 0) presets[idx] = newPreset;
    else presets.push(newPreset);
    
    store.updateConfig({ presets });
    onOpenChange(false);
  };

  const selectedAgent = store.config.agents.find(a => a.id === agentId);
  const providerSpec = selectedAgent ? PROVIDERS[selectedAgent.provider] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{preset ? "Editar orden" : "Nueva orden predefinida"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label>Nombre (identificador corto)</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: refactor, test" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Prompt</Label>
            <Textarea className="h-32" value={prompt} onChange={e => setPrompt(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Agente destino (opcional)</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Cualquiera" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Cualquiera</SelectItem>
                  {store.config.agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Modelo (opcional)</Label>
              <Select value={model} onValueChange={setModel} disabled={agentId === "none"}>
                <SelectTrigger className="w-full"><SelectValue placeholder={agentId === "none" ? "Elegí agente primero" : "Predeterminado del agente"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Predeterminado del agente</SelectItem>
                  {providerSpec?.defaultModels.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                  {selectedAgent?.model && !providerSpec?.defaultModels.includes(selectedAgent.model) && (
                    <SelectItem value={selectedAgent.model}>{selectedAgent.model}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name || !prompt}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
