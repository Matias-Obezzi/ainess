import { useState, useEffect } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { McpServer } from "@/types";
import { parseHeaders, formatHeaders } from "@/lib/mcp-headers";
import { useT } from "@/i18n/useT";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server?: McpServer | null;
}

export function McpDialog({ open, onOpenChange, server }: Props) {
  const t = useT();
  const agents = useAppStore(selectAllAgents);
  const upsertMcpServer = useAppStore(state => state.upsertMcpServer);

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");
  const [env, setEnv] = useState("");
  const [headers, setHeaders] = useState("");
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
        setHeaders(formatHeaders(server.headers));
        setAllAgents(server.enabledFor === "all");
        setEnabledAgents(server.enabledFor === "all" ? new Set() : new Set(server.enabledFor));
      } else {
        setId(crypto.randomUUID());
        setName("");
        setTransport("stdio");
        setCommand("");
        setUrl("");
        setEnv("");
        setHeaders("");
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

    // Each transport keeps only the field it can act on. The other one is dropped rather than
    // saved: a credential stored where nothing reads it is a credential kept for nothing.
    const headersObj = transport === "http" ? parseHeaders(headers) : {};
    const envForTransport = transport === "stdio" ? envObj : {};

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
      env: Object.keys(envForTransport).length > 0 ? envForTransport : undefined,
      headers: Object.keys(headersObj).length > 0 ? headersObj : undefined,
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
          <DialogTitle>{server ? t("mcpDialog.edit") : t("mcpDialog.new")}</DialogTitle>
        </DialogHeader>
        
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          <div className="flex flex-col gap-4 py-4 px-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t("common.name")}</Label>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("mcpDialog.transport")}</Label>
                <Select value={transport} onValueChange={v => setTransport(v as "stdio" | "http")}>
                  <SelectTrigger className="w-full">
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
                <Label>{t("mcpDialog.commandAndArgs")}</Label>
                <Input value={command} onChange={e => setCommand(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>URL</Label>
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/sse" />
              </div>
            )}

            {transport === "http" && (
              <div className="space-y-1">
                <Label>{t("mcpDialog.headers")}</Label>
                <Textarea
                  className="font-mono resize-none min-h-[80px]"
                  value={headers}
                  onChange={e => setHeaders(e.target.value)}
                  placeholder={t("mcpDialog.headersPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("mcpDialog.headersHint")}</p>
              </div>
            )}

            {/* Only a stdio server has a process to give an environment to. On an http one this box
                was drawn all the same and went nowhere — the http branch of the session config has
                never written `env` — so it promised somewhere to keep a key and quietly dropped it.
                An http server puts its credential in a header. */}
            {transport === "stdio" && (
              <div className="space-y-1 flex-1 flex flex-col min-h-[150px]">
                <Label>{t("mcpDialog.env")}</Label>
                <Textarea
                  className="flex-1 font-mono resize-none min-h-[150px]"
                  value={env}
                  onChange={e => setEnv(e.target.value)}
                  placeholder="API_KEY=xxx"
                />
              </div>
            )}

            <div className="space-y-2 border p-4 rounded-md">
              <div className="flex items-center gap-2">
                <Switch checked={allAgents} onCheckedChange={setAllAgents} id="mcp-all-agents" />
                <Label htmlFor="mcp-all-agents">{t("mcpDialog.enabledForAll")}</Label>
              </div>

              {!allAgents && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {agents.map(a => (
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
        </div>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={!name.trim() || (transport === "stdio" ? !command.trim() : !url.trim())}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
