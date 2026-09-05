import { useEffect } from "react";
import { useAppStore } from "@/store";
import { Header } from "@/components/Header";
import { useActivityIsland } from "@/hooks/useActivityIsland";
import { useNotifications } from "@/hooks/useNotifications";
import { Island } from "@/components/ui/island";
import { Toaster } from "@/components/ui/toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PromptPanel } from "@/components/PromptPanel";
import { CommunicationPanel } from "@/components/CommunicationPanel";
import { HierarchyGraph } from "@/components/HierarchyGraph";
import { AgentsPanel } from "@/components/AgentsPanel";

export default function App() {
  const init = useAppStore(state => state.init);
  const loaded = useAppStore(state => state.loaded);

  useEffect(() => {
    void init();
  }, [init]);

  useActivityIsland();
  useNotifications();

  if (!loaded) return null;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <Header />
      <Island position="top" idle={false} />
      <Toaster position="bottom-right" richColors />
      
      <main className="flex-1 overflow-hidden p-4">
        <Tabs defaultValue="prompt" className="h-full flex flex-col">
          <TabsList>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="comunicacion">Comunicación</TabsTrigger>
            <TabsTrigger value="jerarquia">Jerarquía</TabsTrigger>
            <TabsTrigger value="agentes">Agentes</TabsTrigger>
          </TabsList>
          
          <TabsContent value="prompt" className="flex-1 mt-2 overflow-hidden">
            <PromptPanel />
          </TabsContent>
          <TabsContent value="comunicacion" className="flex-1 mt-2 overflow-hidden">
            <CommunicationPanel />
          </TabsContent>
          <TabsContent value="jerarquia" className="flex-1 mt-2 overflow-hidden">
            <HierarchyGraph />
          </TabsContent>
          <TabsContent value="agentes" className="flex-1 mt-2 overflow-hidden overflow-y-auto">
            <AgentsPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
