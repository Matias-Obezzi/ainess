import { useEffect, useState } from "react";
import { useAppStore, selectProjectAgents } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { retryModelFor, retryModels } from "@/lib/retry";
import { truncate } from "@/lib/format";
import { useT } from "@/i18n/useT";

const DEFAULT_MODEL = "none";
const OTHER_MODEL = "custom";

/** Reruns a finished run from scratch: same prompt, an agent and model picked here. */
export function RetryRunDialog({ runId, open, onOpenChange }: { runId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const run = useAppStore(state => (runId ? state.runs[runId] : null));
  const project = useAppStore(state => (run ? state.config.projects.find(p => p.id === run.projectId) : undefined));
  const agents = useAppStore(state => selectProjectAgents(state, run?.projectId));
  const submitPrompt = useAppStore(state => state.submitPrompt);

  const [agentId, setAgentId] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [customModel, setCustomModel] = useState("");

  // Re-seeds the choice every time the dialog opens on a (possibly different) run: the original
  // agent and, only when it still runs the same model, that model too.
  useEffect(() => {
    if (!open || !run) return;
    const initialAgent = agents.find(a => a.id === run.agentId);
    setAgentId(initialAgent?.id ?? "");
    setCustomModel("");
    setModel(initialAgent ? (retryModelFor(initialAgent, run.model) ?? DEFAULT_MODEL) : DEFAULT_MODEL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, runId]);

  const agent = agents.find(a => a.id === agentId);
  const modelOptions = agent ? retryModels(agent) : [];

  // A model select tied to another provider's models: switching agents starts it over rather than
  // keeping a value the new provider may not even offer.
  const handleAgentChange = (id: string) => {
    setAgentId(id);
    setModel(DEFAULT_MODEL);
    setCustomModel("");
  };

  const handleConfirm = () => {
    if (!run || !project || !agent) {
      onOpenChange(false);
      return;
    }
    const value = model === DEFAULT_MODEL ? undefined : model === OTHER_MODEL ? customModel : model;
    onOpenChange(false);
    void submitPrompt(run.prompt, agent.id, project.id, { model: value });
  };

  if (!run) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("retry.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold mb-1">{t("retry.prompt")}</p>
            <p className="text-sm text-muted-foreground">{truncate(run.prompt, 200)}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("retry.agent")}</Label>
            <Select value={agentId} onValueChange={handleAgentChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("retry.model")}</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_MODEL}>{t("composer.defaultModel")}</SelectItem>
                {modelOptions.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
                <SelectItem value={OTHER_MODEL}>{t("composer.otherModel")}</SelectItem>
              </SelectContent>
            </Select>
            {model === OTHER_MODEL && (
              <Input
                placeholder={t("composer.typeModel")}
                value={customModel}
                onChange={e => setCustomModel(e.target.value)}
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleConfirm} disabled={!agent || (model === OTHER_MODEL && !customModel.trim())}>
            {t("retry.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
