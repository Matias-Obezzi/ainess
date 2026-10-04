import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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
import { NATIVE_TARGETS, nativeMcpResults, subscribeNativeMcp, syncNativeMcp } from "@/lib/mcp-native";
import { Switch } from "@/components/ui/switch";
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
  const { openCreate } = McpDialogCtx.useDialogState();
  const { show } = SuggestedCtx.useToggleState();
  const { show: showImport } = ImportCtx.useToggleState();

  const handleSync = async () => {
    const results = Object.values(await syncNativeMcp());
    const failed = results.filter(r => r.status === "error");
    if (failed.length) toast.error(t("mcpNative.syncFailed", { n: failed.length }));
    else toast.success(t("mcpNative.syncDone"));
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
          <DropdownMenuItem onSelect={() => void handleSync()}>{t("mcpNative.syncNow")}</DropdownMenuItem>
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

  const updateConfig = useAppStore(state => state.updateConfig);
  const results = useSyncExternalStore(subscribeNativeMcp, nativeMcpResults);
  const syncing = config.mcpNativeSync !== false;
  // One line per CLI that was written to or could not be, so the user sees where their servers went.
  const native = (
    <div className="flex flex-col gap-2 rounded-md border px-3 py-2">
      <div className="flex items-center gap-2">
        <Switch checked={syncing} onCheckedChange={(checked) => updateConfig({ mcpNativeSync: checked })} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{t("mcpNative.toggle")}</span>
          <span className="text-xs text-muted-foreground">{t("mcpNative.hint")}</span>
        </div>
      </div>
      {syncing && (
        <ul className="flex flex-col gap-0.5 pl-11 text-xs text-muted-foreground">
          {NATIVE_TARGETS.filter(target => results[target] && results[target]!.status !== "not-installed").map(target => {
            const r = results[target]!;
            return (
              <li key={target} className={r.status === "error" || r.status === "untouched" ? "text-amber-600 dark:text-amber-400" : undefined}>
                <span className="font-medium">{t(`mcpImport.source.${target}`)}</span>
                {" — "}
                {r.status === "error" ? t("mcpNative.status.error", { error: r.error ?? "" })
                  : r.status === "untouched" ? t("mcpNative.status.untouched")
                  : t("mcpNative.status.synced")}
                {r.skipped.length > 0 && ` ${t("mcpNative.status.skipped", { names: r.skipped.join(", ") })}`}
              </li>
            );
          })}
        </ul>
      )}
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
        {native}
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
      {native}
      <p className="text-xs text-muted-foreground">{t("mcp.reach")}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {config.mcpServers.map(server => (
          <Card key={server.id}>
            <CardHeader>
              <CardTitle>{server.name}</CardTitle>
              <CardDescription>{server.transport === "http" ? server.url : `${server.command} ${(server.args ?? []).join(" ")}`.trim()}</CardDescription>
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
