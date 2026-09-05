import { useState } from "react";
import { useAppStore } from "@/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PROVIDERS } from "@/lib/providers";
import { roleLabel } from "@/lib/labels";
import { AgentDialog } from "./AgentDialog";
import { island } from "@/components/ui/island";
import { AgentConfig } from "@/types";

export function AgentsPanel() {
  const config = useAppStore(state => state.config);
  const loaded = useAppStore(state => state.loaded);
  const binaries = useAppStore(state => state.binaries);
  const detectBinaries = useAppStore(state => state.detectBinaries);
  const removeAgent = useAppStore(state => state.removeAgent);
  const resetSession = useAppStore(state => state.resetSession);
  
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null | undefined>(undefined);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button onClick={() => setEditingAgent(null)}>Nuevo agente</Button>
        <Button variant="outline" onClick={() => void detectBinaries()}>Volver a detectar CLIs</Button>
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
                <Button size="sm" variant="outline" onClick={() => resetSession(a.id)}>Reiniciar sesión</Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(a)}>Eliminar</Button>
              </div>
            </Card>
          );
        })}
      </div>

      <AgentDialog 
        open={editingAgent !== undefined} 
        onOpenChange={(open) => !open && setEditingAgent(undefined)} 
        agent={editingAgent === null ? undefined : editingAgent} 
      />
    </div>
  );
}
