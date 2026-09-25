// Configuración → Agentes: what this machine has installed — which CLI, where it is, which version
// and how much quota is left. The saved teams live in their own section (see `TeamsSection.tsx`),
// and the agents of a project are managed from its hierarchy board.
import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import { ensureAcpRuntime } from "@/lib/acp-setup";
import { AgentAvatar } from "@/components/ProviderLogo";
import { QuotaRing, useProviderModels } from "@/components/QuotaRing";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PROVIDERS } from "@/lib/providers";
import { useT } from "@/i18n/useT";
import { summarizeAgentQuota } from "@/lib/quota-summary";
import { confirm } from "@/lib/confirm";
import { probeClaudeAuth, ensureClaudeAuth, claudeLogout } from "@/lib/claude-auth";
import { ProviderId } from "@/types";
import { toast } from "@/components/ui/toast";
import { openExternal } from "@/lib/open-external";
import { installCommandText, installerFor, installProvider, type InstallPhase } from "@/lib/install-agents";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@/lib/tauri";
import { Download, Loader2, RefreshCw, ScanSearch } from "lucide-react";

/** Every provider that can be detected on this machine; "custom" is configured per agent. */
const DETECTABLE = (Object.keys(PROVIDERS) as ProviderId[]).filter(p => p !== "custom");

/** Header action: "Autodetectar". */
export function AgentsSectionActions() {
  const t = useT();
  const detectBinaries = useAppStore(state => state.detectBinaries);

  const handleAutoDetect = async () => {
    const { found } = await detectBinaries();
    if (found.length > 0) {
      toast.success(t("agents.detected", { list: found.map(p => PROVIDERS[p]?.label || p).join(", ") }));
    } else {
      toast.info(t("agents.noneDetected"));
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={() => void handleAutoDetect()}>
      <ScanSearch className="mr-1 size-4" /> {t("agents.autoDetect")}
    </Button>
  );
}

function ProviderRowSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-3 w-2/3" />
    </Card>
  );
}

/** One installed (or missing) CLI: where it is, which version and how much quota is left. */
function ProviderRow({ provider }: { provider: ProviderId }) {
  const t = useT();
  const binary = useAppStore(state => state.binaries[provider]);
  const overrides = useAppStore(state => state.config.binaryOverrides);
  const quota = useAppStore(state => state.quota[provider]);
  const updateConfig = useAppStore(state => state.updateConfig);
  const detectBinaries = useAppStore(state => state.detectBinaries);
  const refreshQuota = useAppStore(state => state.refreshQuota);
  const allModels = useProviderModels(provider);
  const [refreshing, setRefreshing] = useState(false);
  const [installing, setInstalling] = useState<InstallPhase | null>(null);

  const spec = PROVIDERS[provider];
  const summary = summarizeAgentQuota(quota, { allModels });
  const hasOverride = !!overrides?.[provider];

  const pickExecutable = async () => {
    if (!isTauri()) {
      toast.error(t("agents.desktopOnly"));
      return;
    }
    const selected = await openFileDialog({ multiple: false, filters: [{ name: t("agents.executable"), extensions: ["exe", "cmd", "bat"] }] });
    if (selected && typeof selected === "string") {
      updateConfig({ binaryOverrides: { ...overrides, [provider]: selected } });
      await detectBinaries();
    }
  };

  const clearOverride = async () => {
    const next = { ...overrides };
    delete next[provider];
    updateConfig({ binaryOverrides: next });
    await detectBinaries();
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshQuota(provider, { force: true });
    } finally {
      setRefreshing(false);
    }
  };

  const method = installerFor(provider);
  const command = method && installCommandText(method);

  /** Runs what that provider documents, then leaves the row showing the path it found. */
  const install = async () => {
    if (!method) return;
    if (method.kind === "manual") {
      void openExternal(method.url);
      return;
    }
    setInstalling("installing");
    try {
      const path = await installProvider(provider, setInstalling);
      await detectBinaries();
      toast.success(t("agents.installed", { name: spec?.label ?? provider }), { description: path });
    } catch (e) {
      toast.error(t("agents.installFailed", { name: spec?.label ?? provider }), {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setInstalling(null);
    }
  };

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <AgentAvatar provider={provider} size={26} />
          {spec?.label || provider}
        </div>
        <div className="flex items-center gap-2">
          {binary?.path
            ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">{t("agents.found")}</Badge>
            : <Badge variant="outline" className="border-destructive/40 text-destructive">{t("agents.notFound")}</Badge>}
          <span
            className="flex items-center gap-1 text-xs text-muted-foreground"
            title={[summary.detail, summary.note].filter(Boolean).join(" · ")}
          >
            <QuotaRing remaining={summary.fraction} label={summary.label} size={14} />
            {summary.label}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
        <div className="break-all">
          {binary?.path
            ? <span>{binary.path}{binary.version ? ` (${binary.version})` : ""}</span>
            : <span>{t("agents.installHint")}</span>}
        </div>
        {!binary?.path && command && (
          <div className="text-xs">
            <code className="rounded bg-muted px-1 py-0.5">{command}</code>
          </div>
        )}
        <div className="text-xs">{t("agents.quota", { detail: summary.detail })}</div>
        {hasOverride && <div className="text-xs">{t("agents.manualPath")}</div>}
      </div>

      {provider === "claude" && (
        <>
          <ManagedRuntimeStatus />
          <ClaudeIdentity />
        </>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        {/* Only what is missing gets an install button, and it says what it is about to run. */}
        {!binary?.path && method && (
          <Button
            size="sm"
            disabled={installing !== null}
            title={command ?? (method.kind === "manual" ? method.url : undefined)}
            onClick={() => void install()}
          >
            {installing ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Download className="mr-1 size-3" />}
            {installing === "installing"
              ? t("agents.installing")
              : installing === "detecting"
                ? t("agents.installDetecting")
                : method.kind === "manual"
                  ? t("agents.howToInstall")
                  : t("agents.install")}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => void pickExecutable()}>{t("agents.setPath")}</Button>
        {hasOverride && (
          <Button size="sm" variant="ghost" onClick={() => void clearOverride()}>{t("agents.clearOverride")}</Button>
        )}
        <Button size="sm" variant="ghost" disabled={refreshing} onClick={() => void refresh()}>
          {refreshing ? <Loader2 className="mr-1 size-3 animate-spin" /> : <RefreshCw className="mr-1 size-3" />}
          {t("agents.refreshQuota")}
        </Button>
      </div>
    </Card>
  );
}

/** Body: what this machine has installed, one card per detectable CLI. */
export function AgentsSection() {
  const loaded = useAppStore(state => state.loaded);

  if (!loaded) {
    return (
      <div className="flex flex-col gap-3">
        <ProviderRowSkeleton />
        <ProviderRowSkeleton />
        <ProviderRowSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {DETECTABLE.map(provider => <ProviderRow key={provider} provider={provider} />)}
    </div>
  );
}

function ManagedRuntimeStatus() {
  const t = useT();
  const [status, setStatus] = useState<import("@/types").AcpManagedStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getTransport().acpManagedStatus());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  if (loading || status === null) return null; // Only render when status is fetched and exists (not null platform)

  // The same road a run takes when it finds nothing to spawn, so retrying and cancelling behave
  // here exactly as they do behind a run (see src/lib/acp-setup.ts).
  const handleInstall = async () => {
    await ensureAcpRuntime();
    await fetchStatus();
  };

  const isReady = status.adapterReady && status.runtimeReady;

  return (
    <div className="mt-2 flex flex-col gap-1 rounded border border-border p-3 text-sm">
      <div className="font-medium">{t("agents.managedRuntime.title")}</div>
      {isReady ? (
        <div className="flex flex-col gap-0.5 text-muted-foreground text-xs break-all">
          <div>{t("agents.managedRuntime.bunVersion", { version: status.bunVersion || "?" })}</div>
          <div>{t("agents.managedRuntime.adapterVersion", { version: status.adapterVersion || "?" })}</div>
          <div>{t("agents.managedRuntime.folder", { folder: status.installDir })}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">{t("agents.managedRuntime.notInstalled")}</div>
          <Button variant="outline" size="sm" className="w-fit" onClick={() => void handleInstall()}>
            <Download className="mr-1 size-3" /> {t("agents.managedRuntime.installNow")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Who Claude Code is logged in as, sourced from `claudeAuth.status` and probed on demand. */
export function ClaudeIdentity() {
  const t = useT();
  const status = useAppStore(state => state.claudeAuth.status);
  const [checking, setChecking] = useState(false);

  const probe = useCallback(async () => {
    setChecking(true);
    try {
      await probeClaudeAuth();
    } finally {
      setChecking(false);
    }
  }, []);

  // Only when nothing is known yet: a re-render after that first probe must not fire another one.
  useEffect(() => {
    if (status === null) void probe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    await ensureClaudeAuth();
    await probe();
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: t("agents.claudeIdentity.confirmTitle"),
      description: t("agents.claudeIdentity.confirmDescription"),
      destructive: true,
      confirmText: t("agents.claudeIdentity.logout"),
    });
    if (!ok) return;
    await claudeLogout();
    await probe();
  };

  const checkButton = (
    <Button variant="outline" size="sm" className="w-fit" disabled={checking} onClick={() => void probe()}>
      {checking ? <Loader2 className="mr-1 size-3 animate-spin" /> : <RefreshCw className="mr-1 size-3" />}
      {t("agents.claudeIdentity.check")}
    </Button>
  );

  return (
    <div className="mt-2 flex flex-col gap-1 rounded border border-border p-3 text-sm">
      <div className="font-medium">{t("agents.claudeIdentity.title")}</div>

      {status === null && checking && (
        <div className="text-xs text-muted-foreground">{t("agents.claudeIdentity.checking")}</div>
      )}

      {status === null && !checking && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">{t("agents.claudeIdentity.unknown")}</div>
          <div className="flex flex-wrap gap-2">
            {checkButton}
            <Button variant="outline" size="sm" className="w-fit" onClick={() => void handleLogin()}>
              {t("agents.claudeIdentity.login")}
            </Button>
          </div>
        </div>
      )}

      {status !== null && status.kind === "none" && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">{t("agents.claudeIdentity.loggedOut")}</div>
          <div className="flex flex-wrap gap-2">
            {checkButton}
            <Button variant="outline" size="sm" className="w-fit" onClick={() => void handleLogin()}>
              {t("agents.claudeIdentity.login")}
            </Button>
          </div>
        </div>
      )}

      {status !== null && status.kind !== "none" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5 text-xs">
            <div>{status.label}</div>
            <div className="flex flex-col gap-0.5 text-muted-foreground break-all">
              {status.account?.email && <div>{t("agents.claudeIdentity.email", { email: status.account.email })}</div>}
              {status.account?.organization && (
                <div>{t("agents.claudeIdentity.organization", { organization: status.account.organization })}</div>
              )}
              {status.account?.plan && <div>{t("agents.claudeIdentity.plan", { plan: status.account.plan })}</div>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {checkButton}
            <Button variant="destructive" size="sm" className="w-fit" onClick={() => void handleLogout()}>
              {t("agents.claudeIdentity.logout")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
