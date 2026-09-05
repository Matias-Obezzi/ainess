import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { getTransport } from "@/lib/transport";
import { tunnelUrl } from "@/lib/remote";
import { TUNNEL_PROVIDERS, tunnelBinary, tunnelDescription, tunnelInstallCommand, type TunnelProvider } from "@/lib/tunnel";
import { Copy, Globe, RefreshCw, Smartphone, TriangleAlert } from "lucide-react";

/** Configuración > Remoto: LAN server (URL + QR) and the optional public tunnel. */
export function RemoteSection() {
  const remote = useAppStore(state => state.config.remote);
  const status = useAppStore(state => state.remoteStatus);
  const tunnel = useAppStore(state => state.tunnelStatus);
  const updateConfig = useAppStore(state => state.updateConfig);
  const startRemote = useAppStore(state => state.startRemote);
  const stopRemote = useAppStore(state => state.stopRemote);
  const refreshRemoteStatus = useAppStore(state => state.refreshRemoteStatus);
  const regenerateRemoteToken = useAppStore(state => state.regenerateRemoteToken);
  const startTunnel = useAppStore(state => state.startTunnel);
  const stopTunnel = useAppStore(state => state.stopTunnel);
  const refreshTunnelStatus = useAppStore(state => state.refreshTunnelStatus);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tunnelCanvasRef = useRef<HTMLCanvasElement>(null);
  const [port, setPort] = useState(String(remote.port));
  const [busy, setBusy] = useState(false);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [detected, setDetected] = useState<{ cloudflared: string | null; ngrok: string | null } | null>(null);

  const provider = remote.tunnel.provider;
  const binaryPath = detected ? detected[provider] : null;
  const publicUrl = tunnel.running && tunnel.url ? tunnelUrl(tunnel.url, remote.token) : null;

  useEffect(() => { setPort(String(remote.port)); }, [remote.port]);

  const detect = useCallback(async () => {
    try {
      setDetected(await getTransport().tunnelDetect());
    } catch {
      setDetected({ cloudflared: null, ngrok: null });
    }
  }, []);

  // First read of the current status (it may already be running from a previous process).
  useEffect(() => {
    void Promise.all([refreshRemoteStatus(), refreshTunnelStatus().catch(() => {}), detect()])
      .finally(() => setInitialLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connected-clients counter, and a tunnel that died on its own.
  useEffect(() => {
    if (!status.running) return;
    const t = setInterval(() => {
      void refreshRemoteStatus();
      void refreshTunnelStatus().catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [status.running, refreshRemoteStatus, refreshTunnelStatus]);

  useEffect(() => {
    if (!status.url || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, status.url, { width: 220, margin: 1, color: { dark: "#000000", light: "#ffffff" } }).catch(() => {});
  }, [status.url]);

  useEffect(() => {
    if (!publicUrl || !tunnelCanvasRef.current) return;
    QRCode.toCanvas(tunnelCanvasRef.current, publicUrl, { width: 220, margin: 1, color: { dark: "#000000", light: "#ffffff" } }).catch(() => {});
  }, [publicUrl]);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      updateConfig({ remote: { ...remote, enabled } });
      if (enabled) {
        await startRemote();
        toast.success("Acceso remoto activo");
      } else {
        await stopRemote();
        // The tunnel cannot outlive the local server it forwards to.
        if (remote.tunnel.enabled) updateConfig({ remote: { ...remote, enabled: false, tunnel: { ...remote.tunnel, enabled: false } } });
      }
    } catch (e) {
      updateConfig({ remote: { ...remote, enabled: false } });
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleTunnel = async (enabled: boolean) => {
    setTunnelBusy(true);
    try {
      updateConfig({ remote: { ...remote, tunnel: { ...remote.tunnel, enabled } } });
      if (enabled) {
        await startTunnel();
        toast.success("Túnel público activo");
      } else {
        await stopTunnel();
      }
    } catch (e) {
      updateConfig({ remote: { ...remote, tunnel: { ...remote.tunnel, enabled: false } } });
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTunnelBusy(false);
    }
  };

  const applyPort = () => {
    const n = parseInt(port, 10);
    if (!n || n < 1024 || n > 65535) { toast.error("Puerto inválido (1024-65535)"); return; }
    updateConfig({ remote: { ...remote, port: n } });
    if (status.running) void stopRemote().then(() => startRemote()).catch(e => toast.error(String(e)));
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success("URL copiada"); }
    catch { toast.error("No se pudo copiar"); }
  };

  const tunnelDisabledReason = !status.running
    ? "Prendé primero el acceso remoto en la red local."
    : !binaryPath
      ? `Falta \`${tunnelBinary(provider)}\`: instalalo con \`${tunnelInstallCommand(provider)}\`.`
      : null;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Abrí la app desde el celular en la misma red WiFi: ves el estado de los agentes y el feed en vivo, mandás prompts
        o instrucciones, detenés y aprobás delegaciones. La URL lleva un token: no la compartas.
      </p>

      {initialLoading ? (
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-9 rounded-full" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Switch checked={remote.enabled} disabled={busy} onCheckedChange={(c) => void toggle(c)} />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Acceso remoto en la red local</span>
            <span className="text-xs text-muted-foreground">
              {status.running ? `Escuchando en ${status.ip}:${remote.port}` : status.error ? `Error: ${status.error}` : "Apagado"}
            </span>
          </div>
          {status.running && <Badge variant="secondary">{status.clients} conectado{status.clients === 1 ? "" : "s"}</Badge>}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Puerto</label>
          <Input className="w-28" value={port} onChange={e => setPort(e.target.value)} onBlur={applyPort} onKeyDown={e => e.key === "Enter" && applyPort()} />
        </div>
        <Button variant="outline" size="sm" onClick={() => void regenerateRemoteToken().then(() => toast.success("Token regenerado"))}>
          <RefreshCw className="mr-1 h-4 w-4" /> Regenerar token
        </Button>
      </div>

      {initialLoading ? (
        <div className="flex flex-col items-start gap-4 md:flex-row">
          <Skeleton className="h-[236px] w-[236px] shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
      ) : status.running && status.url && (
        <div className="flex flex-col items-start gap-4 md:flex-row">
          <div className="self-start rounded-lg bg-white p-2">
            <canvas ref={canvasRef} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium"><Smartphone className="h-4 w-4" /> Escaneá el QR o abrí:</div>
            <code className="break-all rounded-md bg-muted p-2 text-xs">{status.url}</code>
            <Button variant="secondary" size="sm" className="self-start" onClick={() => void copy(status.url!)}>
              <Copy className="mr-1 h-4 w-4" /> Copiar URL
            </Button>
            <p className="text-xs text-muted-foreground">
              Si no carga desde el celular, revisá que el firewall de Windows permita conexiones entrantes al puerto {remote.port}.
            </p>
          </div>
        </div>
      )}

      <Separator />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4" /> Acceso desde afuera (túnel)</span>
          <span className="text-xs text-muted-foreground">
            Publica el servidor local en una URL de internet, para usar la app fuera de tu red. Necesita el acceso local prendido.
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Proveedor</label>
          <Select
            value={provider}
            onValueChange={(v) => updateConfig({ remote: { ...remote, tunnel: { ...remote.tunnel, provider: v as TunnelProvider } } })}
          >
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TUNNEL_PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{tunnelDescription(provider)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {binaryPath ? (
            <>
              <Badge variant="secondary">Detectado</Badge>
              <code className="break-all text-muted-foreground">{binaryPath}</code>
            </>
          ) : (
            <>
              <Badge variant="outline">No instalado</Badge>
              <code className="rounded-md bg-muted px-2 py-1">{tunnelInstallCommand(provider)}</code>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => void detect()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Volver a detectar
          </Button>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex w-fit items-center gap-3">
              <Switch
                checked={remote.tunnel.enabled && tunnel.running}
                disabled={tunnelBusy || !!tunnelDisabledReason}
                onCheckedChange={(c) => void toggleTunnel(c)}
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Túnel público</span>
                <span className="text-xs text-muted-foreground">
                  {tunnel.running ? `Activo con ${tunnel.provider ?? provider}` : tunnel.error ? tunnel.error : "Apagado"}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          {tunnelDisabledReason && <TooltipContent>{tunnelDisabledReason}</TooltipContent>}
        </Tooltip>

        {!tunnel.running && tunnel.error && remote.tunnel.enabled && (
          <Button variant="outline" size="sm" className="self-start" disabled={tunnelBusy || !!tunnelDisabledReason} onClick={() => void toggleTunnel(true)}>
            <RefreshCw className="mr-1 h-4 w-4" /> Reintentar
          </Button>
        )}

        {publicUrl && (
          <>
            <div className="flex flex-col items-start gap-4 md:flex-row">
              <div className="self-start rounded-lg bg-white p-2">
                <canvas ref={tunnelCanvasRef} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="text-sm font-medium">URL pública:</div>
                <code className="break-all rounded-md bg-muted p-2 text-xs">{publicUrl}</code>
                <Button variant="secondary" size="sm" className="self-start" onClick={() => void copy(publicUrl)}>
                  <Copy className="mr-1 h-4 w-4" /> Copiar URL
                </Button>
              </div>
            </div>
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              Cualquiera con esta URL y el token puede operar la app. Si la compartiste, regenerá el token.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
