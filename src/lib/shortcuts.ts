// The one table of keyboard shortcuts. `App.tsx` resolves the global ones from here and the
// shortcuts dialog documents every one of them, so the two can never drift apart. The handlers
// themselves stay where they belong (the composer keeps its own `onKeyDown`, the terminal its
// xterm hook); this file only says which combination means what.

/** Where a shortcut works. The dialog shows one block per group, in this order. */
export type ShortcutGroup = "general" | "project" | "composer" | "terminal";

export const SHORTCUT_GROUPS: ShortcutGroup[] = ["general", "project", "composer", "terminal"];

export const SHORTCUT_GROUP_KEY: Record<ShortcutGroup, string> = {
  general: "shortcuts.group.general",
  project: "shortcuts.group.project",
  composer: "shortcuts.group.composer",
  terminal: "shortcuts.group.terminal",
};

/** macOS writes ⌘ where Windows and Linux write Ctrl; everything else is the same. */
export type ShortcutPlatform = "mac" | "other";

export interface ShortcutKeys {
  /** Ctrl on Windows and Linux, ⌘ on macOS. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** `KeyboardEvent.key`, lowercased for letters ("k", ",", "`", "enter", "escape", "arrowup"). */
  key: string;
  /** `KeyboardEvent.code` that also counts as a match, for keys a layout can swallow. */
  code?: string;
}

/** Ids of the shortcuts `App.tsx` dispatches itself. */
export type GlobalShortcutId = "settings" | "palette" | "sidebar" | "terminals" | "shortcuts";

export interface ShortcutDef {
  id: string;
  keys: ShortcutKeys;
  /** Key of the sentence that explains what it does. */
  descriptionKey: string;
  group: ShortcutGroup;
  /** True for the ones the window listener resolves; the rest belong to a single component. */
  global: boolean;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: "palette", keys: { mod: true, key: "k" }, descriptionKey: "shortcuts.palette", group: "general", global: true },
  { id: "settings", keys: { mod: true, key: "," }, descriptionKey: "shortcuts.settings", group: "general", global: true },
  { id: "shortcuts", keys: { mod: true, key: "/" }, descriptionKey: "shortcuts.shortcuts", group: "general", global: true },
  { id: "sidebar", keys: { mod: true, key: "b" }, descriptionKey: "shortcuts.sidebar", group: "general", global: true },
  // The backtick is a dead key in several layouts and never reaches `key`, so `code` covers it.
  { id: "terminals", keys: { mod: true, key: "`", code: "Backquote" }, descriptionKey: "shortcuts.terminals", group: "project", global: true },
  { id: "composer.send", keys: { key: "enter" }, descriptionKey: "shortcuts.composerSend", group: "composer", global: false },
  { id: "composer.newline", keys: { shift: true, key: "enter" }, descriptionKey: "shortcuts.composerNewline", group: "composer", global: false },
  { id: "composer.queue", keys: { mod: true, key: "enter" }, descriptionKey: "shortcuts.composerQueue", group: "composer", global: false },
  { id: "composer.stop", keys: { key: "escape" }, descriptionKey: "shortcuts.composerStop", group: "composer", global: false },
  { id: "composer.previous", keys: { key: "arrowup" }, descriptionKey: "shortcuts.composerPrevious", group: "composer", global: false },
  { id: "composer.next", keys: { key: "arrowdown" }, descriptionKey: "shortcuts.composerNext", group: "composer", global: false },
  // Ctrl+B is the sidebar's too; with the focus in the box, the box takes it (see `Composer`).
  { id: "composer.bold", keys: { mod: true, key: "b" }, descriptionKey: "shortcuts.composerBold", group: "composer", global: false },
  { id: "composer.italic", keys: { mod: true, key: "i" }, descriptionKey: "shortcuts.composerItalic", group: "composer", global: false },
  { id: "composer.code", keys: { mod: true, key: "e" }, descriptionKey: "shortcuts.composerCode", group: "composer", global: false },
  { id: "composer.link", keys: { mod: true, shift: true, key: "k" }, descriptionKey: "shortcuts.composerLink", group: "composer", global: false },
  { id: "terminal.copy", keys: { mod: true, shift: true, key: "c" }, descriptionKey: "shortcuts.terminalCopy", group: "terminal", global: false },
  { id: "terminal.paste", keys: { mod: true, shift: true, key: "v" }, descriptionKey: "shortcuts.terminalPaste", group: "terminal", global: false },
];

/** What the browser (or the Tauri webview) is running on. Defaults to "other" outside a browser. */
export function shortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === "undefined") return "other";
  const hint = `${(navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad|ipod/i.test(hint) ? "mac" : "other";
}

const KEY_LABELS: Record<string, string> = {
  enter: "Enter",
  escape: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Supr",
  space: "Espacio",
};

/** One label per key of the combination, in the order they are pressed. */
export function formatShortcut(keys: ShortcutKeys, platform: ShortcutPlatform): string[] {
  const parts: string[] = [];
  if (keys.mod) parts.push(platform === "mac" ? "⌘" : "Ctrl");
  if (keys.alt) parts.push(platform === "mac" ? "⌥" : "Alt");
  if (keys.shift) parts.push(platform === "mac" ? "⇧" : "Shift");
  const named = KEY_LABELS[keys.key];
  parts.push(named ?? (keys.key.length === 1 ? keys.key.toUpperCase() : keys.key));
  return parts;
}

/** The bits of a `KeyboardEvent` a shortcut looks at, so matching can be tested without the DOM. */
export interface ShortcutEvent {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export function matchesShortcut(keys: ShortcutKeys, event: ShortcutEvent, platform: ShortcutPlatform): boolean {
  const mod = platform === "mac" ? !!event.metaKey : !!event.ctrlKey;
  if (mod !== !!keys.mod) return false;
  if (!!event.shiftKey !== !!keys.shift) return false;
  if (!!event.altKey !== !!keys.alt) return false;
  const key = (event.key ?? "").toLowerCase();
  if (key === keys.key) return true;
  return !!keys.code && event.code === keys.code;
}

/** The global shortcut this key press stands for, if any. */
export function resolveGlobalShortcut(event: ShortcutEvent, platform: ShortcutPlatform): ShortcutDef | undefined {
  return SHORTCUTS.find(s => s.global && matchesShortcut(s.keys, event, platform));
}

export function shortcutsOfGroup(group: ShortcutGroup): ShortcutDef[] {
  return SHORTCUTS.filter(s => s.group === group);
}

/** Stable identity of a combination, used to prove no two shortcuts collide. */
export function shortcutCombo(keys: ShortcutKeys): string {
  return [keys.mod ? "mod" : "", keys.alt ? "alt" : "", keys.shift ? "shift" : "", keys.key].filter(Boolean).join("+");
}
