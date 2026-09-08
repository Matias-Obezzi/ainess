import { useState, useEffect } from "react";
import { useAppStore, selectAllAgents, selectAgentsByProject } from "@/store";
import { AgentOptions } from "@/components/AgentOptions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDERS } from "@/lib/providers";
import { useT } from "@/i18n/useT";

interface Preset {
  id: string;
  name: string;
  prompt: string;
  agentId?: string;
  model?: string;
}

export function PresetDialog({ open, onOpenChange, preset }: { open: boolean, onOpenChange: (open: boolean) => void, preset: Preset | null }) {
  const t = useT();
  const store = useAppStore();
  const agents = useAppStore(selectAllAgents);
  const byProject = useAppStore(selectAgentsByProject);
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

  const selectedAgent = agents.find(a => a.id === agentId);
  const providerSpec = selectedAgent ? PROVIDERS[selectedAgent.provider] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{preset ? t("presetDialog.edit") : t("presetDialog.new")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label>{t("presetDialog.name")}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("presetDialog.namePlaceholder")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Prompt</Label>
            <Textarea className="h-32" value={prompt} onChange={e => setPrompt(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t("presetDialog.targetAgent")}</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={t("presetDialog.anyAgent")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("presetDialog.anyAgent")}</SelectItem>
                  <AgentOptions groups={byProject} />
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("presetDialog.model")}</Label>
              <Select value={model} onValueChange={setModel} disabled={agentId === "none"}>
                <SelectTrigger className="w-full"><SelectValue placeholder={agentId === "none" ? t("presetDialog.pickAgentFirst") : t("presetDialog.agentDefault")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("presetDialog.agentDefault")}</SelectItem>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={!name || !prompt}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
