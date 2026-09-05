// Typed wrappers around the Tauri IPC. Single place that knows command and event names.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppConfig,
  Binaries,
  RunExitEvent,
  RunOutputEvent,
  SpawnOptions,
} from "@/types";

export const ipc = {
  spawnRun: (opts: SpawnOptions) => invoke<void>("spawn_run", { opts }),
  killRun: (runId: string) => invoke<boolean>("kill_run", { runId }),
  runningRuns: () => invoke<string[]>("running_runs"),
  loadConfig: () => invoke<AppConfig | null>("load_config"),
  saveConfig: (config: AppConfig) => invoke<void>("save_config", { config }),
  detectBinaries: () => invoke<Binaries>("detect_binaries"),
};

export function onRunOutput(
  handler: (e: RunOutputEvent) => void,
): Promise<UnlistenFn> {
  return listen<RunOutputEvent>("run-output", (ev) => handler(ev.payload));
}

export function onRunExit(
  handler: (e: RunExitEvent) => void,
): Promise<UnlistenFn> {
  return listen<RunExitEvent>("run-exit", (ev) => handler(ev.payload));
}

/** True when running inside the Tauri webview (false in a plain browser). */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
