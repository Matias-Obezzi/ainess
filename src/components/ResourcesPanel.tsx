import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { SkillDialog } from "./SkillDialog";
import { McpDialog } from "./McpDialog";
import { PresetDialog } from "./PresetDialog";
import { HookDialog } from "./HookDialog";
import { Skill, McpServer, Hook } from "@/types";
import { syncMcpToAntigravity } from "@/lib/mcp-sync";
import type { SettingsSection } from "@/store";

/** Renders the content of a single "Resources" section (used inside the settings dialog sidebar). */
export function ResourceSection({ section }: { section: SettingsSection }) {
  const store = useAppStore();
  const [sharedContext, setSharedContext] = useState(store.config.sharedContext);

  useEffect(() => {
    setSharedContext(store.config.sharedContext);
  }, [store.config.sharedContext]);

  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isSkillOpen, setIsSkillOpen] = useState(false);

  const [editingMcp, setEditingMcp] = useState<McpServer | null>(null);
  const [isMcpOpen, setIsMcpOpen] = useState(false);

  const [editingPreset, setEditingPreset] = useState<any | null>(null);
  const [isPresetOpen, setIsPresetOpen] = useState(false);

  const [editingHook, setEditingHook] = useState<Hook | null>(null);
  const [isHookOpen, setIsHookOpen] = useState(false);

  const handleSyncMcp = async () => {
    const res = await syncMcpToAntigravity(store.config.mcpServers);
    if (res.success) {
      toast.success(`Sincronización exitosa: ${res.added} agregados, ${res.removed} removidos`);
    } else {
      toast.error(res.error || "Error sincronizando MCP");
    }
  };

  if (section === "profile") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Esta información se inyecta en el prompt del sistema para que los agentes te conozcan mejor.</p>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold">Tu Nombre</label>
          <Input
            value={store.config.profile?.name || ""}
            onChange={e => store.updateConfig({ profile: { ...store.config.profile, name: e.target.value } })}
            placeholder="Ej: Matias"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold">Sobre vos (rol, seniority, contexto)</label>
          <Textarea
            className="resize-none"
            value={store.config.profile?.about || ""}
            onChange={e => store.updateConfig({ profile: { ...store.config.profile, about: e.target.value } })}
            placeholder="Ej: Desarrollador full stack especializado en React y Node."
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold">Preferencias de trabajo</label>
          <Textarea
            className="resize-none h-32"
            value={store.config.profile?.preferences || ""}
            onChange={e => store.updateConfig({ profile: { ...store.config.profile, preferences: e.target.value } })}
            placeholder="Ej: Respuestas cortas, en español rioplatense, siempre con validación de tipos."
          />
        </div>
      </div>
    );
  }

  if (section === "presets") {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => { setEditingPreset(null); setIsPresetOpen(true); }}>Nueva orden</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {store.config.presets?.map(preset => {
            const targetAgent = store.config.agents.find(a => a.id === preset.agentId);
            return (
              <Card key={preset.id}>
                <CardHeader>
                  <CardTitle>{preset.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{preset.prompt}</p>
                  <div className="flex gap-2 mt-2">
                    {targetAgent && <Badge variant="outline">Agente: {targetAgent.name}</Badge>}
                    {preset.model && <Badge variant="outline">Modelo: {preset.model}</Badge>}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditingPreset(preset); setIsPresetOpen(true); }}>Editar</Button>
                  <Button variant="destructive" size="sm" onClick={() => {
                    const newPresets = store.config.presets.filter(p => p.id !== preset.id);
                    store.updateConfig({ presets: newPresets });
                  }}>Eliminar</Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
        <PresetDialog
          open={isPresetOpen}
          onOpenChange={setIsPresetOpen}
          preset={editingPreset}
        />
      </div>
    );
  }

  if (section === "skills") {
    return (
      <div className="space-y-4">
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
        <SkillDialog
          open={isSkillOpen}
          onOpenChange={setIsSkillOpen}
          skill={editingSkill}
        />
      </div>
    );
  }

  if (section === "mcp") {
    return (
      <div className="space-y-4">
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
        <McpDialog
          open={isMcpOpen}
          onOpenChange={setIsMcpOpen}
          server={editingMcp}
        />
      </div>
    );
  }

  if (section === "context") {
    return (
      <div className="flex flex-col h-full">
        <p className="text-sm text-muted-foreground mb-2">Se agrega al system prompt de todos los agentes.</p>
        <Textarea
          className="flex-1 resize-none font-mono min-h-64"
          value={sharedContext}
          onChange={(e) => setSharedContext(e.target.value)}
        />
        <div className="flex justify-end mt-4">
          <Button onClick={() => {
            store.setSharedContext(sharedContext);
            toast.success("Contexto guardado");
          }}>Guardar</Button>
        </div>
      </div>
    );
  }

  if (section === "hooks") {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => { setEditingHook(null); setIsHookOpen(true); }}>Nuevo Hook</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {store.config.hooks?.map(hook => (
            <Card key={hook.id}>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>{hook.name}</span>
                  <Switch checked={hook.enabled} onCheckedChange={(v) => store.toggleHook(hook.id, v)} />
                </CardTitle>
                <CardDescription>Evento: {hook.event}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <strong>Acción:</strong> {hook.action.type}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => store.testHook(hook.id)}>Probar</Button>
                <Button variant="outline" size="sm" onClick={() => { setEditingHook(hook); setIsHookOpen(true); }}>Editar</Button>
                <Button variant="destructive" size="sm" onClick={() => store.removeHook(hook.id)}>Eliminar</Button>
              </CardFooter>
            </Card>
          ))}
        </div>
        {isHookOpen && (
          <HookDialog
            open={isHookOpen}
            onClose={() => setIsHookOpen(false)}
            hook={editingHook!}
            onSave={(h) => { store.upsertHook(h); setIsHookOpen(false); }}
          />
        )}
      </div>
    );
  }

  return null;
}
