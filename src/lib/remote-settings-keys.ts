// What of the configuration the remote desktop page may read and write, shared by the host (which
// validates, see `remote-settings.ts`) and the page (which only sends these). Kept apart from the
// validators so the page does not carry them.

/**
 * What a secret looks like on its way to the page. The page shows it as is ("configured"), and
 * sending it back untouched tells the host to keep the value it already has; anything else replaces
 * it. The real value never leaves the host.
 */
export const SECRET_MASK = "••••••••";

/** Top-level `AppConfig` keys the page may change. Anything else in a patch is refused. */
export const REMOTE_CONFIG_KEYS = [
  "language",
  "approveDelegations",
  "tray",
  "formations",
  "defaultFormationId",
  "maxRounds",
  "maxConcurrentRuns",
  "stallStopMinutes",
  "mcpNativeSync",
  "plugins",
  "skillsNativeSync",
  "skills",
  "mcpServers",
  "profile",
  "presets",
  "autoModel",
  "hooks",
  "logLevel",
  "autoUpdateCheck",
  "autoArchiveDoneDays",
  "notificationSound",
  "mascotAlways",
  "screenAnimations",
  "escapeStops",
  "rememberedModels",
  "plannerPermissions",
  "boards",
] as const;

export type RemoteConfigKey = (typeof REMOTE_CONFIG_KEYS)[number];

/**
 * Fields of a project the page may change. The folder, the repository and the creation date are
 * the host's: a folder is picked with a native dialog on that machine.
 */
export const REMOTE_PROJECT_KEYS = [
  "name",
  "color",
  "agents",
  "budget",
  "board",
  "room",
  "verify",
  "commands",
  "sharedContext",
] as const;

export type RemoteProjectKey = (typeof REMOTE_PROJECT_KEYS)[number];

/** Where the page keeps its own theme: per browser, never sent to the host. */
export const REMOTE_THEME_KEY = "ainess.remote.theme";
