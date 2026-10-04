import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "@/store";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { confirmDelete } from "@/lib/confirm";
import { getTransport } from "@/lib/transport";
import { pickPath } from "@/lib/pick-dir";
import { imageTypeOf } from "@/lib/file-preview";
import { extensionRecord, parseManifest, runsHere, serverFromManifest, type ExtensionValue, type McpbManifest } from "@/lib/mcpb";
import { ExtensionConfigDialog } from "@/components/settings/ExtensionConfigDialog";
import { useT } from "@/i18n/useT";
import { translateNow } from "@/i18n/useT";
import type { McpServer } from "@/types";
import { Puzzle } from "lucide-react";

/** Waiting for the user's values, between unpacking an extension and adding its server. */
interface Pending {
  manifest: McpbManifest;
  dir: string;
  /** The server it replaces: an update, or the same extension configured again. */
  server?: McpServer;
}

interface ExtensionsApi {
  install: () => void;
  configure: (server: McpServer) => void;
}

/** One place that installs and configures, shared by the header button and the list below it. */
const Ctx = createContext<ExtensionsApi | null>(null);
const useExtensions = () => useContext(Ctx)!;

export function ExtensionsSectionActions() {
  const t = useT();
  const { install } = useExtensions();
  return <Button size="sm" onClick={install}>{t("extensions.install")}</Button>;
}

const sepOf = (path: string) => (path.includes("\\") ? "\\" : "/");

/** The manifest an installed extension carries in its folder. */
async function manifestOf(dir: string): Promise<McpbManifest | null> {
  const raw = await getTransport().readFileAbs(`${dir}${sepOf(dir)}manifest.json`).catch(() => null);
  return raw ? parseManifest(raw) : null;
}

/** Builds the server out of the manifest and the user's values, and adds it (or replaces it). */
async function saveExtension(pending: Pending, values: Record<string, ExtensionValue>): Promise<boolean> {
  const home = await getTransport().homeDir().catch(() => null);
  const built = home ? serverFromManifest({ manifest: pending.manifest, dir: pending.dir, home, values }) : null;
  if (!built) {
    toast.error(translateNow("extensions.missingValues"));
    return false;
  }
  useAppStore.getState().upsertMcpServer({
    ...built,
    id: pending.server?.id ?? crypto.randomUUID(),
    // A new extension is for everyone, like one installed in Claude; an existing one keeps its choice.
    enabledFor: pending.server?.enabledFor ?? "all",
    extension: extensionRecord(pending.manifest, pending.dir, values, pending.server?.extension?.external),
  });
  return true;
}

export function ExtensionsSectionProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);

  const install = async () => {
    const path = await pickPath({ extensions: ["mcpb", "dxt"], label: t("extensions.fileKind") });
    if (!path) return;
    const transport = getTransport();
    let installed: { dir: string; manifest: string } | null;
    try {
      installed = await transport.installExtension(path);
    } catch (e) {
      toast.error(t("extensions.installFailed", { error: e instanceof Error ? e.message : String(e) }));
      return;
    }
    if (!installed) { toast.error(t("extensions.unavailable")); return; }
    const manifest = parseManifest(installed.manifest);
    const home = await transport.homeDir().catch(() => null);
    if (!manifest || !home || !runsHere(manifest, home)) {
      await transport.removeExtension(installed.dir).catch(() => {});
      toast.error(!manifest ? t("extensions.invalid") : t("extensions.otherSystem"));
      return;
    }
    const server = useAppStore.getState().config.mcpServers.find(s => s.extension?.id === manifest.name && !s.extension.external);
    const next: Pending = { manifest, dir: installed.dir, ...(server ? { server } : {}) };
    if (manifest.fields.length > 0) { setPending(next); return; }
    if (await saveExtension(next, {})) toast.success(t("extensions.installed", { name: manifest.displayName }));
  };
  const configure = async (server: McpServer) => {
    const manifest = await manifestOf(server.extension!.dir);
    if (!manifest) { toast.error(t("extensions.invalid")); return; }
    setPending({ manifest, dir: server.extension!.dir, server });
  };

  return (
    <Ctx.Provider value={{ install: () => void install(), configure: server => void configure(server) }}>
      {children}
      <ExtensionConfigDialog
      open={pending !== null}
      onOpenChange={o => { if (!o) setPending(null); }}
      manifest={pending?.manifest ?? null}
      initial={pending?.server?.extension?.config}
      onSave={values => {
        if (!pending) return;
        void saveExtension(pending, values).then(ok => {
          if (!ok) return;
          if (!pending.server) toast.success(t("extensions.installed", { name: pending.manifest.displayName }));
          setPending(null);
        });
      }}
      />
    </Ctx.Provider>
  );
}

export function ExtensionsSection() {
  const t = useT();
  const servers = useAppStore(state => state.config.mcpServers);
  const upsertMcpServer = useAppStore(state => state.upsertMcpServer);
  const removeMcpServer = useAppStore(state => state.removeMcpServer);
  const { install, configure } = useExtensions();
  const extensions = servers.filter(s => s.extension);

  const uninstall = async (server: McpServer) => {
    if (!(await confirmDelete(t("extensions.uninstall"), server.name))) return;
    removeMcpServer(server.id);
    // Claude's own extensions stay where Claude put them; only ainess's folder is ever deleted.
    if (!server.extension?.external) await getTransport().removeExtension(server.extension!.dir).catch(() => {});
  };

  if (extensions.length === 0) {
    return (
      <EmptyState
        icon={Puzzle}
        title={t("extensions.empty.title")}
        description={t("extensions.empty.body")}
        action={{ label: t("extensions.install"), onClick: install }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("extensions.reach")}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {extensions.map(server => (
          <ExtensionCard
            key={server.id}
            server={server}
            onToggle={enabled => upsertMcpServer({ ...server, enabledFor: enabled ? "all" : [] })}
            onConfigure={() => configure(server)}
            onUninstall={() => void uninstall(server)}
          />
        ))}
      </div>
    </div>
  );
}

function ExtensionCard({ server, onToggle, onConfigure, onUninstall }: {
  server: McpServer;
  onToggle: (enabled: boolean) => void;
  onConfigure: () => void;
  onUninstall: () => void;
}) {
  const t = useT();
  const ext = server.extension!;
  const [manifest, setManifest] = useState<McpbManifest | null>(null);
  const [icon, setIcon] = useState<string | null>(null);

  // What the card says about it comes from the manifest in its folder, read once.
  useEffect(() => {
    let live = true;
    void manifestOf(ext.dir).then(async m => {
      if (!live || !m) return;
      setManifest(m);
      const type = m.icon ? imageTypeOf(m.icon) : undefined;
      if (!m.icon || !type) return;
      const bytes = await getTransport().readFileBytes(`${ext.dir}${sepOf(ext.dir)}${m.icon}`, 512 * 1024).catch(() => null);
      if (live && bytes) setIcon(`data:${type};base64,${bytes}`);
    });
    return () => { live = false; };
  }, [ext.dir]);

  const enabled = server.enabledFor === "all" || server.enabledFor.length > 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          {icon ? <img src={icon} alt="" className="size-9 shrink-0 rounded-md" /> : <Puzzle className="size-9 shrink-0 rounded-md bg-muted p-2 text-muted-foreground" />}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {server.name}
              {ext.version && <span className="text-xs font-normal text-muted-foreground">{ext.version}</span>}
              {ext.external && <Badge variant="outline" className="text-[10px]">{t("mcpImport.source.claude-desktop")}</Badge>}
            </CardTitle>
            {manifest?.author && <span className="text-xs text-muted-foreground">{manifest.author}</span>}
            {manifest?.description && <CardDescription>{manifest.description}</CardDescription>}
          </div>
          <Switch checked={enabled} onCheckedChange={onToggle} aria-label={t("extensions.enabled")} />
        </div>
      </CardHeader>
      <CardFooter className="flex justify-end gap-2">
        {manifest && manifest.fields.length > 0 && <Button variant="outline" size="sm" onClick={onConfigure}>{t("extensions.configure.button")}</Button>}
        <Button variant="destructive" size="sm" onClick={onUninstall}>{t("extensions.uninstall")}</Button>
      </CardFooter>
    </Card>
  );
}
