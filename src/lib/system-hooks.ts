// Hooks that fire on the machine's own conditions rather than on something an agent did: a clock,
// the connection dropping, a file changing, the app opening.
//
// All of it lives in the app while it is open — there is no background service, and a scheduled
// hook does not fire on a machine where ainess is closed. That is the honest limit of a desktop
// app that spawns CLIs, and the alternative (a service that runs agents behind your back) is not
// something anyone asked for.
import { useAppStore } from "@/store";
import { emitHookEvent } from "@/lib/hooks";
import { log } from "@/lib/logger";
import type { Hook, HookEvent, Project } from "@/types";

/** How often the clock is read. Half a minute is well under the smallest interval worth setting. */
const TICK_MS = 30_000;

/**
 * A time of day is only fired within this long after it passed: opening the app at six in the
 * afternoon must not fire everything set for the morning.
 */
export const CATCH_UP_MS = 10 * 60_000;

/** No condition hook fires twice inside this. A save storm must not become a run storm. */
export const COOLDOWN_MS = 60_000;

/**
 * The scheduled hooks that are due, given when each one last fired.
 *
 * `everyMinutes` is counted from the last firing, and the caller seeds that with the moment the
 * hook was first seen: "every 30 minutes" means from now on, not one straight away.
 */
export function dueSchedules(hooks: Hook[], now: Date, lastFired: Record<string, number>): Hook[] {
  return hooks.filter(hook => {
    if (!hook.enabled || hook.event !== "schedule") return false;
    const last = lastFired[hook.id];

    const at = hook.schedule?.at;
    if (at) {
      const match = /^(\d{1,2}):(\d{2})$/.exec(at.trim());
      if (!match) return false;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours > 23 || minutes > 59) return false;
      const today = new Date(now);
      today.setHours(hours, minutes, 0, 0);
      const passed = now.getTime() - today.getTime();
      if (passed < 0 || passed > CATCH_UP_MS) return false;
      return last === undefined || last < today.getTime();
    }

    const every = hook.schedule?.everyMinutes;
    if (!every || every <= 0) return false;
    // Unseeded: the runner records it on this tick and it fires one interval from now.
    if (last === undefined) return false;
    return now.getTime() - last >= every * 60_000;
  });
}

/** Hooks of this event that are not still inside their cooldown. */
export function readyHooks(hooks: Hook[], event: HookEvent, now: number, lastFired: Record<string, number>): Hook[] {
  return hooks.filter(hook =>
    hook.enabled && hook.event === event && now - (lastFired[hook.id] ?? 0) >= COOLDOWN_MS);
}

/** Which project a system hook is about: the one it is filtered to, or whichever is open. */
function projectOf(hook: Hook): Project | undefined {
  const state = useAppStore.getState();
  const wanted = hook.filter?.projectId ?? state.currentProjectId;
  return state.config.projects.find(p => p.id === wanted);
}

/**
 * Starts watching. Returns the function that stops it, so React can mount this once and let go of
 * it cleanly.
 */
export function startSystemHooks(): () => void {
  const lastFired: Record<string, number> = {};
  const hooksNow = () => useAppStore.getState().config.hooks ?? [];

  const fire = (event: HookEvent, hooks: Hook[], project?: Project) => {
    if (hooks.length === 0) return;
    const now = Date.now();
    for (const hook of hooks) lastFired[hook.id] = now;
    log.debug("hooks", `${event}: ${hooks.map(h => h.name).join(", ")}`);
    void emitHookEvent(event, {}, (hook: Hook) => ({ project: project ?? projectOf(hook) }));
  };

  // ---- the clock ----
  const tick = () => {
    const hooks = hooksNow();
    const now = new Date();
    const due = dueSchedules(hooks, now, lastFired);
    // Seed the interval ones that have never fired, so they start counting from now.
    for (const hook of hooks) {
      if (hook.event === "schedule" && hook.schedule?.everyMinutes && lastFired[hook.id] === undefined) {
        lastFired[hook.id] = now.getTime();
      }
    }
    fire("schedule", due);
  };
  const timer = setInterval(tick, TICK_MS);

  // ---- the connection ----
  // ponytail: the browser's own events, which see the link and not the internet — a machine on a
  // wifi with no way out still reads as online. Probe a URL here if that turns out to matter.
  const onOffline = () => fire("internet.lost", readyHooks(hooksNow(), "internet.lost", Date.now(), lastFired));
  const onOnline = () => fire("internet.back", readyHooks(hooksNow(), "internet.back", Date.now(), lastFired));
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);

  // ---- the app opening ----
  fire("app.started", hooksNow().filter(h => h.enabled && h.event === "app.started"));

  return () => {
    clearInterval(timer);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
  };
}

/**
 * Something changed in a project's folder. Called by the repo watcher, which already drops the
 * noise (`.git`, `node_modules`, build output) and waits for the writes to settle.
 */
export function fileChangedInProject(projectId: string): void {
  const state = useAppStore.getState();
  const project = state.config.projects.find(p => p.id === projectId);
  if (!project) return;
  const now = Date.now();
  const ready = readyHooks(state.config.hooks ?? [], "file.changed", now, fileCooldown);
  if (ready.length === 0) return;
  for (const hook of ready) fileCooldown[hook.id] = now;
  void emitHookEvent("file.changed", {}, { project });
}

/** Kept out of the runner's own table: this one is called from the watcher, not from the loop. */
const fileCooldown: Record<string, number> = {};
