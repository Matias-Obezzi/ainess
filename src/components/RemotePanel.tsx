import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { Copy, RefreshCw, Smartphone } from "lucide-react";

/** Recursos > Remoto: enable the LAN server and show the phone URL as text and QR. */
export function RemotePanel() {
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

  useEffect(() => { setPort(String(remote.port)); }, [remote.port]);

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
    <div className="flex flex-col gap-5 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Abrí la app desde el celular en la misma red WiFi: ves el estado de los agentes y el feed en vivo, mandás prompts
        o instrucciones, detenés y aprobás delegaciones. La URL lleva un token: no la compartas.
      </p>

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

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Puerto</label>
          <Input className="w-28" value={port} onChange={e => setPort(e.target.value)} onBlur={applyPort} onKeyDown={e => e.key === "Enter" && applyPort()} />
        </div>
        <Button variant="outline" size="sm" onClick={() => void regenerateRemoteToken().then(() => toast.success("Token regenerado"))}>
          <RefreshCw className="h-4 w-4 mr-1" /> Regenerar token
        </Button>
      </div>

      {status.running && status.url && (
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="rounded-lg bg-white p-2 self-start">
            <canvas ref={canvasRef} />
          </div>
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-medium"><Smartphone className="h-4 w-4" /> Escaneá el QR o abrí:</div>
            <code className="text-xs break-all rounded-md bg-muted p-2">{status.url}</code>
            <Button variant="secondary" size="sm" className="self-start" onClick={() => void copy()}>
              <Copy className="h-4 w-4 mr-1" /> Copiar URL
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
