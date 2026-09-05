import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentsPanel } from "@/components/AgentsPanel";
import { ResourcesPanel } from "@/components/ResourcesPanel";
import { ArrowLeft } from "lucide-react";
import type { SettingsSection } from "@/store";

/** Agents and resources, reached from the gear at the bottom of the sidebar. */
export function SettingsScreen() {
  const settingsSection = useAppStore(state => state.settingsSection);
  const openSettings = useAppStore(state => state.openSettings);
  const openHome = useAppStore(state => state.openHome);
  const openProject = useAppStore(state => state.openProject);
  const currentProjectId = useAppStore(state => state.currentProjectId);

  const goBack = () => {
    if (currentProjectId) openProject(currentProjectId);
    else openHome();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-12 shrink-0 border-b border-border flex items-center gap-2 px-4">
        <Button variant="ghost" size="sm" className="h-7" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <h2 className="font-semibold text-sm">Configuración</h2>
      </div>

      <Tabs
        value={settingsSection}
        onValueChange={value => openSettings(value as SettingsSection)}
        className="flex-1 min-h-0 flex flex-col p-4 gap-3"
      >
        <TabsList className="self-start">
          <TabsTrigger value="agents">Agentes</TabsTrigger>
          <TabsTrigger value="resources">Recursos</TabsTrigger>
        </TabsList>
        <TabsContent value="agents" className="flex-1 min-h-0 overflow-y-auto">
          <AgentsPanel />
        </TabsContent>
        <TabsContent value="resources" className="flex-1 min-h-0 overflow-y-auto">
          <ResourcesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
