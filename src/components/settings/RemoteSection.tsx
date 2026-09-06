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
import { openExternal } from "@/lib/open-external";
import { tunnelUrl } from "@/lib/remote";
import { TUNNEL_PROVIDERS, fixedUrl, hasFixedUrl, normalizeDomain, tunnelBinary, tunnelDescription, tunnelInstallCommand, type TunnelProvider } from "@/lib/tunnel";
import { NGROK_API_KEYS_URL, NGROK_AUTHTOKEN_URL, NGROK_DOMAINS_URL } from "@/lib/ngrok";
import { ngrokAccountStatus, ngrokReservedDomains, saveNgrokCredential, type NgrokAccountStatus } from "@/lib/ngrok-account";
import { Copy, ExternalLink, Globe, Loader2, RefreshCw, Smartphone, TriangleAlert } from "lucide-react";

/**
 * One ngrok credential (authtoken or API key). The value only lives in this component's state
 * until it is handed to the ngrok CLI: it is never stored in ainess's config nor logged.
 */
function NgrokCredential({ label, hint, configured, dashboardUrl, disabled, onSave }: {
  label: string;
  hint: string;
  configured: boolean;
  dashboardUrl: string;
  disabled: boolean;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (await onSave(value.trim())) {
        setValue("");
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Badge variant={configured ? "secondary" : "outline"}>{configured ? "Configurado" : "Falta"}</Badge>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(o => !o)}>
          {configured ? "Cambiar" : "Configurar"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`Abrir ${label} en el dashboard de ngrok`}
          onClick={() => void openExternal(dashboardUrl)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            autoComplete="off"
            className="w-72"
            placeholder="Pegá el valor del dashboard"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !saving) void save(); }}
          />
          <Button size="sm" disabled={saving || !value.trim()} onClick={() => void save()}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Guardar
          </Button>
        </div>
      )}
    </div>
  );
}

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
  const [domainInput, setDomainInput] = useState(remote.tunnel.domain ?? "");
  const [tunnelNameInput, setTunnelNameInput] = useState(remote.tunnel.tunnelName ?? "");
  const [ngrokAccount, setNgrokAccount] = useState<NgrokAccountStatus | null>(null);
  const [ngrokDomains, setNgrokDomains] = useState<string[] | null>(null);
  const [loadingDomains, setLoadingDomains] = useState(false);

  const provider = remote.tunnel.provider;
  const binaryPath = detected ? detected[provider] : null;
  const publicUrl = tunnel.running && tunnel.url ? tunnelUrl(tunnel.url, remote.token) : null;
  const fixedOpts = { domain: remote.tunnel.domain, tunnelName: remote.tunnel.tunnelName };
  const isFixed = hasFixedUrl(provider, fixedOpts);
  const previewUrl = fixedUrl(provider, fixedOpts);
  const missingTunnelName = provider === "cloudflared" && !!normalizeDomain(remote.tunnel.domain) && !remote.tunnel.tunnelName?.trim();

  useEffect(() => { setPort(String(remote.port)); }, [remote.port]);
  useEffect(() => { setDomainInput(remote.tunnel.domain ?? ""); }, [remote.tunnel.domain]);
  useEffect(() => { setTunnelNameInput(remote.tunnel.tunnelName ?? ""); }, [remote.tunnel.tunnelName]);

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

  /** Saves the fixed-URL fields and, if the tunnel is up, restarts it against the new config. */
  const applyTunnelFixedFields = async (patch: { domain?: string; tunnelName?: string }) => {
    const nextTunnel = { ...remote.tunnel, ...patch };
    updateConfig({ remote: { ...remote, tunnel: nextTunnel } });
    if (!tunnel.running) return;
    setTunnelBusy(true);
    try {
      await stopTunnel();
      await startTunnel();
    } catch (e) {
      updateConfig({ remote: { ...remote, tunnel: { ...nextTunnel, enabled: false } } });
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTunnelBusy(false);
    }
  };

  const applyDomain = () => {
    const normalized = normalizeDomain(domainInput);
    setDomainInput(normalized);
    if (normalized === (remote.tunnel.domain ?? "")) return;
    void applyTunnelFixedFields({ domain: normalized });
  };

  const applyTunnelName = () => {
    const trimmed = tunnelNameInput.trim();
    setTunnelNameInput(trimmed);
    if (trimmed === (remote.tunnel.tunnelName ?? "")) return;
    void applyTunnelFixedFields({ tunnelName: trimmed });
  };

  const ngrokPath = detected?.ngrok ?? null;

  const refreshNgrokAccount = useCallback(async () => {
    if (!ngrokPath) { setNgrokAccount(null); return; }
    setNgrokAccount(await ngrokAccountStatus(ngrokPath));
  }, [ngrokPath]);

  // Read the account state when ngrok is the chosen provider (and after it is detected).
  useEffect(() => {
    if (provider === "ngrok") void refreshNgrokAccount();
  }, [provider, refreshNgrokAccount]);

  /** Hands one credential to `ngrok config add-…`. Returns whether it was saved. */
  const saveCredential = async (kind: "authtoken" | "api-key", value: string): Promise<boolean> => {
    if (!ngrokPath) return false;
    try {
      await saveNgrokCredential(ngrokPath, kind, value);
      toast.success(kind === "authtoken" ? "Authtoken guardado" : "API key guardada");
      await refreshNgrokAccount();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const loadNgrokDomains = async () => {
    if (!ngrokPath) return;
    setLoadingDomains(true);
    try {
      const list = await ngrokReservedDomains(ngrokPath);
      setNgrokDomains(list);
      // One domain and nothing chosen yet: pick it, which is what the user wanted anyway.
      if (list.length === 1 && !normalizeDomain(remote.tunnel.domain)) {
        await applyTunnelFixedFields({ domain: normalizeDomain(list[0]) });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingDomains(false);
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

        {provider === "ngrok" && (
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <span className="text-xs font-semibold text-muted-foreground">Cuenta de ngrok</span>
            <NgrokCredential
              label="Authtoken"
              hint="Lo necesita ngrok para conectarse. La app solo mira si está presente: si es inválido, el error aparece al prender el túnel."
              configured={!!ngrokAccount?.hasAuthtoken}
              dashboardUrl={NGROK_AUTHTOKEN_URL}
              disabled={!ngrokPath}
              onSave={v => saveCredential("authtoken", v)}
            />
            <NgrokCredential
              label="API key"
              hint="Opcional y distinta del authtoken: sirve para traer tus dominios desde acá."
              configured={!!ngrokAccount?.hasApiKey}
              dashboardUrl={NGROK_API_KEYS_URL}
              disabled={!ngrokPath}
              onSave={v => saveCredential("api-key", v)}
            />
            <span className="text-xs text-muted-foreground">
              {!ngrokPath
                ? "Instalá ngrok para poder configurar la cuenta desde acá."
                : ngrokAccount?.error
                  ? `No se pudo leer la configuración de ngrok: ${ngrokAccount.error}`
                  : "Las dos credenciales se guardan en el archivo de configuración de ngrok, nunca en ainess."}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-md border p-3">
          <span className="text-xs font-semibold text-muted-foreground">URL fija (opcional)</span>
          {provider === "ngrok" ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!ngrokPath || !ngrokAccount?.hasApiKey || loadingDomains}
                  onClick={() => void loadNgrokDomains()}
                >
                  {loadingDomains ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                  Traer mis dominios
                </Button>
                {!ngrokAccount?.hasApiKey && (
                  <span className="text-xs text-muted-foreground">Necesita la API key de arriba.</span>
                )}
              </div>
              {ngrokDomains && ngrokDomains.length > 0 && (
                <Select
                  value={ngrokDomains.includes(normalizeDomain(remote.tunnel.domain)) ? normalizeDomain(remote.tunnel.domain) : undefined}
                  onValueChange={v => void applyTunnelFixedFields({ domain: normalizeDomain(v) })}
                >
                  <SelectTrigger className="w-72"><SelectValue placeholder="Elegí uno de tus dominios" /></SelectTrigger>
                  <SelectContent>
                    {ngrokDomains.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {ngrokDomains?.length === 0 && (
                <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  Tu cuenta no tiene dominios reservados todavía.
                  <button type="button" className="cursor-pointer underline underline-offset-2" onClick={() => void openExternal(NGROK_DOMAINS_URL)}>
                    Reclamá el gratis en el dashboard
                  </button>
                </span>
              )}
              <label className="text-xs text-muted-foreground">Dominio estático</label>
              <Input
                className="w-72"
                placeholder="algo.ngrok-free.app"
                value={domainInput}
                onChange={e => setDomainInput(e.target.value)}
                onBlur={applyDomain}
                onKeyDown={e => e.key === "Enter" && applyDomain()}
              />
              <span className="text-xs text-muted-foreground">
                El plan gratis de ngrok incluye un dominio estático. Reclamalo en dashboard.ngrok.com → Domains y pegalo
                acá: la URL pública no cambia más.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Nombre del túnel</label>
                <Input
                  className="w-72"
                  placeholder="ainess"
                  value={tunnelNameInput}
                  onChange={e => setTunnelNameInput(e.target.value)}
                  onBlur={applyTunnelName}
                  onKeyDown={e => e.key === "Enter" && applyTunnelName()}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Hostname</label>
                <Input
                  className="w-72"
                  placeholder="ainess.midominio.com"
                  value={domainInput}
                  onChange={e => setDomainInput(e.target.value)}
                  onBlur={applyDomain}
                  onKeyDown={e => e.key === "Enter" && applyDomain()}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                Necesitás una cuenta de Cloudflare con tu dominio. Corré una vez estos comandos y completá los campos:
              </span>
              <code className="whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">
                {"cloudflared tunnel login\ncloudflared tunnel create ainess\ncloudflared tunnel route dns ainess ainess.midominio.com"}
              </code>
              {missingTunnelName && <span className="text-xs text-destructive">Falta el nombre del túnel.</span>}
            </div>
          )}
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
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  Túnel público
                  {isFixed && <Badge variant="secondary">URL fija</Badge>}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {tunnelBusy ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      {remote.tunnel.enabled ? "Creando el túnel… puede tardar unos segundos" : "Cerrando el túnel…"}
                    </>
                  ) : tunnel.running ? `Activo con ${tunnel.provider ?? provider}` : tunnel.error ? tunnel.error : "Apagado"}
                </span>
                {isFixed && previewUrl && !tunnel.running && (
                  <span className="text-xs text-muted-foreground">Al prenderlo, la URL va a ser <code className="rounded bg-muted px-1">{previewUrl}</code></span>
                )}
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
