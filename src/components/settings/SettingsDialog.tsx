import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/store";
import type { SettingsSection } from "@/store";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import { GeneralSection } from "@/components/settings/GeneralSection";
import { AgentsSection, AgentsSectionActions, AgentsSectionProvider } from "@/components/settings/AgentsSection";
import { ProfileSection, ProfileSectionActions, ProfileSectionProvider } from "@/components/settings/ProfileSection";
import { PresetsSection, PresetsSectionActions, PresetsSectionProvider } from "@/components/settings/PresetsSection";
import { SkillsSection, SkillsSectionActions, SkillsSectionProvider } from "@/components/settings/SkillsSection";
import { McpSection, McpSectionActions, McpSectionProvider } from "@/components/settings/McpSection";
import { HooksSection, HooksSectionActions, HooksSectionProvider } from "@/components/settings/HooksSection";
import { ContextSection, ContextSectionActions, ContextSectionProvider } from "@/components/settings/ContextSection";
import { RemoteSection } from "@/components/settings/RemoteSection";
import { DiagnosticsSection } from "@/components/settings/DiagnosticsSection";
import { AboutSection } from "@/components/settings/AboutSection";
import { useT } from "@/i18n/useT";
import {
  SETTINGS_SECTIONS_META,
  SETTINGS_GROUPS,
  SETTINGS_GROUP_KEY,
  type SettingsSectionMeta,
} from "@/components/settings/sections";

// Re-export group types so consumers don't need a separate import.
export type { SettingsGroup } from "@/components/settings/sections";
export { SETTINGS_GROUPS, SETTINGS_GROUP_KEY } from "@/components/settings/sections";

/** The React-specific part of a section (components only SettingsDialog needs). */
interface SectionUI {
  component: ComponentType;
  actions?: ComponentType;
  provider?: ComponentType<{ children: ReactNode }>;
}

/**
 * Full merged shape used inside SettingsDialog (declarative meta + React components).
 * Kept private to this file — the rest of the app only needs SettingsSectionMeta from sections.ts.
 */
export type SettingsSectionDef = SettingsSectionMeta & SectionUI;

/**
 * Map from section id to its React pieces. TypeScript enforces all eleven ids are covered:
 * adding a section in sections.ts without wiring it here causes a compile error.
 */
const SECTION_UI: Record<SettingsSection, SectionUI> = {
  general:     { component: GeneralSection },
  agents:      { component: AgentsSection,    actions: AgentsSectionActions,   provider: AgentsSectionProvider },
  profile:     { component: ProfileSection,   actions: ProfileSectionActions,  provider: ProfileSectionProvider },
  presets:     { component: PresetsSection,   actions: PresetsSectionActions,  provider: PresetsSectionProvider },
  skills:      { component: SkillsSection,    actions: SkillsSectionActions,   provider: SkillsSectionProvider },
  mcp:         { component: McpSection,       actions: McpSectionActions,      provider: McpSectionProvider },
  hooks:       { component: HooksSection,     actions: HooksSectionActions,    provider: HooksSectionProvider },
  context:     { component: ContextSection,   actions: ContextSectionActions,  provider: ContextSectionProvider },
  remote:      { component: RemoteSection },
  diagnostics: { component: DiagnosticsSection },
  about:       { component: AboutSection },
};

/** The full list used by the dialog's sidebar and search — order from sections.ts. */
export const SETTINGS_SECTIONS: SettingsSectionDef[] = SETTINGS_SECTIONS_META.map(meta => ({
  ...meta,
  ...SECTION_UI[meta.id],
}));

const PassThrough = ({ children }: { children: ReactNode }) => children;

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
