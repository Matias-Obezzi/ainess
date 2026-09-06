// System diagnostics: a handful of read-only checks shared by Configuración → Diagnóstico and
// `ais doctor`. Each check is a pure function from a snapshot of the machine to
// `{ id, level, title, detail, hint? }`, so it can be unit-tested; `collectDiagnostics` is the
// only part that does I/O and it never fixes anything, it only measures.
//
// Security rule (PLAN.md): a diagnostic never prints a token, an authtoken or an API key, not
// even partially. That is why `DiagnosticsInput` carries booleans for the ngrok credentials and
// an address without a token for the remote server, and why the final report still goes through
// `maskSecrets` before anybody sees it.
import { plural } from "@/i18n";
import { isTauri } from "@/lib/tauri";
import { maskSecrets } from "@/lib/logger";
import type { Binaries, ProviderId, ProviderQuota, StorageStat, TunnelProviderId } from "@/types";

export type DiagnosticLevel = "ok" | "warn" | "error";

export interface DiagnosticResult {
  id: string;
  level: DiagnosticLevel;
  /** Already translated: the UI shows it as it is and the CLI prints it in Spanish. */
  title: string;
  detail: string;
  /** What to do when the level is not "ok". */
  hint?: string;
}

/** Translator with the same shape as `useT()`, so the UI and the CLI share every check. */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** What `ngrokAccountStatus` reports, narrowed to what a diagnostic may know: never the values. */
export interface NgrokCredentials {
  hasAuthtoken: boolean;
  hasApiKey: boolean;
  /** Why nothing could be read, already masked. */
  error?: string;
}

export interface DiagnosticsInput {
  /** Provider of every agent of every project, without duplicates and without "custom". */
  usedProviders: ProviderId[];
  binaries: Binaries;
  /** False where binaries cannot be detected at all (browser preview). */
  canDetectBinaries: boolean;
  quota: Partial<Record<ProviderId, ProviderQuota>>;
  remote: {
    enabled: boolean;
    port: number;
    running: boolean;
    /** Host or IP it listens on. Never a URL: those carry the token. */
    address?: string;
    clients: number;
    error?: string;
  };
  /** True when the configured port is free, false when it is taken, null when it could not be probed. */
  portFree: boolean | null;
  /**
   * Whether this process is the one that would be serving. The LAN server lives inside the app
   * (or inside `ais serve`), so a plain `ais doctor` cannot tell "off" from "served by the app".
   */
  canObserveRemote: boolean;
  tunnel: {
    enabled: boolean;
    provider: TunnelProviderId;
    cloudflared: boolean;
    ngrok: boolean;
    /** False when tunnel binaries cannot be looked up here. */
    canDetect: boolean;
  };
  /** Null when ngrok is not installed or its config could not be read. */
  ngrok: NgrokCredentials | null;
  /** Null where there is no filesystem. */
  logs: StorageStat | null;
  history: StorageStat | null;
  data: { projects: number; agents: number; tasks: number; runs: number };
}

/** "812 B" / "43 kB" / "1.4 MB". Locale-free on purpose: it also goes into the plain-text report. */
export function formatBytes(bytes: number): string {
  const value = Math.max(0, Math.round(bytes));
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/** The worst level in the list: one error makes the whole report an error. */
export function worstLevel(results: DiagnosticResult[]): DiagnosticLevel {
  if (results.some(r => r.level === "error")) return "error";
  if (results.some(r => r.level === "warn")) return "warn";
  return "ok";
}

function list(items: string[]): string {
  return items.join(", ");
}

/** "1 archivo" / "7 archivos", so no sentence has to say "1 archivos". */
function fileCount(n: number, t: Translate): string {
  return plural(n, t("diagnostics.files.one", { n }), t("diagnostics.files.other", { n }));
}

// ---- The checks ----------------------------------------------------------

/** Which agent CLIs are installed, and whether the agents in use are missing one. */
export function checkAgentClis(input: DiagnosticsInput, t: Translate): DiagnosticResult {
  const title = t("diagnostics.clis.title");
  if (!input.canDetectBinaries) {
    return { id: "clis", level: "warn", title, detail: t("diagnostics.clis.unavailable") };
  }

  const detected = (Object.keys(input.binaries) as ProviderId[])
    .filter(p => input.binaries[p]?.path)
    .map(p => {
      // `--version` sometimes answers a whole sentence; a trailing dot would double the one the
      // sentence around it already has.
      const version = input.binaries[p]?.version?.trim().replace(/\.+$/, "");
      return version ? `${p} ${version}` : p;
    });
  const missing = input.usedProviders.filter(p => !input.binaries[p]?.path);
  const detail = detected.length > 0
    ? t("diagnostics.clis.detected", { list: list(detected) })
    : t("diagnostics.clis.none");

  if (missing.length > 0) {
    return {
      id: "clis",
      level: "error",
      title,
      detail: `${detail} ${t("diagnostics.clis.missing", { list: list(missing) })}`,
      hint: t("diagnostics.clis.hintMissing"),
    };
  }
  if (detected.length === 0) {
    return { id: "clis", level: "warn", title, detail, hint: t("diagnostics.clis.hintNone") };
  }
  return { id: "clis", level: "ok", title, detail };
}

/** Whether the quota of every provider in use could be read, and the reason when it could not. */
export function checkQuota(input: DiagnosticsInput, t: Translate): DiagnosticResult {
  const title = t("diagnostics.quota.title");
  if (input.usedProviders.length === 0) {
    return { id: "quota", level: "ok", title, detail: t("diagnostics.quota.noProviders") };
  }

  const ok: string[] = [];
  const failed: string[] = [];
  for (const provider of input.usedProviders) {
    const quota = input.quota[provider];
    if (quota?.status === "ok") ok.push(provider);
    else failed.push(t("diagnostics.quota.entry", { provider, reason: quota?.message || t("diagnostics.quota.unknownReason") }));
  }

  const parts: string[] = [];
  if (ok.length > 0) parts.push(t("diagnostics.quota.ok", { list: list(ok) }));
  if (failed.length > 0) parts.push(t("diagnostics.quota.failed", { list: list(failed) }));

  return failed.length > 0
    ? { id: "quota", level: "warn", title, detail: parts.join(" "), hint: t("diagnostics.quota.hint") }
    : { id: "quota", level: "ok", title, detail: parts.join(" ") };
}

/** Whether the LAN server is up (and where), or whether its port is free while it is off. */
export function checkRemote(input: DiagnosticsInput, t: Translate): DiagnosticResult {
  const title = t("diagnostics.remote.title");
  const { enabled, port, running, address, clients, error } = input.remote;

  if (running) {
    return {
      id: "remote",
      level: "ok",
      title,
      detail: t("diagnostics.remote.running", { address: address ? `${address}:${port}` : String(port), clients }),
    };
  }
  if (enabled) {
    // Another process (the app, or `ais serve`) may well be serving it: that is not an error here.
    if (!input.canObserveRemote) {
      return { id: "remote", level: "warn", title, detail: t("diagnostics.remote.notThisProcess", { port }) };
    }
    return {
      id: "remote",
      level: "error",
      title,
      detail: t("diagnostics.remote.enabledNotRunning", { reason: error || t("diagnostics.remote.noReason") }),
      hint: t("diagnostics.remote.hintNotRunning"),
    };
  }
  if (input.portFree === null) {
    return { id: "remote", level: "warn", title, detail: t("diagnostics.remote.offPortUnknown", { port }) };
  }
  if (!input.portFree) {
    return {
      id: "remote",
      level: "warn",
      title,
      detail: t("diagnostics.remote.offPortBusy", { port }),
      hint: t("diagnostics.remote.hintBusy"),
    };
  }
  return { id: "remote", level: "ok", title, detail: t("diagnostics.remote.offPortFree", { port }) };
}

/** Which tunnel binaries are installed and whether ngrok has the credentials it needs. */
export function checkTunnel(input: DiagnosticsInput, t: Translate): DiagnosticResult {
  const title = t("diagnostics.tunnel.title");
  const { enabled, provider, cloudflared, ngrok, canDetect } = input.tunnel;

  if (!canDetect) {
    return { id: "tunnel", level: "warn", title, detail: t("diagnostics.tunnel.unavailable") };
  }

  const installed: string[] = [];
  if (cloudflared) installed.push("cloudflared");
  if (ngrok) installed.push("ngrok");

  const parts: string[] = [installed.length > 0 ? t("diagnostics.tunnel.installed", { list: list(installed) }) : t("diagnostics.tunnel.none")];
  const yes = t("diagnostics.tunnel.present");
  const no = t("diagnostics.tunnel.absent");
  if (ngrok) {
    parts.push(input.ngrok
      ? t("diagnostics.tunnel.ngrokCredentials", {
          authtoken: input.ngrok.hasAuthtoken ? yes : no,
          apiKey: input.ngrok.hasApiKey ? yes : no,
        })
      : t("diagnostics.tunnel.ngrokUnknown"));
  }
  const detail = parts.join(" ");

  const providerInstalled = provider === "ngrok" ? ngrok : cloudflared;
  if (enabled && !providerInstalled) {
    return {
      id: "tunnel",
      level: "error",
      title,
      detail: `${detail} ${t("diagnostics.tunnel.missingProvider", { provider })}`,
      hint: t("diagnostics.tunnel.hintInstall"),
    };
  }
  if (installed.length === 0) {
    return { id: "tunnel", level: "warn", title, detail, hint: t("diagnostics.tunnel.hintInstall") };
  }
  if (ngrok && input.ngrok && !input.ngrok.hasAuthtoken) {
    return { id: "tunnel", level: "warn", title, detail, hint: t("diagnostics.tunnel.hintAuthtoken") };
  }
  return { id: "tunnel", level: "ok", title, detail };
}

/** Whether the log folder exists, can be written and how much room it takes. */
export function checkLogs(input: DiagnosticsInput, t: Translate): DiagnosticResult {
  const title = t("diagnostics.logs.title");
  const stat = input.logs;
  if (!stat) {
    return { id: "logs", level: "warn", title, detail: t("diagnostics.logs.unavailable") };
  }
  if (!stat.exists) {
    return { id: "logs", level: "warn", title, detail: t("diagnostics.logs.missing", { path: stat.path }) };
  }
  if (!stat.writable) {
    return {
      id: "logs",
      level: "error",
      title,
      detail: t("diagnostics.logs.readOnly", { path: stat.path }),
      hint: t("diagnostics.logs.hintReadOnly"),
    };
  }
  return {
    id: "logs",
    level: "ok",
    title,
    detail: t("diagnostics.logs.ok", { path: stat.path, files: fileCount(stat.files, t), size: formatBytes(stat.bytes) }),
  };
}

/** How much the app is holding on to: projects, agents, tasks, runs and the history files. */
export function checkData(input: DiagnosticsInput, t: Translate): DiagnosticResult {
  const title = t("diagnostics.data.title");
  const { projects, agents, tasks, runs } = input.data;
  const parts = [t("diagnostics.data.summary", { projects, agents, tasks, runs })];
  parts.push(input.history
    ? t("diagnostics.data.history", { files: fileCount(input.history.files, t), size: formatBytes(input.history.bytes) })
    : t("diagnostics.data.historyUnavailable"));
  return { id: "data", level: "ok", title, detail: parts.join(" ") };
}

/** Every check, in the order the section and the CLI show them. */
export function runDiagnostics(input: DiagnosticsInput, t: Translate): DiagnosticResult[] {
  return [
    checkAgentClis(input, t),
    checkQuota(input, t),
    checkRemote(input, t),
    checkTunnel(input, t),
    checkLogs(input, t),
    checkData(input, t),
  ];
}

const LEVEL_KEY: Record<DiagnosticLevel, string> = {
  ok: "diagnostics.level.ok",
  warn: "diagnostics.level.warn",
  error: "diagnostics.level.error",
};

/** The whole report as plain text, ready for the clipboard or the terminal. Always masked. */
export function formatDiagnosticsReport(results: DiagnosticResult[], t: Translate, header: string): string {
  const lines = [header, ""];
  for (const result of results) {
    lines.push(`[${t(LEVEL_KEY[result.level])}] ${result.title}`);
    lines.push(`  ${result.detail}`);
    if (result.hint) lines.push(`  → ${result.hint}`);
    lines.push("");
  }
  return maskSecrets(lines.join("\n").trimEnd());
}

// ---- Gathering the snapshot (the only part that does I/O) ------------------

export interface CollectOptions {
  /** Ask every provider in use for its quota instead of reusing what the store already has. */
  refreshQuota?: boolean;
}

/**
 * Reads the machine into a `DiagnosticsInput`. Read-only: it starts nothing, installs nothing and
 * writes nothing but the probe file `storageStat` removes on its way out. It does load each
 * project's history and board from disk, because a fresh process (the CLI) has neither in memory.
 */
export async function collectDiagnosticsInput(opts: CollectOptions = {}): Promise<DiagnosticsInput> {
  const [{ useAppStore }, { getTransport }] = await Promise.all([import("@/store"), import("@/lib/transport")]);
  const transport = getTransport();
  const projects = useAppStore.getState().config.projects;

  const [{ loadHistory }, { loadTasks }] = await Promise.all([import("@/lib/history"), import("@/lib/task-store")]);
  await Promise.all(projects.flatMap(p => [loadHistory(p.id).catch(() => {}), loadTasks(p.id).catch(() => {})]));

  const state = useAppStore.getState();
  const config = state.config;

  // "custom" agents run a command of their own, so there is no CLI to look for.
  const usedProviders = [...new Set(config.projects.flatMap(p => p.agents ?? []).map(a => a.provider))]
    .filter(p => p !== "custom") as ProviderId[];

  const logs = await transport.storageStat("logs").catch(() => null);
  // Builds with no filesystem (browser preview, phone) answer null to every probe: say so instead
  // of reporting "nothing installed", which would be a lie.
  const hasBackend = logs !== null;
  const history = hasBackend ? await transport.storageStat("config", "history").catch(() => null) : null;

  let quota = state.quota;
  if (opts.refreshQuota && usedProviders.length > 0) {
    const { fetchQuota } = await import("@/lib/quota");
    const fetched = await Promise.all(usedProviders.map(p => fetchQuota(p).catch(() => undefined)));
    quota = { ...quota };
    usedProviders.forEach((p, i) => {
      const result = fetched[i];
      if (result) quota[p] = result;
    });
  }

  const remoteStatus: { running: boolean; ip?: string; clients: number } =
    await transport.remoteStatus().catch(() => ({ running: false, clients: 0 }));
  const portFree = remoteStatus.running ? null : await transport.portAvailable(config.remote.port).catch(() => null);

  const found = hasBackend
    ? await transport.tunnelDetect().catch(() => ({ cloudflared: null, ngrok: null }))
    : { cloudflared: null, ngrok: null };
  let ngrok: NgrokCredentials | null = null;
  if (found.ngrok) {
    try {
      const { ngrokAccountStatus } = await import("@/lib/ngrok-account");
      const status = await ngrokAccountStatus(found.ngrok);
      // Only the booleans travel: the values themselves never leave that module.
      ngrok = { hasAuthtoken: status.hasAuthtoken, hasApiKey: status.hasApiKey, error: status.error };
    } catch {
      ngrok = null;
    }
  }

  const tasks = Object.values(state.tasks).reduce((n, list) => n + list.length, 0);

  return {
    usedProviders,
    binaries: state.binaries,
    canDetectBinaries: hasBackend && Object.keys(state.binaries).length > 0,
    quota,
    remote: {
      enabled: config.remote.enabled,
      port: config.remote.port,
      running: remoteStatus.running,
      address: remoteStatus.ip,
      clients: remoteStatus.clients,
      error: state.remoteStatus.error,
    },
    portFree,
    // Only the desktop app hosts the LAN server for the whole session; the CLI does it only
    // inside `ais serve`, so a `ais doctor` process can never see it running.
    canObserveRemote: isTauri(),
    tunnel: {
      enabled: !!config.remote.tunnel?.enabled,
      provider: config.remote.tunnel?.provider ?? "cloudflared",
      cloudflared: !!found.cloudflared,
      ngrok: !!found.ngrok,
      canDetect: hasBackend,
    },
    ngrok,
    logs,
    history,
    data: {
      projects: config.projects.length,
      agents: config.projects.reduce((n, p) => n + (p.agents ?? []).length, 0),
      tasks,
      runs: Object.keys(state.runs).length,
    },
  };
}

/** Reads the machine and runs every check. */
export async function collectDiagnostics(t: Translate, opts?: CollectOptions): Promise<DiagnosticResult[]> {
  return runDiagnostics(await collectDiagnosticsInput(opts), t);
}
