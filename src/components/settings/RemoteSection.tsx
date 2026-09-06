import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";

/**
 * QR of one URL. It has to be a component and not an effect on a ref of this section: the canvas
 * only enters the DOM once the initial load finishes, so an effect keyed on the URL never found it
 * on a reopen (the URL was already known) and the QR stayed blank.
 */
function QrCanvas({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, value, { width: 220, margin: 1, color: { dark: "#000000", light: "#ffffff" } }).catch(() => {});
  }, [value]);

  return <canvas ref={ref} />;
}

/** One setting: its name, the control and the line that explains it, like the other sections. */
function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold">{label}</label>
      {children}
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
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
  const t = useT();
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
          placeholder={t("remote.ngrok.pastePlaceholder")}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !saving) void save();
            else if (e.key === "Escape") close();
          }}
        />
        <Button size="sm" disabled={saving || !value.trim()} onClick={() => void save()}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {t("common.save")}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={close}>{t("common.cancel")}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", configured ? "bg-emerald-500" : "bg-muted-foreground/40")} />
      <span className="text-sm">{configured ? t("remote.ngrok.configured") : t("remote.ngrok.notConfigured")}</span>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setEditing(true)}>
        {configured ? t("remote.ngrok.change") : t("remote.ngrok.configure")}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label={t("remote.ngrok.openDashboard")}
        title={t("remote.ngrok.openDashboard")}
        onClick={() => void openExternal(dashboardUrl)}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Configuración > Remoto: LAN server (URL + QR) and the optional public tunnel. */
export function RemoteSection() {
  const t = useT();
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

  const toggle = async (enabled: boolean) => {
    try {
      await toggleRemote(enabled);
      if (enabled) toast.success(t("titlebar.remoteOn"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const install = async () => {
    setInstalling("installing");
    try {
      const version = await installNgrok(setInstalling);
      await detect();
      toast.success(version ? t("remote.ngrok.installedVersion", { version }) : t("remote.ngrok.installed"));
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
        toast.success(t("remote.tunnelOn"));
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
      toast.success(kind === "authtoken" ? t("remote.ngrok.authtokenSaved") : t("remote.ngrok.apiKeySaved"));
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
      ? `v${ngrokUpdate.version}${ngrokUpdate.status === "updated" ? ` (${t("remote.ngrok.justUpdated")})` : ""}`
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
    if (!n || n < 1024 || n > 65535) { toast.error(t("remote.invalidPort")); return; }
    updateConfig({ remote: { ...remote, port: n } });
    if (status.running) void stopRemote().then(() => startRemote()).catch(e => toast.error(String(e)));
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success(t("remote.urlCopied")); }
    catch { toast.error(t("about.copyFailed")); }
  };

  const tunnelDisabledReason = !status.running
    ? t("remote.tunnelNeedsLan")
    : !binaryPath
      ? t("remote.tunnelMissingBinary", { binary: tunnelBinary(provider), command: tunnelInstallCommand(provider) })
      : null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("remote.lanTitle")}</CardTitle>
          <CardDescription>{t("remote.lanDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
      {initialLoading ? (
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-9 rounded-full" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Switch checked={status.running} disabled={busy} onCheckedChange={(c) => void toggle(c)} />
          <div className="flex flex-col">
            <label className="text-sm font-semibold">{t("settings.option.remote.lan")}</label>
            <span className="text-sm text-muted-foreground">
              {status.running
                ? t("remote.listeningOn", { host: status.ip ?? "", port: remote.port })
                : status.error
                  ? t("remote.error", { error: status.error })
                  : t("remote.off")}
            </span>
          </div>
          {status.running && (
            <Badge variant="secondary">
              {plural(status.clients, t("remote.clients.one", { n: status.clients }), t("remote.clients.other", { n: status.clients }))}
            </Badge>
          )}
        </div>
      )}

      <Field label={t("settings.option.remote.port")} hint={t("remote.portHint")}>
        <div className="flex items-center gap-2">
          <Input className="w-28" value={port} onChange={e => setPort(e.target.value)} onBlur={applyPort} onKeyDown={e => e.key === "Enter" && applyPort()} />
          <Button variant="outline" size="sm" onClick={() => void regenerateRemoteToken().then(() => toast.success(t("remote.tokenRegenerated")))}>
            <RefreshCw className="mr-1 h-4 w-4" /> {t("settings.option.remote.token")}
          </Button>
        </div>
      </Field>

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
            <QrCanvas value={status.url} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium"><Smartphone className="h-4 w-4" /> {t("remote.scanOrOpen")}</div>
            <code className="break-all rounded-md bg-muted p-2 text-xs">{status.url}</code>
            <Button variant="secondary" size="sm" className="self-start" onClick={() => void copy(status.url!)}>
              <Copy className="mr-1 h-4 w-4" /> {t("remote.copyUrl")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("remote.firewallHint", { port: remote.port })}</p>
          </div>
        </div>
      )}

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4" /> {t("remote.tunnelTitle")}</CardTitle>
          <CardDescription>{t("remote.tunnelDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <Field
            label={t("remote.provider")}
            hint={
              binaryPath ? (
                <span className="flex flex-wrap items-center gap-1">
                  {provider === "ngrok" && ngrokUpdate?.status === "checking" ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" /> {t("remote.ngrok.updating")}
                    </>
                  ) : (
                    <>
                      {t("agents.found")}
                      {ngrokVersionLabel && <span>· {ngrokVersionLabel}</span>}
                      {t("remote.at")} <code className="break-all">{binaryPath}</code>
                    </>
                  )}
                  {provider === "ngrok" && ngrokUpdate?.status === "failed" && (
                    <span className="text-destructive">{t("remote.ngrok.updateFailed", { error: ngrokUpdate.message ?? "" })}</span>
                  )}
                </span>
              ) : installing ? (
                <span className="flex flex-wrap items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  {installing === "installing" ? t("remote.ngrok.installingWinget") : t("remote.ngrok.lookingForBinary")}
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-1">
                  {t("remote.notInstalled")}
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
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> {t("settings.option.remote.detectAgain")}
              </Button>
              {provider === "ngrok" && !binaryPath && (
                <Button size="sm" variant="secondary" disabled={!!installing} onClick={() => void install()}>
                  {installing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                  {t("settings.option.remote.installNgrok")}
                </Button>
              )}
            </div>
          </Field>

          {provider === "ngrok" ? (
            <>
              <Field
                label={t("settings.option.remote.domainType")}
                hint={domainType === "static" ? t("remote.staticHint") : t("remote.dynamicHint")}
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
                    <SelectItem value="dynamic">{t("remote.dynamic")}</SelectItem>
                    <SelectItem value="static">{t("remote.static")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {domainType === "static" && (
                <>
                  <Field label="Authtoken" hint={t("remote.ngrok.authtokenHint")}>
                    <NgrokCredential
                      configured={!!ngrokAccount?.hasAuthtoken}
                      dashboardUrl={NGROK_AUTHTOKEN_URL}
                      disabled={!ngrokPath}
                      onSave={v => saveCredential("authtoken", v)}
                    />
                  </Field>
                  <Field label="API key" hint={t("remote.ngrok.apiKeyHint")}>
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
                label={t("settings.option.remote.domain")}
                hint={
                  domainType === "dynamic"
                    ? t("remote.domainDynamicHint")
                    : !ngrokVerified
                      ? t("remote.domainNeedsCredentials")
                      : ngrokDomains?.length === 0
                        ? (
                          <span className="flex flex-wrap items-center gap-1">
                            {t("remote.noReservedDomains")}
                            <button type="button" className="cursor-pointer underline underline-offset-2" onClick={() => void openExternal(NGROK_DOMAINS_URL)}>
                              {t("remote.claimFreeDomain")}
                            </button>
                          </span>
                        )
                        : t("remote.domainHint")
                }
              >
                {domainType === "dynamic" ? (
                  <Input
                    disabled
                    className="max-w-xs"
                    value={runningHost}
                    placeholder={t("remote.domainGenerated")}
                  />
                ) : !ngrokVerified ? (
                  <Input
                    disabled
                    className="max-w-xs"
                    value={normalizeDomain(remote.tunnel.domain)}
                    placeholder={t("remote.domainNeedsAuth")}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedNgrokDomain}
                      disabled={loadingDomains || !ngrokDomains?.length}
                      onValueChange={v => void applyTunnelFixedFields({ domain: normalizeDomain(v) })}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder={loadingDomains ? t("remote.loadingDomains") : t("remote.pickDomain")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(ngrokDomains ?? []).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t("remote.reloadDomains")}
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
                label={t("remote.tunnelName")}
                hint={
                  missingTunnelName
                    ? <span className="text-destructive">{t("remote.tunnelNameRequired")}</span>
                    : t("remote.tunnelNameHint")
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
              <Field label={t("remote.hostname")} hint={t("remote.hostnameHint")}>
                <Input
                  className="max-w-xs"
                  placeholder="ainess.midominio.com"
                  value={domainInput}
                  onChange={e => setDomainInput(e.target.value)}
                  onBlur={applyDomain}
                  onKeyDown={e => e.key === "Enter" && applyDomain()}
                />
              </Field>
              <Field label={t("remote.howToCreate")} hint={t("remote.howToCreateHint")}>
                <code className="block whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">
                  {"cloudflared tunnel login\ncloudflared tunnel create ainess\ncloudflared tunnel route dns ainess ainess.midominio.com"}
                </code>
              </Field>
            </>
          )}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex w-fit items-center gap-2">
              <Switch
                checked={remote.tunnel.enabled && tunnel.running}
                disabled={tunnelBusy || !!tunnelDisabledReason}
                onCheckedChange={(c) => void toggleTunnel(c)}
              />
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {t("settings.option.remote.tunnel")}
                  {isFixed && <Badge variant="secondary">{t("remote.fixedUrl")}</Badge>}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {tunnelBusy ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      {remote.tunnel.enabled ? t("remote.creatingTunnel") : t("remote.closingTunnel")}
                    </>
                  ) : tunnel.running
                    ? t("remote.tunnelActiveWith", { provider: tunnel.provider ?? provider })
                    : tunnel.error ? tunnel.error : t("remote.off")}
                </span>
                {isFixed && previewUrl && !tunnel.running && (
                  <span className="text-xs text-muted-foreground">
                    {t("remote.urlWillBe")} <code className="rounded bg-muted px-1">{previewUrl}</code>
                  </span>
                )}
              </div>
            </div>
          </TooltipTrigger>
          {tunnelDisabledReason && <TooltipContent>{tunnelDisabledReason}</TooltipContent>}
        </Tooltip>

        {!tunnel.running && tunnel.error && remote.tunnel.enabled && (
          <Button variant="outline" size="sm" className="self-start" disabled={tunnelBusy || !!tunnelDisabledReason} onClick={() => void toggleTunnel(true)}>
            <RefreshCw className="mr-1 h-4 w-4" /> {t("common.retry")}
          </Button>
        )}

        {publicUrl && (
          <>
            <div className="flex flex-col items-start gap-4 md:flex-row">
              <div className="self-start rounded-lg bg-white p-2">
                <QrCanvas value={publicUrl} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="text-sm font-medium">{t("remote.publicUrl")}</div>
                <code className="break-all rounded-md bg-muted p-2 text-xs">{publicUrl}</code>
                <Button variant="secondary" size="sm" className="self-start" onClick={() => void copy(publicUrl)}>
                  <Copy className="mr-1 h-4 w-4" /> {t("remote.copyUrl")}
                </Button>
              </div>
            </div>
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              {t("remote.shareWarning")}
            </p>
          </>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
