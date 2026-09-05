import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { Copy, RefreshCw, Smartphone } from "lucide-react";

/** Configuración > Remoto: enable the LAN server and show the phone URL as text and QR. */
export function RemoteSection() {
  const remote = useAppStore(state => state.config.remote);
  const status = useAppStore(state => state.remoteStatus);
  const updateConfig = useAppStore(state => state.updateConfig);
  const startRemote = useAppStore(state => state.startRemote);
  const stopRemote = useAppStore(state => state.stopRemote);
  const refreshRemoteStatus = useAppStore(state => state.refreshRemoteStatus);
  const regenerateRemoteToken = useAppStore(state => state.regenerateRemoteToken);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [port, setPort] = useState(String(remote.port));
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => { setPort(String(remote.port)); }, [remote.port]);

  // First read of the current status (it may already be running from a previous process).
  useEffect(() => {
    void refreshRemoteStatus().finally(() => setInitialLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connected-clients counter.
  useEffect(() => {
    if (!status.running) return;
    const t = setInterval(() => void refreshRemoteStatus(), 3000);
    return () => clearInterval(t);
  }, [status.running, refreshRemoteStatus]);

  useEffect(() => {
    if (!status.url || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, status.url, { width: 220, margin: 1, color: { dark: "#000000", light: "#ffffff" } }).catch(() => {});
  }, [status.url]);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      updateConfig({ remote: { ...remote, enabled } });
      if (enabled) {
        await startRemote();
        toast.success("Acceso remoto activo");
      } else {
        await stopRemote();
      }
    } catch (e) {
      updateConfig({ remote: { ...remote, enabled: false } });
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyPort = () => {
    const n = parseInt(port, 10);
    if (!n || n < 1024 || n > 65535) { toast.error("Puerto inválido (1024-65535)"); return; }
    updateConfig({ remote: { ...remote, port: n } });
    if (status.running) void stopRemote().then(() => startRemote()).catch(e => toast.error(String(e)));
  };

  const copy = async () => {
    if (!status.url) return;
    try { await navigator.clipboard.writeText(status.url); toast.success("URL copiada"); }
    catch { toast.error("No se pudo copiar"); }
  };

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
            <Button variant="secondary" size="sm" className="self-start" onClick={() => void copy()}>
              <Copy className="mr-1 h-4 w-4" /> Copiar URL
            </Button>
            <p className="text-xs text-muted-foreground">
              Si no carga desde el celular, revisá que el firewall de Windows permita conexiones entrantes al puerto {remote.port}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
