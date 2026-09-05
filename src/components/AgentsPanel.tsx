import { useState } from "react";
import { useAppStore } from "@/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PROVIDERS } from "@/lib/providers";
import { roleLabel } from "@/lib/labels";
import { AgentDialog } from "./AgentDialog";
import { island } from "@/components/ui/island";
import { AgentConfig, ProviderId } from "@/types";
import { open } from "@tauri-apps/plugin-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function OverrideDialog({ provider, open: isOpen, onOpenChange }: { provider: ProviderId | null, open: boolean, onOpenChange: (open: boolean) => void }) {
  const config = useAppStore(state => state.config);
  const updateConfig = useAppStore(state => state.updateConfig);
  const detectBinaries = useAppStore(state => state.detectBinaries);
  const [path, setPath] = useState("");

  const handleOpen = async () => {
    const selected = await open({ multiple: false, filters: [{ name: "Ejecutable", extensions: ["exe", "cmd", "bat"] }] });
    if (selected && typeof selected === "string") {
      setPath(selected);
    }
  };

  const handleSave = async () => {
    if (provider) {
      const overrides = { ...config.binaryOverrides, [provider]: path };
      updateConfig({ binaryOverrides: overrides });
      await detectBinaries();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cargar CLI a mano ({provider ? PROVIDERS[provider].label : ""})</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <Label>Ruta al ejecutable</Label>
          <div className="flex gap-2">
            <Input value={path} onChange={e => setPath(e.target.value)} placeholder="C:\ruta\al\ejecutable.exe" />
            <Button variant="outline" onClick={handleOpen}>Buscar...</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgentsPanel() {
  const config = useAppStore(state => state.config);
  const loaded = useAppStore(state => state.loaded);
  const binaries = useAppStore(state => state.binaries);
  const detectBinaries = useAppStore(state => state.detectBinaries);
  const removeAgent = useAppStore(state => state.removeAgent);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const resetSession = useAppStore(state => state.resetSession);
  const upsertAgent = useAppStore(state => state.upsertAgent);
  const updateConfig = useAppStore(state => state.updateConfig);
  
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null | undefined>(undefined);
  const [overrideProvider, setOverrideProvider] = useState<ProviderId | null>(null);

  const handleDelete = async (agent: AgentConfig) => {
    const confirmed = await island.confirm({
      title: "¿Eliminar agente?",
      description: `Se eliminará ${agent.name}.`,
      destructive: true
    });
    if (confirmed) {
      removeAgent(agent.id);
    }
  };

  const handleCreateFromProvider = (providerId: ProviderId) => {
    const rootPlanner = config.agents.find(a => a.parentId === null && a.role === "planner");
    upsertAgent({
      id: crypto.randomUUID(),
      name: PROVIDERS[providerId].label,
      provider: providerId,
      role: "implementer",
      parentId: rootPlanner ? rootPlanner.id : null,
      autoApprove: true,
      color: "#6b7280"
    });
  };

  const providerKeys = Object.keys(PROVIDERS) as ProviderId[];
  const detectables = providerKeys.filter(p => p !== "custom");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold">IAs detectadas</h2>
          <Button variant="outline" size="sm" onClick={() => void detectBinaries()}>Volver a detectar</Button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {detectables.map(provider => {
            const bin = binaries[provider];
            const hasAgent = config.agents.some(a => a.provider === provider);
            const override = config.binaryOverrides?.[provider];
            
            return (
              <div key={provider} className="flex items-center justify-between p-3 border rounded-md">
                <div className="flex flex-col">
                  <span className="font-semibold">{PROVIDERS[provider].label}</span>
                  <span className="text-sm text-muted-foreground">
                    {!loaded ? "Cargando..." : (
                      bin?.path 
                        ? (bin.version === null ? <span className="text-destructive">Ruta no válida: {bin.path}</span> : `${bin.path} ${bin.version ? `(${bin.version})` : ""}`)
                        : <span className="text-destructive">No detectado</span>
                    )}
                  </span>
                </div>
                <div className="flex gap-2">
                  {!hasAgent && bin?.path && bin?.version !== null && (
                    <Button size="sm" onClick={() => handleCreateFromProvider(provider)}>Crear agente</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setOverrideProvider(provider)}>Cargar a mano</Button>
                  {override && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const newOverrides = { ...config.binaryOverrides };
                      delete newOverrides[provider];
                      updateConfig({ binaryOverrides: newOverrides });
                      await detectBinaries();
                    }}>Limpiar override</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold">Agentes</h2>
          <Button size="sm" onClick={() => setEditingAgent(null)}>Nuevo agente custom</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {config.agents.map(a => {
            const parent = config.agents.find(p => p.id === a.parentId);
            const bin = binaries[a.provider];

            return (
              <Card key={a.id} className="p-4 flex flex-col gap-2" style={{ borderTop: `4px solid ${a.color || "#888"}` }}>
                <div className="flex justify-between items-start">
                  <div className="font-bold">{a.name}</div>
                  <div className="flex gap-1">
                    <Badge variant="outline">{roleLabel[a.role] || a.role}</Badge>
                    <Badge>{PROVIDERS[a.provider]?.label || a.provider}</Badge>
                  </div>
                </div>
                
                <div className="text-sm text-muted-foreground flex flex-col gap-1">
                  <div><span className="font-semibold">Padre:</span> {parent ? parent.name : "Ninguno (raíz)"}</div>
                  {a.model && <div><span className="font-semibold">Modelo:</span> {a.model}</div>}
                  <div><span className="font-semibold">Auto-aprobar:</span> {a.autoApprove ? "Sí" : "No"}</div>
                  
                  <div>
                    <span className="font-semibold">CLI: </span>
                    {a.provider === "custom" ? (
                      a.customCommand?.program || "No configurado"
                    ) : !loaded ? (
                      "Cargando..."
                    ) : (!bin ? (
                      <span className="text-destructive font-medium">No detectado</span>
                    ) : (
                      <span>{bin.path}{bin.version ? ` (${bin.version})` : ""}</span>
                    ))}
                  </div>
                </div>
                
                <div className="flex gap-2 mt-auto pt-2">
                  <Button size="sm" variant="outline" onClick={() => setEditingAgent(a)}>Editar</Button>
                  <Button size="sm" variant="outline" onClick={() => currentProjectId && resetSession(a.id, currentProjectId)}>Reiniciar sesión</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(a)}>Eliminar</Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <AgentDialog 
        open={editingAgent !== undefined} 
        onOpenChange={(open) => !open && setEditingAgent(undefined)} 
        agent={editingAgent === null ? undefined : editingAgent} 
      />
      <OverrideDialog 
        provider={overrideProvider} 
        open={overrideProvider !== null} 
        onOpenChange={(open) => !open && setOverrideProvider(null)} 
      />
    </div>
  );
}
