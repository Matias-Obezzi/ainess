import type { ComponentType, ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/store";
import type { SettingsSection } from "@/store";
import { cn } from "@/lib/utils";
import { Settings2, Bot, User, ListChecks, Sparkles, Plug, Webhook, FileText, Smartphone, Info, X, type LucideIcon } from "lucide-react";
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

export interface SettingsSectionDef {
  id: SettingsSection;
  label: string;
  help: string;
  icon: LucideIcon;
  /** Body of the section. */
  component: ComponentType;
  /** Header actions (buttons) rendered right of the title, before the close button. */
  actions?: ComponentType;
  /** Wraps both `actions` and `component` when they share state (e.g. a "new/edit" dialog). */
  provider?: ComponentType<{ children: ReactNode }>;
}

const PassThrough = ({ children }: { children: ReactNode }) => children;

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: "general", label: "General", help: "Segundo plano, notificaciones y orquestación.", icon: Settings2, component: GeneralSection },
  { id: "agents", label: "Agentes", help: "Los agentes disponibles y su jerarquía.", icon: Bot, component: AgentsSection, actions: AgentsSectionActions, provider: AgentsSectionProvider },
  { id: "profile", label: "Perfil", help: "Información que se inyecta en el prompt del sistema.", icon: User, component: ProfileSection, actions: ProfileSectionActions, provider: ProfileSectionProvider },
  { id: "presets", label: "Órdenes", help: "Prompts predefinidos para lanzar tareas rápido.", icon: ListChecks, component: PresetsSection, actions: PresetsSectionActions, provider: PresetsSectionProvider },
  { id: "skills", label: "Skills", help: "Habilidades reutilizables para los agentes.", icon: Sparkles, component: SkillsSection, actions: SkillsSectionActions, provider: SkillsSectionProvider },
  { id: "mcp", label: "MCP", help: "Servidores MCP disponibles para los agentes.", icon: Plug, component: McpSection, actions: McpSectionActions, provider: McpSectionProvider },
  { id: "hooks", label: "Hooks", help: "Acciones automáticas en eventos del orquestador.", icon: Webhook, component: HooksSection, actions: HooksSectionActions, provider: HooksSectionProvider },
  { id: "context", label: "Contexto", help: "Texto compartido agregado al system prompt de todos los agentes.", icon: FileText, component: ContextSection, actions: ContextSectionActions, provider: ContextSectionProvider },
  { id: "remote", label: "Remoto", help: "Acceso desde el celular en la misma red local.", icon: Smartphone, component: RemoteSection },
  { id: "about", label: "Acerca de", help: "Versión, actualizaciones y archivos de log.", icon: Info, component: AboutSection },
];

/** Configuración, as a modal with an internal sidebar of sections (replaces the old settings screen). */
export function SettingsDialog() {
  const settingsOpen = useAppStore(state => state.settingsOpen);
  const settingsSection = useAppStore(state => state.settingsSection);
  const openSettings = useAppStore(state => state.openSettings);
  const closeSettings = useAppStore(state => state.closeSettings);

  const active = SETTINGS_SECTIONS.find(s => s.id === settingsSection) ?? SETTINGS_SECTIONS[0];
  const Provider = active.provider ?? PassThrough;
  const Actions = active.actions;
  const Body = active.component;

  return (
    <Dialog open={settingsOpen} onOpenChange={(o) => !o && closeSettings()}>
      <DialogContent showCloseButton={false} className="flex h-[85vh] w-[92vw] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="flex h-full min-h-0">
          <div className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/40">
            <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
              <DialogTitle className="font-semibold text-sm">Configuración</DialogTitle>
            </div>
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
              {SETTINGS_SECTIONS.map(s => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openSettings(s.id)}
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
