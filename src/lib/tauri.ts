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

/**
 * One listener per event, replaced rather than stacked.
 *
 * `listen()` registers on the Rust side and outlives the JS module that called it. A hot reload
 * swaps the module that registered for a fresh copy whose guards are back to "not registered", so
 * it listens again while the previous listener keeps running: from then on every event is handled
 * once per copy — one tap on the phone asking for five approvals, one streamed line written five
 * times. The registry lives on `globalThis`, out of reach of the swap, so registering again drops
 * what was there first.
 */
const listeners = ((globalThis as { __ainessListeners?: Map<string, UnlistenFn> }).__ainessListeners ??= new Map());

export async function listenOnce<T>(
  event: string,
  handler: (payload: T) => void | Promise<void>,
): Promise<UnlistenFn> {
  listeners.get(event)?.();
  listeners.delete(event);
  const unlisten = await listen<T>(event, (ev) => { void handler(ev.payload); });
  listeners.set(event, unlisten);
  return unlisten;
}

export function onRunOutput(
  handler: (e: RunOutputEvent) => void,
): Promise<UnlistenFn> {
  return listenOnce<RunOutputEvent>("run-output", handler);
}

export function onRunExit(
  handler: (e: RunExitEvent) => void,
): Promise<UnlistenFn> {
  return listenOnce<RunExitEvent>("run-exit", handler);
}

/** True when running inside the Tauri webview (false in a plain browser). */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
