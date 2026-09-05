import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { McpServer } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server?: McpServer | null;
}

export function McpDialog({ open, onOpenChange, server }: Props) {
  const config = useAppStore(state => state.config);
  const upsertMcpServer = useAppStore(state => state.upsertMcpServer);

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [env, setEnv] = useState("");
  const [allAgents, setAllAgents] = useState(true);
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      if (server) {
        setId(server.id);
        setName(server.name);
        setTransport(server.transport);
        if (server.transport === "http") {
          setUrl(server.url || "");
        } else {
          setCommand([server.command, ...(server.args || [])].filter(Boolean).join(" "));
        }
        if (server.env) {
          setEnv(Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join("\n"));
        } else {
          setEnv("");
        }
        setAllAgents(server.enabledFor === "all");
        setEnabledAgents(server.enabledFor === "all" ? new Set() : new Set(server.enabledFor));
      } else {
        setId(crypto.randomUUID());
        setName("");
        setTransport("stdio");
        setCommand("");
        setUrl("");
        setEnv("");
        setAllAgents(true);
        setEnabledAgents(new Set());
      }
    }
  }, [open, server]);

  const handleSave = () => {
    const envObj: Record<string, string> = {};
    for (const line of env.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        envObj[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
      }
    }

    let cmdStr = undefined;
    let argsStr: string[] | undefined = undefined;
    if (transport === "stdio") {
      const parts = command.split(" ").filter(s => s.trim() !== "");
      cmdStr = parts[0];
      argsStr = parts.slice(1);
    }

    upsertMcpServer({
      id,
      name,
      transport,
      command: cmdStr,
      args: argsStr,
      url: transport === "http" ? url : undefined,
      env: Object.keys(envObj).length > 0 ? envObj : undefined,
      enabledFor: allAgents ? "all" : Array.from(enabledAgents)
    });
    onOpenChange(false);
  };

  const toggleAgent = (agentId: string) => {
    const next = new Set(enabledAgents);
    if (next.has(agentId)) {
      next.delete(agentId);
    } else {
      next.add(agentId);
    }
    setEnabledAgents(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{server ? "Editar Servidor MCP" : "Nuevo Servidor MCP"}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 px-4 -mx-4">
          <div className="flex flex-col gap-4 py-4 px-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Transporte</Label>
                <Select value={transport} onValueChange={v => setTransport(v as "stdio" | "http")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stdio">Stdio</SelectItem>
                    <SelectItem value="http">HTTP / SSE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {transport === "stdio" ? (
              <div className="space-y-1">
                <Label>Comando y Argumentos (ej: npx -y @modelcontextprotocol/server-filesystem /dir)</Label>
                <Input value={command} onChange={e => setCommand(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>URL</Label>
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/sse" />
              </div>
            )}

            <div className="space-y-1 flex-1 flex flex-col min-h-[150px]">
              <Label>Variables de Entorno (una por línea, CLAVE=valor)</Label>
              <Textarea 
                className="flex-1 font-mono resize-none min-h-[150px]" 
                value={env} 
                onChange={e => setEnv(e.target.value)} 
                placeholder="API_KEY=xxx"
              />
            </div>

            <div className="space-y-2 border p-4 rounded-md">
              <div className="flex items-center gap-2">
                <Switch checked={allAgents} onCheckedChange={setAllAgents} id="mcp-all-agents" />
                <Label htmlFor="mcp-all-agents">Habilitado para todos los agentes</Label>
              </div>

              {!allAgents && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {config.agents.map(a => (
                    <Button 
                      key={a.id} 
                      variant={enabledAgents.has(a.id) ? "default" : "outline"} 
                      size="sm"
                      onClick={() => toggleAgent(a.id)}
                    >
                      {a.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || (transport === "stdio" ? !command.trim() : !url.trim())}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
