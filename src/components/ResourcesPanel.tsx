import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { SkillDialog } from "./SkillDialog";
import { McpDialog } from "./McpDialog";
import { Skill, McpServer } from "@/types";
import { syncMcpToAntigravity } from "@/lib/mcp-sync";

export function ResourcesPanel() {
  const store = useAppStore();
  const [sharedContext, setSharedContext] = useState(store.config.sharedContext);
  
  useEffect(() => {
    setSharedContext(store.config.sharedContext);
  }, [store.config.sharedContext]);

  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isSkillOpen, setIsSkillOpen] = useState(false);

  const [editingMcp, setEditingMcp] = useState<McpServer | null>(null);
  const [isMcpOpen, setIsMcpOpen] = useState(false);

  const handleSyncMcp = async () => {
    const res = await syncMcpToAntigravity(store.config.mcpServers);
    if (res.success) {
      toast.success(`Sincronización exitosa: ${res.added} agregados, ${res.removed} removidos`);
    } else {
      toast.error(res.error || "Error sincronizando MCP");
    }
  };

  return (
    <div className="h-full flex flex-col p-2 space-y-4">
      <Tabs defaultValue="skills" className="flex-1 flex flex-col">
        <TabsList>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="mcp">MCP Servers</TabsTrigger>
          <TabsTrigger value="context">Contexto Compartido</TabsTrigger>
        </TabsList>

        <TabsContent value="skills" className="flex-1 mt-4 overflow-y-auto space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditingSkill(null); setIsSkillOpen(true); }}>Nuevo Skill</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {store.config.skills.map(skill => (
              <Card key={skill.id}>
                <CardHeader>
                  <CardTitle>{skill.name}</CardTitle>
                  {skill.description && <CardDescription>{skill.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {skill.enabledFor === "all" ? (
                      <Badge variant="secondary">Todos</Badge>
                    ) : (
                      skill.enabledFor.map(id => {
                        const agent = store.config.agents.find(a => a.id === id);
                        return <Badge key={id} variant="outline">{agent?.name || id}</Badge>;
                      })
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditingSkill(skill); setIsSkillOpen(true); }}>Editar</Button>
                  <Button variant="destructive" size="sm" onClick={() => store.removeSkill(skill.id)}>Eliminar</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="mcp" className="flex-1 mt-4 overflow-y-auto space-y-4">
          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={handleSyncMcp}>Sincronizar con Antigravity</Button>
            <Button onClick={() => { setEditingMcp(null); setIsMcpOpen(true); }}>Nuevo Servidor</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {store.config.mcpServers.map(server => (
              <Card key={server.id}>
                <CardHeader>
                  <CardTitle>{server.name}</CardTitle>
                  <CardDescription>{server.transport === "http" ? server.url : `${server.command} ${server.args?.join(" ")}`}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {server.enabledFor === "all" ? (
                      <Badge variant="secondary">Todos</Badge>
                    ) : (
                      server.enabledFor.map(id => {
                        const agent = store.config.agents.find(a => a.id === id);
                        return <Badge key={id} variant="outline">{agent?.name || id}</Badge>;
                      })
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditingMcp(server); setIsMcpOpen(true); }}>Editar</Button>
                  <Button variant="destructive" size="sm" onClick={() => store.removeMcpServer(server.id)}>Eliminar</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="context" className="flex-1 mt-4 flex flex-col">
          <p className="text-sm text-muted-foreground mb-2">Se agrega al system prompt de todos los agentes.</p>
          <Textarea 
            className="flex-1 resize-none font-mono" 
            value={sharedContext}
            onChange={(e) => setSharedContext(e.target.value)}
          />
          <div className="flex justify-end mt-4">
            <Button onClick={() => {
              store.setSharedContext(sharedContext);
              toast.success("Contexto guardado");
            }}>Guardar</Button>
          </div>
        </TabsContent>
      </Tabs>

      <SkillDialog 
        open={isSkillOpen} 
        onOpenChange={setIsSkillOpen} 
        skill={editingSkill} 
      />
      
      <McpDialog 
        open={isMcpOpen} 
        onOpenChange={setIsMcpOpen} 
        server={editingMcp} 
      />
    </div>
  );
}
