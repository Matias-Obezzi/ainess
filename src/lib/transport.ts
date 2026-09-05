export interface Transport {
  spawnRun(opts: import("@/types").SpawnOptions): Promise<void>;
  killRun(runId: string): Promise<boolean>;
  onRunOutput(h: (e: import("@/types").RunOutputEvent) => void): Promise<() => void>;
  onRunExit(h: (e: import("@/types").RunExitEvent) => void): Promise<() => void>;
  loadConfig(): Promise<import("@/types").AppConfig | null>;
  saveConfig(config: import("@/types").AppConfig): Promise<void>;
  detectBinaries(): Promise<import("@/types").Binaries>;
  writeTextFile(relativePath: string, content: string): Promise<string>;
  exec(program: string, args: string[], cwd?: string): Promise<{ code: number | null, stdout: string, stderr: string }>;
  httpPost(url: string, body: string, headers: Record<string,string>): Promise<{ status: number; body: string }>;
}

let currentTransport: Transport | null = null;

export function setTransport(t: Transport): void {
  currentTransport = t;
}

import { isTauri } from "./tauri";
import { tauriTransport } from "./transport-tauri";
import { nullTransport } from "./transport-null";

export function getTransport(): Transport {
  if (currentTransport) {
    return currentTransport;
  }
  return isTauri() ? tauriTransport : nullTransport;
}
