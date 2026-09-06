import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { cn } from "@/lib/utils";
import { openExternal } from "@/lib/open-external";
import { tunnelUrl } from "@/lib/remote";
import { TUNNEL_PROVIDERS, fixedUrl, hasFixedUrl, normalizeDomain, tunnelBinary, tunnelInstallCommand, type TunnelProvider } from "@/lib/tunnel";
import type { TunnelConfig } from "@/types";
import { NGROK_API_KEYS_URL, NGROK_AUTHTOKEN_URL, NGROK_DOMAINS_URL } from "@/lib/ngrok";
import { ensureNgrokUpToDate, installNgrok, ngrokAccountStatus, ngrokReservedDomains, saveNgrokCredential, type NgrokAccountStatus, type NgrokInstallPhase, type NgrokUpdateState } from "@/lib/ngrok-account";
import { Copy, Download, ExternalLink, Globe, Loader2, RefreshCw, Smartphone, TriangleAlert } from "lucide-react";

/** One labelled row of the tunnel card: label on the left, control and its hint on the right. */
function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-3 sm:flex-row sm:gap-4">
      <div className="w-32 shrink-0 pt-1.5 text-sm font-medium">{label}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {children}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

/**
 * State and editor of one ngrok credential (authtoken or API key). The value only lives in this
 * component until it is handed to the ngrok CLI: it never reaches ainess's config nor the log.
 */
function NgrokCredential({ configured, dashboardUrl, disabled, onSave }: {
  configured: boolean;
  dashboardUrl: string;
  disabled: boolean;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const close = () => {
    setValue("");
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (await onSave(value.trim())) close();
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          autoComplete="off"
          autoFocus
          className="max-w-xs"
          placeholder="Pegá el valor del dashboard"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !saving) void save();
            else if (e.key === "Escape") close();
          }}
        />
        <Button size="sm" disabled={saving || !value.trim()} onClick={() => void save()}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Guardar
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={close}>Cancelar</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", configured ? "bg-emerald-500" : "bg-muted-foreground/40")} />
      <span className="text-sm">{configured ? "Configurado" : "Sin configurar"}</span>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setEditing(true)}>
        {configured ? "Cambiar" : "Configurar"}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="Abrirlo en el dashboard de ngrok"
        title="Abrirlo en el dashboard de ngrok"
        onClick={() => void openExternal(dashboardUrl)}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Configuración > Remoto: LAN server (URL + QR) and the optional public tunnel. */
export function RemoteSection() {
  const remote = useAppStore(state => state.config.remote);
  const status = useAppStore(state => state.remoteStatus);
  const tunnel = useAppStore(state => state.tunnelStatus);
  const updateConfig = useAppStore(state => state.updateConfig);
  const toggleRemote = useAppStore(state => state.toggleRemote);
  const busy = useAppStore(state => state.remoteBusy);
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
  const [installing, setInstalling] = useState<NgrokInstallPhase | null>(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [detected, setDetected] = useState<{ cloudflared: string | null; ngrok: string | null } | null>(null);
  const [domainInput, setDomainInput] = useState(remote.tunnel.domain ?? "");
  const [tunnelNameInput, setTunnelNameInput] = useState(remote.tunnel.tunnelName ?? "");
  const [ngrokAccount, setNgrokAccount] = useState<NgrokAccountStatus | null>(null);
  const [ngrokDomains, setNgrokDomains] = useState<string[] | null>(null);
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [ngrokUpdate, setNgrokUpdate] = useState<NgrokUpdateState | null>(null);

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
    try {
      await toggleRemote(enabled);
      if (enabled) toast.success("Acceso remoto activo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const install = async () => {
    setInstalling("installing");
    try {
      const version = await installNgrok(setInstalling);
      await detect();
      toast.success(version ? `ngrok ${version} instalado` : "ngrok instalado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(null);
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
  const applyTunnelFixedFields = async (patch: Partial<TunnelConfig>) => {
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

  // ngrok is kept up to date on its own (see App.tsx); here it is only surfaced while it happens.
  useEffect(() => {
    if (provider !== "ngrok" || !ngrokPath) return;
    let alive = true;
    setNgrokUpdate({ status: "checking", version: null });
    void ensureNgrokUpToDate(ngrokPath).then(state => {
      if (alive) setNgrokUpdate(state);
    });
    return () => { alive = false; };
  }, [provider, ngrokPath]);

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

  // What the user picked; a config from before this existed is read from whether it has a domain.
  const domainType: "dynamic" | "static" =
    remote.tunnel.domainType ?? (normalizeDomain(remote.tunnel.domain) ? "static" : "dynamic");
  // Only an account we can query has domains to offer; without the API key there is nothing to pick.
  const ngrokVerified = !!ngrokPath && !!ngrokAccount?.hasApiKey;
  const runningHost = tunnel.running && tunnel.url ? normalizeDomain(tunnel.url) : "";
  // Only shown for ngrok, and only once the update pass could read a version.
  const ngrokVersionLabel =
    provider === "ngrok" && ngrokUpdate?.version
      ? `v${ngrokUpdate.version}${ngrokUpdate.status === "updated" ? " (recién actualizado)" : ""}`
      : "";
  const selectedNgrokDomain = ngrokDomains?.includes(normalizeDomain(remote.tunnel.domain))
    ? normalizeDomain(remote.tunnel.domain)
    : undefined;

  // With a static domain the list is the only way to choose, so fetch it as soon as it is usable.
  useEffect(() => {
    if (provider === "ngrok" && domainType === "static" && ngrokVerified && ngrokDomains === null && !loadingDomains) {
      void loadNgrokDomains();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, domainType, ngrokVerified, ngrokDomains]);

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
          <Switch checked={status.running} disabled={busy} onCheckedChange={(c) => void toggle(c)} />
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

        <div className="divide-y divide-border overflow-hidden rounded-lg border">
          <Field
            label="Proveedor"
            hint={
              binaryPath ? (
                <span className="flex flex-wrap items-center gap-1">
                  {provider === "ngrok" && ngrokUpdate?.status === "checking" ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" /> Actualizando ngrok a la última versión…
                    </>
                  ) : (
                    <>
                      Detectado
                      {ngrokVersionLabel && <span>· {ngrokVersionLabel}</span>}
                      en <code className="break-all">{binaryPath}</code>
                    </>
                  )}
                  {provider === "ngrok" && ngrokUpdate?.status === "failed" && (
                    <span className="text-destructive">No se pudo actualizar: {ngrokUpdate.message}</span>
                  )}
                </span>
              ) : installing ? (
                <span className="flex flex-wrap items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  {installing === "installing" ? "Instalando ngrok con winget…" : "Buscando el binario recién instalado…"}
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-1">
                  No está instalado. Instalalo con
                  <code className="rounded bg-muted px-1 py-0.5">{tunnelInstallCommand(provider)}</code>
                </span>
              )
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={provider}
                onValueChange={(v) => updateConfig({ remote: { ...remote, tunnel: { ...remote.tunnel, provider: v as TunnelProvider } } })}
              >
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TUNNEL_PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => void detect()}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Volver a detectar
              </Button>
              {provider === "ngrok" && !binaryPath && (
                <Button size="sm" variant="secondary" disabled={!!installing} onClick={() => void install()}>
                  {installing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                  Instalar ngrok
                </Button>
              )}
            </div>
          </Field>

          {provider === "ngrok" ? (
            <>
              <Field
                label="Tipo de dominio"
                hint={
                  domainType === "static"
                    ? "La URL es siempre la misma, con un dominio de tu cuenta."
                    : "ngrok genera una URL nueva cada vez que prendés el túnel."
                }
              >
                <Select
                  value={domainType}
                  onValueChange={v =>
                    void applyTunnelFixedFields(
                      v === "static" ? { domainType: "static" } : { domainType: "dynamic", domain: "" },
                    )
                  }
                >
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dynamic">Dinámico</SelectItem>
                    <SelectItem value="static">Estático</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {domainType === "static" && (
                <>
                  <Field label="Authtoken" hint="Es lo que ngrok necesita para conectarse.">
                    <NgrokCredential
                      configured={!!ngrokAccount?.hasAuthtoken}
                      dashboardUrl={NGROK_AUTHTOKEN_URL}
                      disabled={!ngrokPath}
                      onSave={v => saveCredential("authtoken", v)}
                    />
                  </Field>
                  <Field label="API key" hint="Distinta del authtoken: con ella la app trae los dominios de tu cuenta.">
                    <NgrokCredential
                      configured={!!ngrokAccount?.hasApiKey}
                      dashboardUrl={NGROK_API_KEYS_URL}
                      disabled={!ngrokPath}
                      onSave={v => saveCredential("api-key", v)}
                    />
                  </Field>
                </>
              )}

              <Field
                label="Dominio"
                hint={
                  domainType === "dynamic"
                    ? "Lo elige ngrok y cambia en cada arranque."
                    : !ngrokVerified
                      ? "Cargá el authtoken y la API key para poder elegirlo."
                      : ngrokDomains?.length === 0
                        ? (
                          <span className="flex flex-wrap items-center gap-1">
                            Tu cuenta no tiene dominios reservados.
                            <button type="button" className="cursor-pointer underline underline-offset-2" onClick={() => void openExternal(NGROK_DOMAINS_URL)}>
                              Reclamá el gratis en el dashboard
                            </button>
                          </span>
                        )
                        : "Es el dominio en el que se va a publicar la app."
                }
              >
                {domainType === "dynamic" ? (
                  <Input
                    disabled
                    className="max-w-xs"
                    value={runningHost}
                    placeholder="Lo genera ngrok al prender el túnel"
                  />
                ) : !ngrokVerified ? (
                  <Input
                    disabled
                    className="max-w-xs"
                    value={normalizeDomain(remote.tunnel.domain)}
                    placeholder="Autenticate para configurar"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedNgrokDomain}
                      disabled={loadingDomains || !ngrokDomains?.length}
                      onValueChange={v => void applyTunnelFixedFields({ domain: normalizeDomain(v) })}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder={loadingDomains ? "Buscando tus dominios…" : "Elegí uno de tus dominios"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(ngrokDomains ?? []).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Volver a traer mis dominios"
                      disabled={loadingDomains}
                      onClick={() => void loadNgrokDomains()}
                    >
                      {loadingDomains ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </Field>
            </>
          ) : (
            <>
              <Field
                label="Nombre del túnel"
                hint={
                  missingTunnelName
                    ? <span className="text-destructive">Sin esto la URL no queda fija.</span>
                    : "El que creaste con `cloudflared tunnel create`. Vacío usa un túnel de un solo uso."
                }
              >
                <Input
                  className="max-w-xs"
                  placeholder="ainess"
                  value={tunnelNameInput}
                  onChange={e => setTunnelNameInput(e.target.value)}
                  onBlur={applyTunnelName}
                  onKeyDown={e => e.key === "Enter" && applyTunnelName()}
                />
              </Field>
              <Field label="Hostname" hint="El subdominio de tu dominio en Cloudflare que apunta a ese túnel.">
                <Input
                  className="max-w-xs"
                  placeholder="ainess.midominio.com"
                  value={domainInput}
                  onChange={e => setDomainInput(e.target.value)}
                  onBlur={applyDomain}
                  onKeyDown={e => e.key === "Enter" && applyDomain()}
                />
              </Field>
              <Field label="Cómo se crea" hint="Se corre una sola vez, con tu cuenta de Cloudflare.">
                <code className="block whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">
                  {"cloudflared tunnel login\ncloudflared tunnel create ainess\ncloudflared tunnel route dns ainess ainess.midominio.com"}
                </code>
              </Field>
            </>
          )}
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
