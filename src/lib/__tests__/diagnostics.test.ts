import { describe, it, expect } from "vitest";
import {
  checkAgentClis,
  checkData,
  checkLogs,
  checkQuota,
  checkRemote,
  checkTunnel,
  formatBytes,
  formatDiagnosticsReport,
  runDiagnostics,
  worstLevel,
  type DiagnosticsInput,
} from "@/lib/diagnostics";
import { es, translate } from "@/i18n";
import type { ProviderQuota, StorageStat } from "@/types";

/** Marker translator: the assertions talk about keys, not about Spanish wording. */
const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key} ${JSON.stringify(vars)}` : key;

/** Real Spanish, the way `ais doctor` renders it. */
const spanish = (key: string, vars?: Record<string, string | number>) => translate(es, es, key, vars);

const okQuota = (provider: string): ProviderQuota => ({
  provider: provider as ProviderQuota["provider"],
  status: "ok",
  fetchedAt: 0,
  items: [],
});

const dir = (over: Partial<StorageStat> = {}): StorageStat => ({
  path: "C:\\logs",
  exists: true,
  writable: true,
  files: 3,
  bytes: 2048,
  ...over,
});

function input(over: Partial<DiagnosticsInput> = {}): DiagnosticsInput {
  return {
    usedProviders: ["claude"],
    binaries: { claude: { path: "C:\\claude.exe", version: "2.1.0" } },
    canDetectBinaries: true,
    quota: { claude: okQuota("claude") },
    remote: { enabled: false, port: 4710, running: false, clients: 0 },
    portFree: true,
    canObserveRemote: true,
    tunnel: { enabled: false, provider: "cloudflared", cloudflared: true, ngrok: false, canDetect: true },
    ngrok: null,
    logs: dir(),
    history: dir({ path: "C:\\history", files: 2, bytes: 5 * 1024 * 1024 }),
    data: { projects: 1, agents: 2, tasks: 3, runs: 4 },
    ...over,
  };
}

describe("formatBytes", () => {
  it("uses the unit the size deserves", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(812)).toBe("812 B");
    expect(formatBytes(2048)).toBe("2 kB");
    expect(formatBytes(1024 * 1024 * 1.5)).toBe("1.5 MB");
  });

  it("never reports a negative size", () => {
    expect(formatBytes(-10)).toBe("0 B");
  });
});

describe("checkAgentClis", () => {
  it("is ok when every provider in use is installed", () => {
    const result = checkAgentClis(input(), t);
    expect(result.level).toBe("ok");
    expect(result.detail).toContain("claude 2.1.0");
  });

  it("drops the trailing dot a `--version` sentence can carry", () => {
    const result = checkAgentClis(input({
      binaries: { claude: { path: "C:\\claude.exe", version: "GitHub Copilot CLI 1.0.83." } },
    }), spanish);
    expect(result.detail).toContain("claude GitHub Copilot CLI 1.0.83.");
    expect(result.detail).not.toContain("1.0.83..");
  });

  it("is an error, not a warning, when an agent's CLI is missing", () => {
    const result = checkAgentClis(input({ usedProviders: ["claude", "copilot"] }), t);
    expect(result.level).toBe("error");
    expect(result.detail).toContain("diagnostics.clis.missing");
    expect(result.hint).toBe("diagnostics.clis.hintMissing");
  });

  it("ignores providers that are only detected but not used", () => {
    const result = checkAgentClis(input({
      binaries: { claude: { path: "C:\\claude.exe" }, gemini: { path: "C:\\gemini.exe" } },
    }), t);
    expect(result.level).toBe("ok");
  });

  it("warns when nothing is installed at all", () => {
    const result = checkAgentClis(input({ usedProviders: [], binaries: { claude: null } }), t);
    expect(result.level).toBe("warn");
    expect(result.detail).toBe("diagnostics.clis.none");
  });

  it("warns with a reason where binaries cannot be detected", () => {
    const result = checkAgentClis(input({ canDetectBinaries: false }), t);
    expect(result.level).toBe("warn");
    expect(result.detail).toBe("diagnostics.clis.unavailable");
  });
});

describe("checkQuota", () => {
  it("is ok when every provider in use answered", () => {
    expect(checkQuota(input(), t).level).toBe("ok");
  });

  it("warns and says why when one did not", () => {
    const result = checkQuota(input({
      usedProviders: ["claude", "copilot"],
      quota: { claude: okQuota("claude"), copilot: { provider: "copilot", status: "error", message: "sin sesión", fetchedAt: 0, items: [] } },
    }), t);
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("sin sesión");
    expect(result.hint).toBe("diagnostics.quota.hint");
  });

  it("is ok, not a warning, when there are no agents at all", () => {
    const result = checkQuota(input({ usedProviders: [] }), t);
    expect(result.level).toBe("ok");
    expect(result.detail).toBe("diagnostics.quota.noProviders");
  });
});

describe("checkRemote", () => {
  it("reports the address without ever building a URL with the token", () => {
    const result = checkRemote(input({
      remote: { enabled: true, port: 4710, running: true, address: "192.168.0.5", clients: 2 },
    }), t);
    expect(result.level).toBe("ok");
    expect(result.detail).toContain("192.168.0.5:4710");
    expect(result.detail).not.toContain("token");
  });

  it("is an error when it is meant to be on but nothing is listening", () => {
    const result = checkRemote(input({
      remote: { enabled: true, port: 4710, running: false, clients: 0, error: "puerto ocupado" },
    }), t);
    expect(result.level).toBe("error");
    expect(result.detail).toContain("puerto ocupado");
  });

  it("only warns where this process is not the one that would be serving", () => {
    const result = checkRemote(input({
      canObserveRemote: false,
      remote: { enabled: true, port: 4710, running: false, clients: 0, error: "puerto ocupado" },
    }), t);
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("diagnostics.remote.notThisProcess");
  });

  it("checks the port while it is off", () => {
    expect(checkRemote(input({ portFree: true }), t).level).toBe("ok");
    const busy = checkRemote(input({ portFree: false }), t);
    expect(busy.level).toBe("warn");
    expect(busy.hint).toBe("diagnostics.remote.hintBusy");
  });

  it("warns instead of failing when the port cannot be probed here", () => {
    const result = checkRemote(input({ portFree: null }), t);
    expect(result.level).toBe("warn");
    expect(result.detail).toContain("diagnostics.remote.offPortUnknown");
  });
});

describe("checkTunnel", () => {
  it("is ok with one binary installed and the tunnel off", () => {
    expect(checkTunnel(input(), t).level).toBe("ok");
  });

  it("warns when nothing is installed", () => {
    const result = checkTunnel(input({
      tunnel: { enabled: false, provider: "cloudflared", cloudflared: false, ngrok: false, canDetect: true },
    }), t);
    expect(result.level).toBe("warn");
    expect(result.detail).toBe("diagnostics.tunnel.none");
  });

  it("is an error when the tunnel is on with a provider that is not installed", () => {
    const result = checkTunnel(input({
      tunnel: { enabled: true, provider: "ngrok", cloudflared: true, ngrok: false, canDetect: true },
    }), t);
    expect(result.level).toBe("error");
    expect(result.hint).toBe("diagnostics.tunnel.hintInstall");
  });

  it("says whether ngrok has credentials without ever showing them", () => {
    const result = checkTunnel(input({
      tunnel: { enabled: false, provider: "ngrok", cloudflared: false, ngrok: true, canDetect: true },
      ngrok: { hasAuthtoken: true, hasApiKey: false },
    }), t);
    expect(result.level).toBe("ok");
    expect(result.detail).toContain("diagnostics.tunnel.ngrokCredentials");
    expect(result.detail).toContain("diagnostics.tunnel.present");
    expect(result.detail).toContain("diagnostics.tunnel.absent");
  });

  it("warns when ngrok is installed without an authtoken", () => {
    const result = checkTunnel(input({
      tunnel: { enabled: false, provider: "ngrok", cloudflared: false, ngrok: true, canDetect: true },
      ngrok: { hasAuthtoken: false, hasApiKey: false },
    }), t);
    expect(result.level).toBe("warn");
    expect(result.hint).toBe("diagnostics.tunnel.hintAuthtoken");
  });

  it("warns with a reason where tunnel binaries cannot be looked up", () => {
    const result = checkTunnel(input({
      tunnel: { enabled: false, provider: "cloudflared", cloudflared: false, ngrok: false, canDetect: false },
    }), t);
    expect(result.level).toBe("warn");
    expect(result.detail).toBe("diagnostics.tunnel.unavailable");
  });
});

describe("checkLogs", () => {
  it("reports the size when the folder is there and writable", () => {
    const result = checkLogs(input(), t);
    expect(result.level).toBe("ok");
    expect(result.detail).toContain("2 kB");
  });

  it("counts the files without ever writing \"1 archivos\"", () => {
    expect(checkLogs(input({ logs: dir({ files: 1 }) }), spanish).detail).toContain("1 archivo,");
    expect(checkLogs(input({ logs: dir({ files: 4 }) }), spanish).detail).toContain("4 archivos");
  });

  it("is an error when the folder cannot be written", () => {
    const result = checkLogs(input({ logs: dir({ writable: false }) }), t);
    expect(result.level).toBe("error");
    expect(result.hint).toBe("diagnostics.logs.hintReadOnly");
  });

  it("only warns when the folder does not exist yet", () => {
    expect(checkLogs(input({ logs: dir({ exists: false, writable: false }) }), t).level).toBe("warn");
  });

  it("warns where there is no filesystem", () => {
    const result = checkLogs(input({ logs: null }), t);
    expect(result.level).toBe("warn");
    expect(result.detail).toBe("diagnostics.logs.unavailable");
  });
});

describe("checkData", () => {
  it("counts what is stored and how big the history is", () => {
    const result = checkData(input(), t);
    expect(result.level).toBe("ok");
    expect(result.detail).toContain("diagnostics.data.summary");
    expect(result.detail).toContain('"tasks":3');
    expect(result.detail).toContain("5.0 MB");
  });

  it("says so when the history cannot be measured", () => {
    expect(checkData(input({ history: null }), t).detail).toContain("diagnostics.data.historyUnavailable");
  });
});

describe("runDiagnostics", () => {
  it("returns one result per check, always in the same order", () => {
    expect(runDiagnostics(input(), t).map(r => r.id)).toEqual(["clis", "quota", "remote", "tunnel", "logs", "data"]);
  });

  it("translates every key it uses into Spanish", () => {
    for (const result of runDiagnostics(input({ usedProviders: ["claude", "copilot"], portFree: false }), spanish)) {
      expect(result.detail, result.id).not.toMatch(/^diagnostics\./);
      expect(result.title, result.id).not.toMatch(/^diagnostics\./);
    }
  });
});

describe("worstLevel", () => {
  it("lets one error outrank everything else", () => {
    expect(worstLevel(runDiagnostics(input(), t))).toBe("ok");
    expect(worstLevel(runDiagnostics(input({ portFree: false }), t))).toBe("warn");
    expect(worstLevel(runDiagnostics(input({ logs: dir({ writable: false }) }), t))).toBe("error");
  });
});

describe("formatDiagnosticsReport", () => {
  it("masks anything that looks like a secret, whatever a check said", () => {
    const report = formatDiagnosticsReport(
      [{ id: "x", level: "warn", title: "T", detail: "authtoken: 2abcDEF token=hunter2", hint: "Bearer zzz" }],
      t,
      "header",
    );
    expect(report).not.toContain("hunter2");
    expect(report).not.toContain("2abcDEF");
    expect(report).not.toContain("zzz");
    expect(report).toContain("***");
  });

  it("keeps the header, one line per check and the hint", () => {
    const report = formatDiagnosticsReport(runDiagnostics(input(), spanish), spanish, "cabecera");
    expect(report.split("\n")[0]).toBe("cabecera");
    expect(report).toContain(spanish("diagnostics.clis.title"));
    expect(report).toContain(`[${spanish("diagnostics.level.ok")}]`);
  });
});
