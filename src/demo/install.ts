// Putting the made-up workspace in front of the app, and opening it on one screen.
//
// Dev only. The caller guards on `import.meta.env.DEV`, which vite replaces with `false` in a
// production build, so this module and `./seed` are dropped from the bundle rather than shipped
// dark. Nothing here is reachable from the app itself: it needs `?demo=<screen>` in the URL.
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { useAppStore } from "@/store";
import { demoConfig, demoState, DEMO_PROJECT_ID } from "./seed";

/** Which screen the shot wants. Adding one here is adding one to `scripts/screenshots.mjs`. */
export type DemoScreen = "home" | "chat" | "board" | "hierarchy" | "settings";

/**
 * Stands in for the transport before React mounts, so `runInit` reads the made-up config instead of
 * finding nothing. Everything else the screens need — runs, messages, tasks, who is working — lives
 * in the store and is pushed once init has settled.
 */
export function installDemo(): void {
  setTransport({
    ...nullTransport,
    loadConfig: async () => demoConfig(useAppStore.getState().config),
    // Written nowhere: a demo that persisted would leave the next real launch holding it.
    saveConfig: async () => {},
    detectBinaries: async () => demoState().binaries,
  });
}

/** Called once `loaded` is true. Returns when the screen is the one asked for. */
export function openDemoScreen(screen: DemoScreen): void {
  useAppStore.setState(demoState() as never);

  const store = useAppStore.getState();
  if (screen === "home") {
    // Said out loud rather than relied on: whatever the restore decided, this shot is of the home.
    store.openHome();
    return;
  }

  if (screen === "settings") {
    store.openProject(DEMO_PROJECT_ID, null, "chat");
    useAppStore.getState().openSettings("agents");
    return;
  }

  // The graph of one task's family is not here: it lives behind a dialog's own state, with no way
  // in from the store. `docs/screenshots/task-graph.png` is taken by hand.
  const mode = screen === "board" ? "tasks" : screen === "hierarchy" ? "graph" : "chat";
  store.openProject(DEMO_PROJECT_ID, null, mode);
}
