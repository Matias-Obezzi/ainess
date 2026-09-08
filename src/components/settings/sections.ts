// Declarative metadata for every settings section: id, label, help, group, searchable options
// and icon. No component imports — this module must be importable from anywhere (SearchPalette,
// store, tests) without pulling the full settings UI tree into the bundle.
//
// `SettingsSection` is imported as a type only (erased at runtime), so importing this module from
// store.ts does not create a runtime cycle even though store.ts defines SettingsSection.
import { Settings2, Bot, User, ListChecks, Sparkles, Plug, Webhook, FileText, Smartphone, MessageCircle, Stethoscope, Info, type LucideIcon } from "lucide-react";
import type { SettingsSection } from "@/store";

/** Sidebar groups, in the order they are shown. */
export const SETTINGS_GROUPS = ["general", "agents", "automation", "access", "app"] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export const SETTINGS_GROUP_KEY: Record<SettingsGroup, string> = {
  general: "settings.group.general",
  agents: "settings.group.agents",
  automation: "settings.group.automation",
  access: "settings.group.access",
  app: "settings.group.app",
};

/** Pure declarative shape of a settings section (no React components). */
export interface SettingsSectionMeta {
  id: SettingsSection;
  labelKey: string;
  helpKey: string;
  icon: LucideIcon;
  /** Which block of the sidebar it belongs to. */
  group: SettingsGroup;
  /**
   * The individual options inside the section, by their real name in the UI. The search returns
   * these as results of their own, so "puerto" lands on the option and not just on the section.
   */
  optionKeys: string[];
}

/** Search keys of a section's options, named after the option they stand for. */
export const options = (section: SettingsSection, names: string[]) =>
  names.map(n => `settings.option.${section}.${n}`);

/** The single source of truth for settings sections order and metadata. */
export const SETTINGS_SECTIONS_META: SettingsSectionMeta[] = [
  { id: "general",     labelKey: "settings.section.general",     helpKey: "settings.help.general",     group: "general",    optionKeys: options("general",     ["tray", "notifyApprovals", "notifyResults", "sound", "updateCheck", "debugLog", "maxRounds", "autoModel", "approveDelegations", "language", "autoArchive"]), icon: Settings2 },
  { id: "agents",      labelKey: "settings.section.agents",      helpKey: "settings.help.agents",      group: "agents",     optionKeys: options("agents",      ["installed", "detect", "cliVersion", "quota", "binaryPath", "formations", "newFormation", "defaultFormation"]),                                    icon: Bot },
  { id: "profile",     labelKey: "settings.section.profile",     helpKey: "settings.help.profile",     group: "agents",     optionKeys: options("profile",     ["name", "about", "preferences"]),                                                                                                                icon: User },
  { id: "presets",     labelKey: "settings.section.presets",     helpKey: "settings.help.presets",     group: "automation", optionKeys: options("presets",     ["quickOrders", "newOrder"]),                                                                                                                     icon: ListChecks },
  { id: "skills",      labelKey: "settings.section.skills",      helpKey: "settings.help.skills",      group: "automation", optionKeys: options("skills",      ["agentSkills", "suggested"]),                                                                                                                    icon: Sparkles },
  { id: "mcp",         labelKey: "settings.section.mcp",         helpKey: "settings.help.mcp",         group: "automation", optionKeys: options("mcp",         ["servers", "suggested"]),                                                                                                                        icon: Plug },
  { id: "hooks",       labelKey: "settings.section.hooks",       helpKey: "settings.help.hooks",       group: "automation", optionKeys: options("hooks",       ["byEvent", "slackAction", "commandAction", "filter"]),                                                                                          icon: Webhook },
  { id: "context",     labelKey: "settings.section.context",     helpKey: "settings.help.context",     group: "agents",     optionKeys: options("context",     ["shared"]),                                                                                                                                      icon: FileText },
  { id: "remote",      labelKey: "settings.section.remote",      helpKey: "settings.help.remote",      group: "access",     optionKeys: options("remote",      ["lan", "port", "token", "qr", "tunnel", "tunnelProvider", "domainType", "domain", "ngrokAuthtoken", "ngrokApiKey", "installNgrok", "detectAgain"]), icon: Smartphone },
  { id: "messaging",   labelKey: "settings.section.messaging",   helpKey: "settings.help.messaging",   group: "access",     optionKeys: options("messaging",   ["enable", "token", "chats", "project", "test"]),                                                                                                 icon: MessageCircle },
  { id: "diagnostics", labelKey: "settings.section.diagnostics", helpKey: "settings.help.diagnostics", group: "app",        optionKeys: options("diagnostics", ["recheck", "copy"]),                                                                                                                            icon: Stethoscope },
  { id: "about",       labelKey: "settings.section.about",       helpKey: "settings.help.about",       group: "app",        optionKeys: options("about",       ["version", "checkUpdates", "openLogs", "copyDiagnostics", "repository"]),                                                                       icon: Info },
];

/** All section ids, derived from the single list — used to validate persisted values. */
export const ALL_SETTINGS_SECTION_IDS = SETTINGS_SECTIONS_META.map(s => s.id);
