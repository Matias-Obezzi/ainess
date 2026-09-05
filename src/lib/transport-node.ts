import { Transport } from "./transport";
import { nodeRemote } from "./remote-node";
import type { AppConfig, BinaryInfo, RunExitEvent, RunOutputEvent, SpawnOptions } from "@/types";
import { spawn, spawnSync, ChildProcess } from "node:child_process";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const activeRuns = new Map<string, ChildProcess>();
const killedRuns = new Set<string>();

const outputHandlers = new Set<(e: RunOutputEvent) => void>();
const exitHandlers = new Set<(e: RunExitEvent) => void>();

function getConfigPath() {
  const appData = process.env.APPDATA ?? os.homedir();
  return path.join(appData, "com.matias.ais", "config.json");
}

function getVersion(binPath: string): string | null {
  try {
    const res = spawnSync(binPath, ["--version"], { timeout: 5000, encoding: "utf8" });
    if (res.status === 0 && res.stdout) {
      const line = res.stdout.split("\n")[0].trim();
      return line || null;
    }
  } catch (e) {}
  return null;
}

function parseSemver(s: string): number[] | null {
  const parts = s.split('.');
  const nums: number[] = [];
  for (const p of parts) {
    const m = p.match(/^\d+/);
    if (m) nums.push(parseInt(m[0], 10));
    else break;
  }
  return nums.length > 0 ? nums : null;
}

function compareSemver(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function which(name: string): string | null {
  const isWin = process.platform === "win32";
  const exts = isWin ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";") : [""];
  const pathDirs = (process.env.PATH || "").split(isWin ? ";" : ":");
  
  for (const dir of pathDirs) {
    for (const ext of exts) {
      const full = path.join(dir, name + ext);
      if (fs.existsSync(full)) {
        try {
          fs.accessSync(full, fs.constants.X_OK);
          return full;
        } catch (e) {}
      }
    }
  }
  return null;
}

/** Folders where the Claude desktop app keeps its bundled Claude Code (`<dir>/<version>/claude.exe`). */
export function claudeCandidateDirs(): string[] {
  const roots = [
    process.env.APPDATA,
    path.join(os.homedir(), "AppData", "Roaming"),
    process.env.LOCALAPPDATA,
    path.join(os.homedir(), "AppData", "Local"),
  ].filter((r): r is string => !!r);
  const dirs = roots.map(r => path.join(r, "Claude", "claude-code"));
  // The desktop app from the Microsoft Store is an MSIX package: Windows virtualizes its
  // AppData\Roaming, so the real files live under Packages\Claude_*\LocalCache\Roaming.
  const packages = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Packages");
  try {
    for (const entry of fs.readdirSync(packages)) {
      if (/^Claude_/i.test(entry)) dirs.push(path.join(packages, entry, "LocalCache", "Roaming", "Claude", "claude-code"));
    }
  } catch { /* no Packages folder */ }
  return [...new Set(dirs)];
}

/**
 * winget installs portable CLIs under `%LOCALAPPDATA%\Microsoft\WinGet\Packages\<id>\` (or a
 * subfolder) and puts that folder on the *registry* PATH. A process started before the install
 * keeps its old PATH, so scan those folders directly instead of asking the user to restart.
 */
export function wingetCandidates(name: string): string[] {
  if (process.platform !== "win32") return [];
  const root = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Microsoft", "WinGet");
  const exe = `${name}.exe`;
  const out: string[] = [path.join(root, "Links", exe)];
  const packages = path.join(root, "Packages");
  let pkgs: string[] = [];
  try { pkgs = fs.readdirSync(packages); } catch { return out; }
  for (const pkg of pkgs) {
    const dir = path.join(packages, pkg);
    out.push(path.join(dir, exe));
    try {
      for (const sub of fs.readdirSync(dir, { withFileTypes: true })) {
        if (sub.isDirectory()) out.push(path.join(dir, sub.name, exe));
      }
    } catch { /* unreadable package */ }
  }
  return out;
}

function findWinget(name: string): BinaryInfo | null {
  for (const candidate of wingetCandidates(name)) {
    if (fs.existsSync(candidate)) return { path: candidate, version: getVersion(candidate) };
  }
  return null;
}

function detectClaude(): BinaryInfo | null {
  let p = which("claude");
  if (p) return { path: p, version: getVersion(p) };

  let bestPath: string | null = null;
  let bestVersion: number[] = [0,0,0];

  for (const claudeCodeDir of claudeCandidateDirs()) {
    if (!fs.existsSync(claudeCodeDir)) continue;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(claudeCodeDir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const parsed = parseSemver(entry.name);
        if (parsed) {
          const exePath = path.join(claudeCodeDir, entry.name, "claude.exe");
          if (fs.existsSync(exePath) && compareSemver(parsed, bestVersion) > 0) {
            bestVersion = parsed;
            bestPath = exePath;
          }
        }
      }
    }
  }
  if (bestPath) return { path: bestPath, version: getVersion(bestPath) };

  const localBin = path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
  if (fs.existsSync(localBin)) {
    return { path: localBin, version: getVersion(localBin) };
  }
  return findWinget("claude");
}

function detectAgy(): BinaryInfo | null {
  let p = which("agy");
  if (p) return { path: p, version: getVersion(p) };

  const agyBin = path.join(os.homedir(), ".gemini", "bin", process.platform === "win32" ? "agy.exe" : "agy");
  if (fs.existsSync(agyBin)) {
    return { path: agyBin, version: getVersion(agyBin) };
  }
  return findWinget("agy");
}

function detectGeneric(name: string): BinaryInfo | null {
  const p = which(name);
  if (p) return { path: p, version: getVersion(p) };
  return findWinget(name);
}

/**
 * Node refuses to spawn `.cmd`/`.bat` files without a shell, and going through cmd.exe
 * mangles prompts with quotes or newlines. npm shims are all shaped the same way
 * (`"%_prog%" "%dp0%\node_modules\<pkg>\bin\x.js" %*`), so resolve the script and run it
 * with the current Node binary instead.
 */
function resolveProgram(program: string, args: string[]): { program: string; args: string[] } {
  if (!/\.(cmd|bat)$/i.test(program)) return { program, args };
  try {
    const text = fs.readFileSync(program, "utf-8");
    const m = text.match(/"%dp0%\\([^"]+\.(?:m?js|cjs))"/i);
    if (m) {
      const script = path.join(path.dirname(program), m[1]);
      if (fs.existsSync(script)) return { program: process.execPath, args: [script, ...args] };
    }
  } catch { /* fall through */ }
  // Unknown shim: let cmd.exe run it (arguments with newlines may break here).
  return { program: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", program, ...args] };
}

function killTree(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/PID", child.pid.toString(), "/T", "/F"], { windowsHide: true });
  }
  try { child.kill(process.platform === "win32" ? "SIGKILL" : "SIGTERM"); } catch { /* already gone */ }
}

/** Kill every active run synchronously (used on process exit). */
export function killAllSync(): void {
  for (const [runId, child] of activeRuns) {
    killedRuns.add(runId);
    killTree(child);
  }
  activeRuns.clear();
}

export const nodeTransport: Transport = {
  spawnRun: async (opts: SpawnOptions) => {
    const env = { ...process.env, ...(opts.env || {}), NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" };
    const resolved = resolveProgram(opts.program, opts.args);
    const child = spawn(resolved.program, resolved.args, {
      cwd: opts.cwd || process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    activeRuns.set(opts.runId, child);

    let exited = false;
    const emitExit = (code: number | null) => {
      if (exited) return;
      exited = true;
      activeRuns.delete(opts.runId);
      const killed = killedRuns.has(opts.runId);
      killedRuns.delete(opts.runId);
      const ev: RunExitEvent = { runId: opts.runId, code, killed };
      for (const h of exitHandlers) h(ev);
    };
    // Spawn failures (ENOENT, EACCES…) arrive here; without this the run would hang forever.
    child.on("error", (err) => {
      for (const h of outputHandlers) h({ runId: opts.runId, stream: "stderr", line: `No se pudo iniciar \`${opts.program}\`: ${err.message}` });
      emitExit(null);
    });
    if (child.stdin) child.stdin.on("error", () => { /* process closed stdin early */ });

    if (opts.stdinText && child.stdin) {
      child.stdin.write(opts.stdinText);
      child.stdin.end();
    }

    if (child.stdout) {
      const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
      rl.on("line", (line) => {
        const ev: RunOutputEvent = { runId: opts.runId, stream: "stdout", line };
        for (const h of outputHandlers) h(ev);
      });
    }

    if (child.stderr) {
      const rl = readline.createInterface({ input: child.stderr, crlfDelay: Infinity });
      rl.on("line", (line) => {
        const ev: RunOutputEvent = { runId: opts.runId, stream: "stderr", line };
        for (const h of outputHandlers) h(ev);
      });
    }

    child.on("close", (code) => emitExit(code));
  },

  killRun: async (runId: string) => {
    const child = activeRuns.get(runId);
    if (!child) return false;
    killedRuns.add(runId);
    killTree(child);
    return true;
  },

  onRunOutput: async (h) => {
    outputHandlers.add(h);
    return () => outputHandlers.delete(h);
  },

  onRunExit: async (h) => {
    exitHandlers.add(h);
    return () => exitHandlers.delete(h);
  },

  loadConfig: async () => {
    const p = getConfigPath();
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, "utf-8")) as AppConfig;
      } catch (e) {}
    }
    return null;
  },

  saveConfig: async (config: AppConfig) => {
    const p = getConfigPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf-8");
  },

  detectBinaries: async () => {
    return {
      claude: detectClaude(),
      antigravity: detectAgy(),
      copilot: detectGeneric("copilot"),
      gemini: detectGeneric("gemini"),
      codex: detectGeneric("codex"),
      ollama: detectGeneric("ollama"),
      aider: detectGeneric("aider"),
      opencode: detectGeneric("opencode"),
    };
  },

  writeTextFile: async (relativePath: string, content: string) => {
    if (relativePath.includes("..")) throw new Error("Invalid path");
    const p = path.join(path.dirname(getConfigPath()), relativePath);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, "utf-8");
    return p;
  },

  readTextFile: async (relativePath: string) => {
    if (relativePath.includes("..")) throw new Error("Invalid path");
    const p = path.join(path.dirname(getConfigPath()), relativePath);
    try {
      return fs.readFileSync(p, "utf-8");
    } catch {
      return null;
    }
  },

  exec: async (program: string, args: string[], cwd?: string) => {
    const resolved = resolveProgram(program, args);
    const res = spawnSync(resolved.program, resolved.args, { cwd, encoding: "utf-8", timeout: 60000, windowsHide: true });
    return {
      code: res.status,
      stdout: res.stdout || "",
      stderr: res.stderr || ""
    };
  },

  httpPost: async (url: string, body: string, headers: Record<string, string>) => {
    const res = await fetch(url, { method: "POST", body, headers });
    return { status: res.status, body: await res.text() };
  },

  httpGet: async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { method: "GET", headers });
    return { status: res.status, body: await res.text() };
  },

  readHomeFile: async (relativePath: string) => {
    if (relativePath.includes("..")) throw new Error("Invalid path");
    const p = path.join(os.homedir(), relativePath);
    try {
      return fs.readFileSync(p, "utf-8");
    } catch {
      return null;
    }
  },

  ...nodeRemote,

  setTrayEnabled: async () => {},
};
