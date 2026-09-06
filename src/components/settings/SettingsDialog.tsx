import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/store";
import type { SettingsSection } from "@/store";
import { cn } from "@/lib/utils";
import { Settings2, Bot, User, ListChecks, Sparkles, Plug, Webhook, FileText, Smartphone, Info, Search, X, type LucideIcon } from "lucide-react";
import { GeneralSection } from "@/components/settings/GeneralSection";
import { AgentsSection, AgentsSectionActions, AgentsSectionProvider } from "@/components/settings/AgentsSection";
import { ProfileSection, ProfileSectionActions, ProfileSectionProvider } from "@/components/settings/ProfileSection";
import { PresetsSection, PresetsSectionActions, PresetsSectionProvider } from "@/components/settings/PresetsSection";
import { SkillsSection, SkillsSectionActions, SkillsSectionProvider } from "@/components/settings/SkillsSection";
import { McpSection, McpSectionActions, McpSectionProvider } from "@/components/settings/McpSection";
import { HooksSection, HooksSectionActions, HooksSectionProvider } from "@/components/settings/HooksSection";
import { ContextSection, ContextSectionActions, ContextSectionProvider } from "@/components/settings/ContextSection";
import { RemoteSection } from "@/components/settings/RemoteSection";
import { AboutSection } from "@/components/settings/AboutSection";
import { useT } from "@/i18n/useT";

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

export interface SettingsSectionDef {
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
  /** Body of the section. */
  component: ComponentType;
  /** Header actions (buttons) rendered right of the title, before the close button. */
  actions?: ComponentType;
  /** Wraps both `actions` and `component` when they share state (e.g. a "new/edit" dialog). */
  provider?: ComponentType<{ children: ReactNode }>;
}

const PassThrough = ({ children }: { children: ReactNode }) => children;

/** Search keys of a section's options, named after the option they stand for. */
const options = (section: SettingsSection, names: string[]) => names.map(n => `settings.option.${section}.${n}`);

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: "general", labelKey: "settings.section.general", helpKey: "settings.help.general", group: "general", optionKeys: options("general", ["tray", "notifyApprovals", "notifyResults", "updateCheck", "debugLog", "maxRounds", "autoModel", "approveDelegations", "language", "autoArchive"]), icon: Settings2, component: GeneralSection },
  { id: "agents", labelKey: "settings.section.agents", helpKey: "settings.help.agents", group: "agents", optionKeys: options("agents", ["installed", "detect", "cliVersion", "quota", "binaryPath", "formations", "newFormation", "defaultFormation"]), icon: Bot, component: AgentsSection, actions: AgentsSectionActions, provider: AgentsSectionProvider },
  { id: "profile", labelKey: "settings.section.profile", helpKey: "settings.help.profile", group: "agents", optionKeys: options("profile", ["name", "about", "preferences"]), icon: User, component: ProfileSection, actions: ProfileSectionActions, provider: ProfileSectionProvider },
  { id: "presets", labelKey: "settings.section.presets", helpKey: "settings.help.presets", group: "automation", optionKeys: options("presets", ["quickOrders", "newOrder"]), icon: ListChecks, component: PresetsSection, actions: PresetsSectionActions, provider: PresetsSectionProvider },
  { id: "skills", labelKey: "settings.section.skills", helpKey: "settings.help.skills", group: "automation", optionKeys: options("skills", ["agentSkills", "suggested"]), icon: Sparkles, component: SkillsSection, actions: SkillsSectionActions, provider: SkillsSectionProvider },
  { id: "mcp", labelKey: "settings.section.mcp", helpKey: "settings.help.mcp", group: "automation", optionKeys: options("mcp", ["servers", "suggested"]), icon: Plug, component: McpSection, actions: McpSectionActions, provider: McpSectionProvider },
  { id: "hooks", labelKey: "settings.section.hooks", helpKey: "settings.help.hooks", group: "automation", optionKeys: options("hooks", ["byEvent", "slackAction", "commandAction", "filter"]), icon: Webhook, component: HooksSection, actions: HooksSectionActions, provider: HooksSectionProvider },
  { id: "context", labelKey: "settings.section.context", helpKey: "settings.help.context", group: "agents", optionKeys: options("context", ["shared"]), icon: FileText, component: ContextSection, actions: ContextSectionActions, provider: ContextSectionProvider },
  { id: "remote", labelKey: "settings.section.remote", helpKey: "settings.help.remote", group: "access", optionKeys: options("remote", ["lan", "port", "token", "qr", "tunnel", "tunnelProvider", "domainType", "domain", "ngrokAuthtoken", "ngrokApiKey", "installNgrok", "detectAgain"]), icon: Smartphone, component: RemoteSection },
  { id: "about", labelKey: "settings.section.about", helpKey: "settings.help.about", group: "app", optionKeys: options("about", ["version", "checkUpdates", "openLogs", "copyDiagnostics", "repository"]), icon: Info, component: AboutSection },
];

/** Lowercase and without accents, so "orquestacion" finds "orquestación". */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Configuración, as a modal with an internal sidebar of sections (replaces the old settings screen). */
export function SettingsDialog() {
  const t = useT();
  const settingsOpen = useAppStore(state => state.settingsOpen);
  const settingsSection = useAppStore(state => state.settingsSection);
  const openSettings = useAppStore(state => state.openSettings);
  const closeSettings = useAppStore(state => state.closeSettings);

  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };

  // Results are the options themselves, not only the sections that hold them: searching "puerto"
  // answers with "Puerto · Remoto" and opens that section.
  const results = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    const out: Array<{ key: string; section: SettingsSectionDef; label: string; sub: string }> = [];
    for (const section of SETTINGS_SECTIONS) {
      const group = t(SETTINGS_GROUP_KEY[section.group]);
      const sectionLabel = t(section.labelKey);
      if (normalize(`${group} ${sectionLabel} ${t(section.helpKey)}`).includes(needle)) {
        out.push({ key: `s:${section.id}`, section, label: sectionLabel, sub: group });
      }
      for (const optionKey of section.optionKeys) {
        const option = t(optionKey);
        if (normalize(option).includes(needle)) {
          out.push({ key: `${section.id}:${optionKey}`, section, label: option, sub: sectionLabel });
        }
      }
    }
    return out.slice(0, 24);
  }, [query, t]);

  const go = (id: SettingsSection) => {
    openSettings(id);
    closeSearch();
  };

  const active = SETTINGS_SECTIONS.find(s => s.id === settingsSection) ?? SETTINGS_SECTIONS[0];
  const Provider = active.provider ?? PassThrough;
  const Actions = active.actions;
  const Body = active.component;

  return (
    <Dialog open={settingsOpen} onOpenChange={(o) => !o && closeSettings()}>
      <DialogContent showCloseButton={false} className="flex h-[85vh] w-[92vw] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="flex h-full min-h-0">
          <div className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/40">
            <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-4">
              {searching ? (
                <>
                  <Input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Escape") closeSearch();
                      else if (e.key === "Enter" && results[0]) go(results[0].section.id);
                    }}
                    placeholder={t("settings.searchPlaceholder")}
                    className="h-8 px-2.5"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={t("settings.closeSearch")} onClick={closeSearch}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <DialogTitle className="font-semibold text-sm">{t("settings.title")}</DialogTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7"
                    aria-label={t("settings.searchOption")}
                    title={t("settings.searchOption")}
                    onClick={() => setSearching(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
              {query ? (
                results.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("settings.noMatches", { query })}</p>
                ) : (
                  results.map(result => (
                    <button
                      key={result.key}
                      type="button"
                      onClick={() => go(result.section.id)}
                      className="flex flex-col gap-0.5 rounded-md px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-accent/50 hover:text-accent-foreground"
                    >
                      <span className="text-sm leading-tight">{result.label}</span>
                      <span className="text-[11px] text-muted-foreground/70">{result.sub}</span>
                    </button>
                  ))
                )
              ) : (
                SETTINGS_GROUPS.map(group => {
                  const inGroup = SETTINGS_SECTIONS.filter(s => s.group === group);
                  if (inGroup.length === 0) return null;
                  return (
                    <div key={group} className="flex flex-col gap-1">
                      <span className="mt-2 px-3 pb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground/70 first:mt-0">
                        {t(SETTINGS_GROUP_KEY[group])}
                      </span>
                      {inGroup.map(section => {
                        const Icon = section.icon;
                        return (
                          <button
                            key={section.id}
                            type="button"
                            onClick={() => go(section.id)}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                              section.id === settingsSection
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {t(section.labelKey)}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <Provider>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
                <div className="flex flex-col justify-center">
                  <h3 className="font-semibold text-sm">{t(active.labelKey)}</h3>
                  <p className="text-xs text-muted-foreground">{t(active.helpKey)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {Actions && <Actions />}
                  {Actions && <Separator orientation="vertical" className="h-6" />}
                  <Button variant="ghost" size="icon" aria-label={t("common.close")} onClick={closeSettings}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <Body />
              </div>
            </div>
          </Provider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
