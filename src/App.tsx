import { useEffect, useState } from "react";
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
import { ResourcesPanel } from "@/components/ResourcesPanel";
import { ProjectsPanel } from "@/components/ProjectsPanel";
import { ChatPanel } from "@/components/ChatPanel";

export default function App() {
  const init = useAppStore(state => state.init);
  const [tab, setTab] = useState("prompt");

  // Other panels can jump to a tab (e.g. "Chatear" on a graph node) without prop drilling.
  useEffect(() => {
    const onOpenTab = (e: Event) => setTab((e as CustomEvent<string>).detail);
    window.addEventListener("ais:open-tab", onOpenTab);
    return () => window.removeEventListener("ais:open-tab", onOpenTab);
  }, []);
  const loaded = useAppStore(state => state.loaded);
  const currentProjectId = useAppStore(state => state.currentProjectId);

  useEffect(() => {
    void init();
  }, [init]);

  useActivityIsland();
  useNotifications();

  if (!loaded) return null;

  const noProjectState = (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-4">
      <p>No hay un proyecto seleccionado.</p>
      <p className="text-sm">Selecciona o crea un proyecto desde el menú superior para comenzar a trabajar.</p>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <Header />
      <Island position="top" idle={false} />
      <Toaster position="bottom-right" richColors />
      
      <main className="flex-1 overflow-hidden p-4">
        <Tabs value={tab} onValueChange={setTab} className="h-full flex flex-col">
          <TabsList>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="comunicacion">Comunicación</TabsTrigger>
            <TabsTrigger value="jerarquia">Jerarquía</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="proyectos">Proyectos</TabsTrigger>
            <TabsTrigger value="agentes">Agentes</TabsTrigger>
            <TabsTrigger value="recursos">Recursos</TabsTrigger>
          </TabsList>
          
          <TabsContent value="prompt" className="flex-1 mt-2 overflow-hidden">
            {currentProjectId ? <PromptPanel /> : noProjectState}
          </TabsContent>
          <TabsContent value="comunicacion" className="flex-1 mt-2 overflow-hidden">
            {currentProjectId ? <CommunicationPanel /> : noProjectState}
          </TabsContent>
          <TabsContent value="jerarquia" className="flex-1 mt-2 overflow-hidden">
            {currentProjectId ? <HierarchyGraph /> : noProjectState}
          </TabsContent>
          <TabsContent value="chat" className="flex-1 mt-2 overflow-hidden">
            {currentProjectId ? <ChatPanel /> : noProjectState}
          </TabsContent>
          <TabsContent value="proyectos" className="flex-1 mt-2 overflow-hidden">
            <ProjectsPanel />
          </TabsContent>
          <TabsContent value="agentes" className="flex-1 mt-2 overflow-hidden overflow-y-auto">
            <AgentsPanel />
          </TabsContent>
          <TabsContent value="recursos" className="flex-1 mt-2 overflow-hidden overflow-y-auto">
            <ResourcesPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
