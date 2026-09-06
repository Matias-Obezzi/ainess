import type { ReactNode } from "react";
import { confirmDelete } from "@/lib/confirm";
import { useAppStore, selectAllAgents } from "@/store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { McpDialog } from "@/components/McpDialog";
import { SuggestedDialog } from "@/components/settings/SuggestedDialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { syncMcpToAntigravity } from "@/lib/mcp-sync";
import { McpServer } from "@/types";
import { Plug, MoreHorizontal } from "lucide-react";
import { createDialogContext, createToggleContext } from "@/components/settings/section-context";

const McpDialogCtx = createDialogContext<McpServer>();
const SuggestedCtx = createToggleContext();

export function McpSectionProvider({ children }: { children: ReactNode }) {
  return (
    <McpDialogCtx.Provider>
      <SuggestedCtx.Provider>{children}</SuggestedCtx.Provider>
    </McpDialogCtx.Provider>
  );
}

export function McpSectionActions() {
  const config = useAppStore(state => state.config);
  const { openCreate } = McpDialogCtx.useDialogState();
  const { show } = SuggestedCtx.useToggleState();

  const handleSyncMcp = async () => {
    const res = await syncMcpToAntigravity(config.mcpServers);
    if (res.success) {
      toast.success(`Sincronización exitosa: ${res.added} agregados, ${res.removed} removidos`);
    } else {
      toast.error(res.error || "Error sincronizando MCP");
    }
  };

  return (
    <div className="flex gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={show}>Sugeridos</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleSyncMcp()}>Sincronizar con Antigravity</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" onClick={openCreate}>Nuevo MCP</Button>
    </div>
  );
}

export function McpSection() {
  const config = useAppStore(state => state.config);
  const agents = useAppStore(selectAllAgents);
  const removeMcpServer = useAppStore(state => state.removeMcpServer);
  const { open, editing, openEdit, close } = McpDialogCtx.useDialogState();
  const { open: suggestedOpen, hide: hideSuggested, show: showSuggested } = SuggestedCtx.useToggleState();

  const dialogs = (
    <>
      <McpDialog open={open} onOpenChange={(o) => !o && close()} server={editing} />
      <SuggestedDialog kind="mcp" open={suggestedOpen} onOpenChange={(o) => (o ? showSuggested() : hideSuggested())} />
    </>
  );

  if (config.mcpServers.length === 0) {
    return (
      <>
        <EmptyState
          icon={Plug}
          title="Todavía no hay servidores MCP"
          description="Un servidor MCP le da a los agentes herramientas extra: archivos, GitHub, búsqueda web, etc."
          action={{ label: "Agregar sugerido", onClick: showSuggested }}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {config.mcpServers.map(server => (
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
                    const agent = agents.find(a => a.id === id);
                    return <Badge key={id} variant="outline">{agent?.name || id}</Badge>;
                  })
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(server)}>Editar</Button>
              <Button variant="destructive" size="sm" onClick={() => void confirmDelete("el servidor MCP", server.name).then(ok => ok && removeMcpServer(server.id))}>Eliminar</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {dialogs}
    </div>
  );
}
