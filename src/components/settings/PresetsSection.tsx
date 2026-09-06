import { useAppStore, selectAllAgents } from "@/store";
import { confirmDelete } from "@/lib/confirm";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PresetDialog } from "@/components/PresetDialog";
import { ListChecks } from "lucide-react";
import { createDialogContext } from "@/components/settings/section-context";
import { useT } from "@/i18n/useT";

interface Preset {
  id: string;
  name: string;
  prompt: string;
  agentId?: string;
  model?: string;
}

const PresetDialogCtx = createDialogContext<Preset>();
export const PresetsSectionProvider = PresetDialogCtx.Provider;

export function PresetsSectionActions() {
  const t = useT();
  const { openCreate } = PresetDialogCtx.useDialogState();
  return <Button size="sm" onClick={openCreate}>{t("presets.new")}</Button>;
}

export function PresetsSection() {
  const t = useT();
  const config = useAppStore(state => state.config);
  const agents = useAppStore(selectAllAgents);
  const updateConfig = useAppStore(state => state.updateConfig);
  const { open, editing, openEdit, openCreate, close } = PresetDialogCtx.useDialogState();

  if ((config.presets?.length ?? 0) === 0) {
    return (
      <>
        <EmptyState
          icon={ListChecks}
          title={t("presets.empty.title")}
          description={t("presets.empty.body")}
          action={{ label: t("presets.empty.action"), onClick: openCreate }}
        />
        <PresetDialog open={open} onOpenChange={(o) => !o && close()} preset={editing} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {config.presets.map(preset => {
          const targetAgent = agents.find(a => a.id === preset.agentId);
          return (
            <Card key={preset.id}>
              <CardHeader>
                <CardTitle>{preset.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{preset.prompt}</p>
                <div className="mt-2 flex gap-2">
                  {targetAgent && <Badge variant="outline">{t("presets.agent", { name: targetAgent.name })}</Badge>}
                  {preset.model && <Badge variant="outline">{t("presets.model", { model: preset.model })}</Badge>}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(preset)}>{t("common.edit")}</Button>
                <Button variant="destructive" size="sm" onClick={() => void confirmDelete(t("presets.delete"), preset.name).then(ok => {
                  if (!ok) return;
                  updateConfig({ presets: config.presets.filter(p => p.id !== preset.id) });
                })}>{t("common.delete")}</Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
      <PresetDialog open={open} onOpenChange={(o) => !o && close()} preset={editing} />
    </div>
  );
}
