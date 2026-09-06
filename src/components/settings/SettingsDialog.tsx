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

/** Sidebar groups, in the order they are shown. */
export const SETTINGS_GROUPS = ["General", "Agentes", "Automatización", "Acceso", "Aplicación"] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export interface SettingsSectionDef {
  id: SettingsSection;
  label: string;
  help: string;
  icon: LucideIcon;
  /** Which block of the sidebar it belongs to. */
  group: SettingsGroup;
  /**
   * Names of the individual settings inside the section, so the search finds "puerto" or
   * "notificaciones" and not only the section titles.
   */
  keywords: string[];
  /** Body of the section. */
  component: ComponentType;
  /** Header actions (buttons) rendered right of the title, before the close button. */
  actions?: ComponentType;
  /** Wraps both `actions` and `component` when they share state (e.g. a "new/edit" dialog). */
  provider?: ComponentType<{ children: ReactNode }>;
}

const PassThrough = ({ children }: { children: ReactNode }) => children;

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: "general", label: "General", help: "Segundo plano, notificaciones y orquestación.", group: "General", keywords: ["bandeja", "tray", "segundo plano", "notificaciones", "avisos", "rondas", "orquestación", "aprobaciones", "modelo automático", "logs", "nivel de log", "actualizaciones"], icon: Settings2, component: GeneralSection },
  { id: "agents", label: "Agentes", help: "Los agentes disponibles y su jerarquía.", group: "Agentes", keywords: ["agente", "jerarquía", "proveedor", "modelo", "rol", "planificador", "implementador", "revisor", "padre", "detectar", "autodetectar", "cuota"], icon: Bot, component: AgentsSection, actions: AgentsSectionActions, provider: AgentsSectionProvider },
  { id: "profile", label: "Perfil", help: "Información que se inyecta en el prompt del sistema.", group: "Agentes", keywords: ["nombre", "sobre mí", "preferencias", "system prompt", "perfil"], icon: User, component: ProfileSection, actions: ProfileSectionActions, provider: ProfileSectionProvider },
  { id: "presets", label: "Órdenes", help: "Prompts predefinidos para lanzar tareas rápido.", group: "Automatización", keywords: ["orden", "preset", "prompt predefinido", "atajo"], icon: ListChecks, component: PresetsSection, actions: PresetsSectionActions, provider: PresetsSectionProvider },
  { id: "skills", label: "Skills", help: "Habilidades reutilizables para los agentes.", group: "Automatización", keywords: ["skill", "habilidad", "sugeridas"], icon: Sparkles, component: SkillsSection, actions: SkillsSectionActions, provider: SkillsSectionProvider },
  { id: "mcp", label: "MCP", help: "Servidores MCP disponibles para los agentes.", group: "Automatización", keywords: ["mcp", "servidor", "herramientas", "sugeridos"], icon: Plug, component: McpSection, actions: McpSectionActions, provider: McpSectionProvider },
  { id: "hooks", label: "Hooks", help: "Acciones automáticas en eventos del orquestador.", group: "Automatización", keywords: ["hook", "webhook", "slack", "comando", "evento", "disparador", "automatización"], icon: Webhook, component: HooksSection, actions: HooksSectionActions, provider: HooksSectionProvider },
  { id: "context", label: "Contexto", help: "Texto compartido agregado al system prompt de todos los agentes.", group: "Agentes", keywords: ["contexto compartido", "instrucciones", "system prompt"], icon: FileText, component: ContextSection, actions: ContextSectionActions, provider: ContextSectionProvider },
  { id: "remote", label: "Remoto", help: "Acceso desde el celular en la misma red local.", group: "Acceso", keywords: ["celular", "red local", "puerto", "token", "qr", "túnel", "tunnel", "ngrok", "cloudflared", "dominio", "authtoken", "api key", "url fija"], icon: Smartphone, component: RemoteSection },
  { id: "about", label: "Acerca de", help: "Versión, actualizaciones y archivos de log.", group: "Aplicación", keywords: ["versión", "actualizar", "update", "logs", "diagnóstico", "creador", "repositorio"], icon: Info, component: AboutSection },
];

/** Lowercase and without accents, so "orquestacion" finds "orquestación". */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Configuración, as a modal with an internal sidebar of sections (replaces the old settings screen). */
export function SettingsDialog() {
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

  // The search covers the individual settings too (their `keywords`), so "puerto" lands on Remoto.
  const visible = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return SETTINGS_SECTIONS;
    return SETTINGS_SECTIONS.filter(s =>
      normalize(`${s.group} ${s.label} ${s.help} ${s.keywords.join(" ")}`).includes(needle),
    );
  }, [query]);

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
                      else if (e.key === "Enter" && visible[0]) {
                        openSettings(visible[0].id);
                        closeSearch();
                      }
                    }}
                    placeholder="Buscar una opción…"
                    className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Cerrar la búsqueda" onClick={closeSearch}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <DialogTitle className="font-semibold text-sm">Configuración</DialogTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7"
                    aria-label="Buscar una opción"
                    title="Buscar una opción"
                    onClick={() => setSearching(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
              {visible.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nada coincide con “{query}”.</p>
              )}
              {SETTINGS_GROUPS.map(group => {
                const inGroup = visible.filter(s => s.group === group);
                if (inGroup.length === 0) return null;
                return (
                  <div key={group} className="flex flex-col gap-1">
                    <span className="mt-2 px-3 pb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground/70 first:mt-0">
                      {group}
                    </span>
                    {inGroup.map(s => {
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            openSettings(s.id);
                            closeSearch();
                          }}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                            s.id === settingsSection
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <Provider>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
                <div className="flex flex-col justify-center">
                  <h3 className="font-semibold text-sm">{active.label}</h3>
                  <p className="text-xs text-muted-foreground">{active.help}</p>
                </div>
                <div className="flex items-center gap-2">
                  {Actions && <Actions />}
                  {Actions && <Separator orientation="vertical" className="h-6" />}
                  <Button variant="ghost" size="icon" aria-label="Cerrar" onClick={closeSettings}>
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
