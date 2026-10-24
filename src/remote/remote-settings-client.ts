// The configuration screens of the desktop page, wired to the host.
//
// The snapshot carries what the shell draws, not the configuration (it would ride on every push):
// the config is asked for on its own (`settings` command, see src/lib/remote.ts) and asked for again
// whenever the snapshot says it changed. Edits run the store's own actions here — the same screens,
// untouched — and what they changed is sent as a patch, which the host checks before applying.
//
// The theme is the exception: it is this browser's, kept in its storage and never sent.
import { useAppStore } from "@/store";
import { toast } from "@/components/ui/toast";
import { applyTheme } from "@/lib/themes";
import { setRemoteHomeDir } from "@/lib/transport-remote";
import type { RemoteSnapshot } from "@/lib/remote";
import type { RemoteConfigView } from "@/lib/remote-settings";
import { REMOTE_CONFIG_KEYS, REMOTE_PROJECT_KEYS, REMOTE_THEME_KEY, type RemoteConfigKey, type RemoteProjectKey } from "@/lib/remote-settings-keys";
import type { AppConfig, Project, ThemeConfig } from "@/types";
import { api, hydrate } from "./remote-client";

/**
 * The store's own editing actions, taken before `installRemoteActions` replaces them: on this page
 * they edit locally again and the changes go out through `saveConfig`.
 */
const LOCAL = (() => {
  const s = useAppStore.getState();
  return {
    updateConfig: s.updateConfig,
    updateProject: s.updateProject,
    updateAgent: s.updateAgent,
    addAgent: s.addAgent,
    removeAgent: s.removeAgent,
    removeProject: s.removeProject,
  };
})();

let view: RemoteConfigView | null = null;
/** The newest `configVersion` a snapshot announced. */
let latestVersion = 0;
let fetching: Promise<void> | null = null;
/** While the host's data is being poured in, store changes are not the user's and are not sent. */
let applying = 0;
const touched = new Set<RemoteConfigKey>();
const touchedProjects = new Map<string, Set<RemoteProjectKey>>();
/** What was sent and not yet seen back: it keeps its local value until the host's arrives. */
let inflight: { keys: Set<RemoteConfigKey>; projects: Map<string, Set<RemoteProjectKey>> } | null = null;
let flushing: Promise<void> | null = null;
let unsubscribe: (() => void) | null = null;

function withApplying(fn: () => void): void {
  applying++;
  try { fn(); } finally { applying--; }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function pendingKeys(): Set<RemoteConfigKey> {
  return new Set([...touched, ...(inflight?.keys ?? [])]);
}

function pendingProjectKeys(id: string): Set<RemoteProjectKey> {
  return new Set([...(touchedProjects.get(id) ?? []), ...(inflight?.projects.get(id) ?? [])]);
}

/**
 * The host's config over what the store has, except where the user has a change on its way. `before`
 * is the config as it was before the snapshot replaced the projects with its lighter copy of them.
 */
function merge(before: AppConfig): void {
  if (!view) return;
  const hostConfig = view.config as Record<string, unknown>;
  const pending = pendingKeys();
  withApplying(() => useAppStore.setState(state => {
    const config = { ...state.config } as Record<string, unknown>;
    for (const key of REMOTE_CONFIG_KEYS) {
      // The snapshot already says which language to draw in, resolved the way the app resolves it.
      if (key === "language") continue;
      config[key] = pending.has(key) ? (before as unknown as Record<string, unknown>)[key] : hostConfig[key];
    }
    const hostProjects = new Map(view!.config.projects.map(p => [p.id, p]));
    const beforeProjects = new Map(before.projects.map(p => [p.id, p]));
    config.projects = state.config.projects.map(p => {
      const host = hostProjects.get(p.id);
      if (!host) return p;
      // The snapshot's fields are as fresh as the host's: whichever came last, they agree.
      const merged: Project = {
        ...host,
        name: p.name, workspaceDir: p.workspaceDir, repoDir: p.repoDir, color: p.color,
        createdAt: p.createdAt, board: p.board, autonomous: p.autonomous,
      };
      const local = beforeProjects.get(p.id);
      for (const key of pendingProjectKeys(p.id)) {
        if (local) (merged as unknown as Record<string, unknown>)[key] = local[key];
      }
      return merged;
    });
    return { config: config as unknown as AppConfig };
  }));
}

async function fetchView(): Promise<void> {
  if (fetching) return fetching;
  fetching = (async () => {
    const res = (await api("/api/settings", { op: "get" })) as unknown as Partial<RemoteConfigView>;
    // An older host answers this with an error, and anything that is not a config is not poured in.
    if (typeof res.version !== "number" || !res.config || !Array.isArray(res.config.projects)) {
      throw new Error("the host sent no settings");
    }
    view = res as RemoteConfigView;
    setRemoteHomeDir(res.home ?? null);
  })().finally(() => { fetching = null; });
  return fetching;
}

/** Reads the host's config again and pours it in. */
export async function refreshSettings(): Promise<void> {
  await fetchView();
  merge(useAppStore.getState().config);
  // A change landed on the host while this one was on its way.
  if (view && view.version < latestVersion) await refreshSettings();
}

/**
 * `hydrate`, for the desktop page: the snapshot first, then the host's config over the lighter copy
 * of the projects the snapshot carries. Asks for the config again when the snapshot says it moved.
 */
export function hydrateWithSettings(snapshot: RemoteSnapshot): void {
  const before = useAppStore.getState().config;
  withApplying(() => hydrate(snapshot));
  merge(before);
  latestVersion = snapshot.configVersion ?? 0;
  if (!view || view.version !== latestVersion) {
    void refreshSettings().catch(e => console.warn("remote settings unavailable:", errorText(e)));
  }
}

/** Sends what was changed since the last time, and waits for the host's word on it. */
async function flush(): Promise<void> {
  if (flushing) await flushing;
  if (touched.size === 0 && touchedProjects.size === 0) return;
  const config = useAppStore.getState().config;
  const patchConfig: Record<string, unknown> = {};
  // JSON has no undefined: a setting that was taken away travels as null.
  for (const key of touched) patchConfig[key] = config[key] === undefined ? null : config[key];
  const patchProjects: Array<Record<string, unknown>> = [];
  for (const [id, keys] of touchedProjects) {
    const project = config.projects.find(p => p.id === id);
    if (!project) continue;
    const entry: Record<string, unknown> = { id };
    for (const key of keys) entry[key] = project[key] === undefined ? null : project[key];
    patchProjects.push(entry);
  }
  inflight = { keys: new Set(touched), projects: new Map(touchedProjects) };
  touched.clear();
  touchedProjects.clear();

  flushing = (async () => {
    try {
      await api("/api/settings", { op: "update", patch: { config: patchConfig, projects: patchProjects } });
    } catch (e) {
      // Refused: the host's values come back over the local ones below.
      toast.error(errorText(e));
    }
    try {
      await fetchView().catch(e => console.warn("remote settings unavailable:", errorText(e)));
    } finally {
      inflight = null;
      merge(useAppStore.getState().config);
    }
  })().finally(() => { flushing = null; });
  await flushing;
}

function readTheme(): ThemeConfig | undefined {
  try {
    const raw = localStorage.getItem(REMOTE_THEME_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const { preset, vars } = parsed as Record<string, unknown>;
    if (typeof preset !== "string" || !vars || typeof vars !== "object") return undefined;
    return { preset, vars: Object.fromEntries(Object.entries(vars).filter(([, v]) => typeof v === "string")) as Record<string, string> };
  } catch {
    return undefined;
  }
}

function writeTheme(theme: ThemeConfig | undefined): void {
  try {
    if (theme) localStorage.setItem(REMOTE_THEME_KEY, JSON.stringify(theme));
    else localStorage.removeItem(REMOTE_THEME_KEY);
  } catch { /* storage unavailable: it lasts for this tab */ }
}

/** This browser's theme, applied before the shell draws. */
export function restoreRemoteTheme(): void {
  const theme = readTheme();
  if (!theme) return;
  withApplying(() => useAppStore.setState(state => ({ config: { ...state.config, theme } })));
  if (typeof document !== "undefined") applyTheme(theme);
}

/** Notes what the user changed, so `flush` sends that and nothing the host poured in. */
function watchEdits(): () => void {
  return useAppStore.subscribe((state, prev) => {
    if (applying > 0 || state.config === prev.config) return;
    if (state.config.theme !== prev.config.theme) writeTheme(state.config.theme);
    for (const key of REMOTE_CONFIG_KEYS) {
      if (state.config[key] !== prev.config[key]) touched.add(key);
    }
    if (state.config.projects === prev.config.projects) return;
    const prevProjects = new Map(prev.config.projects.map(p => [p.id, p]));
    for (const project of state.config.projects) {
      const old = prevProjects.get(project.id);
      // A project the page made up has no counterpart on the host to patch.
      if (!old || old === project) continue;
      for (const key of REMOTE_PROJECT_KEYS) {
        if (project[key] !== old[key]) {
          const keys = touchedProjects.get(project.id) ?? new Set<RemoteProjectKey>();
          keys.add(key);
          touchedProjects.set(project.id, keys);
        }
      }
    }
  });
}

/**
 * Called once, right after `installRemoteActions`: gives the editing actions back to the store and
 * points `saveConfig` at the host. Deleting a project is the host's to do, cleanup included.
 */
export function installRemoteSettings(): void {
  unsubscribe?.();
  unsubscribe = watchEdits();
  useAppStore.setState({
    updateConfig: LOCAL.updateConfig,
    updateProject: LOCAL.updateProject,
    updateAgent: LOCAL.updateAgent,
    addAgent: LOCAL.addAgent,
    removeAgent: LOCAL.removeAgent,
    saveConfig: flush,
    removeProject: (projectId) => {
      void api("/api/settings", { op: "removeProject", projectId })
        // What the app does on its side of a deletion (panes, navigation, notifications), here too.
        .then(() => withApplying(() => LOCAL.removeProject(projectId)))
        .catch(e => toast.error(errorText(e)));
    },
  });
}

/** Writes the enabled MCP servers or skills into each CLI of the host. Answers how many failed. */
export async function remoteSyncNative(kind: "mcp" | "skills"): Promise<number> {
  const res = await api("/api/settings", { op: "sync", kind });
  return typeof res.failed === "number" ? res.failed : 0;
}

/** For tests: back to a page that never loaded the config. */
export function resetRemoteSettings(): void {
  unsubscribe?.();
  unsubscribe = null;
  view = null;
  latestVersion = 0;
  fetching = null;
  flushing = null;
  inflight = null;
  touched.clear();
  touchedProjects.clear();
}
