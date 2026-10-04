import { useEffect, useState, type ReactNode } from "react";
import { confirmDelete } from "@/lib/confirm";
import { useAppStore, selectAllAgents } from "@/store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { McpDialog } from "@/components/McpDialog";
import { SuggestedDialog } from "@/components/settings/SuggestedDialog";
import { ImportMcpDialog } from "@/components/settings/ImportMcpDialog";
import { alreadyKnown, detectMcpServers, type DetectedMcp } from "@/lib/mcp-import";
import { plural } from "@/i18n";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { syncMcpToAntigravity } from "@/lib/mcp-sync";
import { McpServer } from "@/types";
import { Plug, MoreHorizontal } from "lucide-react";
import { createDialogContext, createToggleContext } from "@/components/settings/section-context";
import { useT } from "@/i18n/useT";

const McpDialogCtx = createDialogContext<McpServer>();
const SuggestedCtx = createToggleContext();
const ImportCtx = createToggleContext();

export function McpSectionProvider({ children }: { children: ReactNode }) {
  return (
    <McpDialogCtx.Provider>
      <SuggestedCtx.Provider>
        <ImportCtx.Provider>{children}</ImportCtx.Provider>
      </SuggestedCtx.Provider>
    </McpDialogCtx.Provider>
  );
}

export function McpSectionActions() {
  const t = useT();
  const config = useAppStore(state => state.config);
  const { openCreate } = McpDialogCtx.useDialogState();
  const { show } = SuggestedCtx.useToggleState();
  const { show: showImport } = ImportCtx.useToggleState();

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
          <DropdownMenuItem onSelect={showImport}>{t("mcpImport.menu")}</DropdownMenuItem>
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
  const { open: importOpen, hide: hideImport, show: showImport } = ImportCtx.useToggleState();

  // What the user's other tools already have, looked for once each time the section opens. A
  // handful of small reads; nothing is written anywhere.
  const [detected, setDetected] = useState<DetectedMcp[] | null>(null);
  useEffect(() => {
    let live = true;
    void detectMcpServers().then(found => { if (live) setDetected(found); }).catch(() => { if (live) setDetected([]); });
    return () => { live = false; };
  }, []);
  const fresh = (detected ?? []).filter(d => !d.project && !alreadyKnown(config.mcpServers, d.server)).length;

  const banner = fresh > 0 && (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
      <span className="text-sm">{plural(fresh, t("mcpImport.banner.one", { n: fresh }), t("mcpImport.banner.other", { n: fresh }))}</span>
      <Button size="sm" variant="outline" onClick={showImport}>{t("mcpImport.bannerAction")}</Button>
    </div>
  );

  const dialogs = (
    <>
      <McpDialog open={open} onOpenChange={(o) => !o && close()} server={editing} />
      <SuggestedDialog kind="mcp" open={suggestedOpen} onOpenChange={(o) => (o ? showSuggested() : hideSuggested())} />
      <ImportMcpDialog open={importOpen} onOpenChange={(o) => (o ? showImport() : hideImport())} detected={detected} />
    </>
  );

  if (config.mcpServers.length === 0) {
    return (
      <>
        {banner}
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
      {banner}
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
