import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "@/store";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { confirmDelete } from "@/lib/confirm";
import { getTransport } from "@/lib/transport";
import { formatHeaders, parseHeaders } from "@/lib/mcp-headers";
import { useT } from "@/i18n/useT";
import type { McpServer } from "@/types";
import { Cable } from "lucide-react";

interface ConnectorsApi {
  /** Opens the dialog, empty or on an existing connector. */
  edit: (server?: McpServer) => void;
}

const Ctx = createContext<ConnectorsApi | null>(null);
const useConnectors = () => useContext(Ctx)!;

/** A connector is a remote server; the local ones are under MCP and the packaged ones under Extensions. */
export const isConnector = (s: McpServer) => s.transport === "http" && !s.extension;

export function ConnectorsSectionProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState<McpServer | null | undefined>(undefined);
  return (
    <Ctx.Provider value={{ edit: server => setEditing(server ?? null) }}>
      {children}
      <ConnectorDialog open={editing !== undefined} server={editing ?? undefined} onClose={() => setEditing(undefined)} />
    </Ctx.Provider>
  );
}

export function ConnectorsSectionActions() {
  const t = useT();
  const { edit } = useConnectors();
  return <Button size="sm" onClick={() => edit()}>{t("connectors.add")}</Button>;
}

/** Name, address and how it signs in: with OAuth, with headers the user pastes, or not at all. */
function ConnectorDialog({ open, server, onClose }: { open: boolean; server?: McpServer; onClose: () => void }) {
  const t = useT();
  const upsertMcpServer = useAppStore(state => state.upsertMcpServer);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [oauth, setOauth] = useState(true);
  const [headers, setHeaders] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(server?.name ?? "");
    setUrl(server?.url ?? "");
    setOauth(server ? !!server.oauth : true);
    setHeaders(formatHeaders(server?.headers));
  }, [open, server]);

  const valid = name.trim() !== "" && /^https?:\/\/\S+$/.test(url.trim());
  const save = () => {
    const parsed = oauth ? {} : parseHeaders(headers);
    upsertMcpServer({
      id: server?.id ?? crypto.randomUUID(),
      name: name.trim(),
      transport: "http",
      url: url.trim(),
      ...(Object.keys(parsed).length ? { headers: parsed } : {}),
      ...(oauth ? { oauth: true } : {}),
      enabledFor: server?.enabledFor ?? "all",
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{server ? t("connectors.editTitle") : t("connectors.addTitle")}</DialogTitle>
          <DialogDescription>{t("connectors.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold" htmlFor="connector-name">{t("connectors.name")}</label>
            <Input id="connector-name" value={name} onChange={e => setName(e.target.value)} placeholder="Linear" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold" htmlFor="connector-url">{t("connectors.url")}</label>
            <Input id="connector-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://mcp.linear.app/mcp" />
          </div>
          <div className="flex items-start gap-2">
            <Switch id="connector-oauth" checked={oauth} onCheckedChange={setOauth} />
            <div className="flex flex-col">
              <label className="text-sm font-semibold" htmlFor="connector-oauth">{t("connectors.oauth")}</label>
              <span className="text-xs text-muted-foreground">{t("connectors.oauthHint")}</span>
            </div>
          </div>
          {!oauth && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold" htmlFor="connector-headers">{t("connectors.headers")}</label>
              <textarea
                id="connector-headers"
                className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
                value={headers}
                onChange={e => setHeaders(e.target.value)}
                placeholder="Authorization: Bearer ${API_TOKEN}"
              />
              <span className="text-xs text-muted-foreground">{t("connectors.headersHint")}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!valid} onClick={save}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConnectorsSection() {
  const t = useT();
  const servers = useAppStore(state => state.config.mcpServers);
  const { edit } = useConnectors();
  const connectors = servers.filter(isConnector);

  if (connectors.length === 0) {
    return (
      <EmptyState
        icon={Cable}
        title={t("connectors.empty.title")}
        description={t("connectors.empty.body")}
        action={{ label: t("connectors.add"), onClick: () => edit() }}
      />
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("connectors.reach")}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {connectors.map(server => <ConnectorCard key={server.id} server={server} />)}
      </div>
    </div>
  );
}

function ConnectorCard({ server }: { server: McpServer }) {
  const t = useT();
  const { edit } = useConnectors();
  const upsertMcpServer = useAppStore(state => state.upsertMcpServer);
  const removeMcpServer = useAppStore(state => state.removeMcpServer);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!server.oauth) return;
    let live = true;
    void getTransport().oauthStatus(server.id).then(s => { if (live) setConnected(s.connected); });
    return () => { live = false; };
  }, [server.id, server.oauth]);

  const connect = async () => {
    setBusy(true);
    try {
      await getTransport().oauthConnect(server.id, server.url ?? "", t("connectors.browserDone"));
      setConnected(true);
      toast.success(t("connectors.connected", { name: server.name }));
    } catch (e) {
      toast.error(t("connectors.connectFailed", { name: server.name, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await getTransport().oauthDisconnect(server.id).catch(() => {});
    setConnected(false);
  };

  const remove = async () => {
    if (!(await confirmDelete(t("connectors.delete"), server.name))) return;
    // The sign-in goes with it: a token nobody will ever use again is not left in the keychain.
    if (server.oauth) await getTransport().oauthDisconnect(server.id).catch(() => {});
    removeMcpServer(server.id);
  };

  const enabled = server.enabledFor === "all" || server.enabledFor.length > 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Cable className="size-9 shrink-0 rounded-md bg-muted p-2 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {server.name}
              {server.oauth && connected !== null && (
                <Badge variant={connected ? "secondary" : "outline"} className="text-[10px]">
                  {connected ? t("connectors.status.connected") : t("connectors.status.disconnected")}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="break-all">{server.url}</CardDescription>
          </div>
          <Switch checked={enabled} onCheckedChange={on => upsertMcpServer({ ...server, enabledFor: on ? "all" : [] })} aria-label={t("extensions.enabled")} />
        </div>
      </CardHeader>
      <CardFooter className="flex flex-wrap justify-end gap-2">
        {server.oauth && (connected
          ? <Button variant="outline" size="sm" onClick={() => void disconnect()}>{t("connectors.disconnect")}</Button>
          : <Button size="sm" disabled={busy} onClick={() => void connect()}>{busy ? t("connectors.connecting") : t("connectors.connect")}</Button>)}
        <Button variant="outline" size="sm" onClick={() => edit(server)}>{t("common.edit")}</Button>
        <Button variant="destructive" size="sm" onClick={() => void remove()}>{t("common.delete")}</Button>
      </CardFooter>
    </Card>
  );
}
