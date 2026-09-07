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
import { useT } from "@/i18n/useT";

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
  const t = useT();
  const config = useAppStore(state => state.config);
  const { openCreate } = McpDialogCtx.useDialogState();
  const { show } = SuggestedCtx.useToggleState();

  const handleSyncMcp = async () => {
    const res = await syncMcpToAntigravity(config.mcpServers);
    if (res.success) {
      toast.success(t("mcp.syncDone", { added: res.added, removed: res.removed }));
    } else {
      toast.error(res.error || t("mcp.syncFailed"));
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
          <DropdownMenuItem onSelect={show}>{t("suggested.button")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleSyncMcp()}>{t("mcp.syncWithAntigravity")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" onClick={openCreate}>{t("mcp.new")}</Button>
    </div>
  );
}

export function McpSection() {
  const t = useT();
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
          title={t("mcp.empty.title")}
          description={`${t("mcp.empty.body")} ${t("mcp.reach")}`}
          action={{ label: t("mcp.empty.action"), onClick: showSuggested }}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Which CLIs actually receive them: a server enabled for an agent whose CLI has no way in
          did nothing, and said nothing about it. */}
      <p className="text-xs text-muted-foreground">{t("mcp.reach")}</p>
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
                  <Badge variant="secondary">{t("common.all")}</Badge>
                ) : (
                  server.enabledFor.map(id => {
                    const agent = agents.find(a => a.id === id);
                    return <Badge key={id} variant="outline">{agent?.name || id}</Badge>;
                  })
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(server)}>{t("common.edit")}</Button>
              <Button variant="destructive" size="sm" onClick={() => void confirmDelete(t("mcp.delete"), server.name).then(ok => ok && removeMcpServer(server.id))}>{t("common.delete")}</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {dialogs}
    </div>
  );
}
