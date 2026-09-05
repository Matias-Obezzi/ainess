import { Transport } from "./transport";
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

function detectClaude(): BinaryInfo | null {
  let p = which("claude");
  if (p) return { path: p, version: getVersion(p) };

  const appData = process.env.APPDATA ?? os.homedir();
  const claudeCodeDir = path.join(appData, "Claude", "claude-code");
  let bestPath: string | null = null;
  let bestVersion: number[] = [0,0,0];

  if (fs.existsSync(claudeCodeDir)) {
    const entries = fs.readdirSync(claudeCodeDir, { withFileTypes: true });
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
  return null;
}

function detectAgy(): BinaryInfo | null {
  let p = which("agy");
  if (p) return { path: p, version: getVersion(p) };

  const agyBin = path.join(os.homedir(), ".gemini", "bin", process.platform === "win32" ? "agy.exe" : "agy");
  if (fs.existsSync(agyBin)) {
    return { path: agyBin, version: getVersion(agyBin) };
  }
  return null;
}

function detectGeneric(name: string): BinaryInfo | null {
  const p = which(name);
  if (p) return { path: p, version: getVersion(p) };
  return null;
}

export const nodeTransport: Transport = {
  spawnRun: async (opts: SpawnOptions) => {
    const env = { ...process.env, ...(opts.env || {}), NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" };
    const child = spawn(opts.program, opts.args, {
      cwd: opts.cwd || process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    activeRuns.set(opts.runId, child);

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

    child.on("close", (code) => {
      activeRuns.delete(opts.runId);
      const killed = killedRuns.has(opts.runId);
      killedRuns.delete(opts.runId);
      const ev: RunExitEvent = { runId: opts.runId, code, killed };
      for (const h of exitHandlers) h(ev);
    });
  },

  killRun: async (runId: string) => {
    const child = activeRuns.get(runId);
    if (!child) return false;
    killedRuns.add(runId);
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill", ["/PID", child.pid.toString(), "/T", "/F"]);
    }
    child.kill(process.platform === "win32" ? "SIGKILL" : "SIGTERM");
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
    };
  }
};
