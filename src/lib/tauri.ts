// Typed wrappers around the Tauri IPC. Single place that knows command and event names.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppConfig,
  Binaries,
  RunExitEvent,
  RunOutputEvent,
  SpawnOptions,
  SpawnedProcess,
  AcpSetupEvent,
} from "@/types";

export const ipc = {
  spawnRun: (opts: SpawnOptions) => invoke<SpawnedProcess>("spawn_run", { opts }),
  reapOrphans: (orphans: Array<{ runId: string; pid: number; image: string; startedAt: number }>) =>
    invoke<string[]>("reap_orphans", { orphans }),
  killRun: (runId: string) => invoke<boolean>("kill_run", { runId }),
  writeStdin: (runId: string, text: string) => invoke<boolean>("write_stdin", { runId, text }),
  closeStdin: (runId: string) => invoke<boolean>("close_stdin", { runId }),
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

/**
 * Several handlers on one event, each under a key.
 *
 * `listenOnce` keeps one listener per event, which was right while each event had one reader. The
 * run events have two: the orchestrator, for every run, and the ACP client, for the run it is
 * talking to. The client registered second and so silently unregistered the orchestrator, which
 * from the first Claude run on never heard another line or another exit — runs stayed "running"
 * after their process was gone, stop had nothing to kill, and the composer stayed locked.
 *
 * So the Tauri listener is still one per event (registered through `listenOnce`, safe across hot
 * reloads), and it hands each payload to every handler subscribed here. A key is what keeps a hot
 * reload from stacking copies: the same key replaces, a new one adds. No key means a fresh one.
 */
const fanout = ((globalThis as { __ainessFanout?: Map<string, Map<string, (payload: unknown) => void>> }).__ainessFanout ??= new Map());

async function subscribe<T>(event: string, handler: (payload: T) => void, key?: string): Promise<UnlistenFn> {
  let slot = fanout.get(event);
  if (!slot) {
    // In the map before the await, so a second subscriber arriving meanwhile shares it.
    const handlers = new Map<string, (payload: unknown) => void>();
    slot = handlers;
    fanout.set(event, handlers);
    await listenOnce<unknown>(event, (payload) => {
      for (const h of [...handlers.values()]) {
        try { h(payload); } catch (e) { console.error(`[tauri] ${event} handler threw`, e); }
      }
    });
  }
  const id = key ?? crypto.randomUUID();
  const own = handler as (payload: unknown) => void;
  slot.set(id, own);
  const handlers = slot;
  return () => {
    if (handlers.get(id) === own) handlers.delete(id);
  };
}

export function onRunOutput(
  handler: (e: RunOutputEvent) => void,
  key?: string,
): Promise<UnlistenFn> {
  return subscribe<RunOutputEvent>("run-output", handler, key);
}

export function onRunExit(
  handler: (e: RunExitEvent) => void,
  key?: string,
): Promise<UnlistenFn> {
  return subscribe<RunExitEvent>("run-exit", handler, key);
}

export function onAcpSetup(
  handler: (e: AcpSetupEvent) => void,
): Promise<UnlistenFn> {
  return listenOnce<AcpSetupEvent>("acp-setup", handler);
}

/** True when running inside the Tauri webview (false in a plain browser). */
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
