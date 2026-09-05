import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/store";
import type { SettingsSection } from "@/store";
import { AgentsPanel } from "@/components/AgentsPanel";
import { ResourceSection } from "@/components/ResourcesPanel";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { cn } from "@/lib/utils";
import { Settings2, Bot, User, ListChecks, Sparkles, Plug, Webhook, FileText, Smartphone } from "lucide-react";
import { RemotePanel } from "@/components/RemotePanel";

const SECTIONS: Array<{ id: SettingsSection; label: string; help: string; icon: typeof Settings2 }> = [
  { id: "general", label: "General", help: "Segundo plano, notificaciones y orquestación.", icon: Settings2 },
  { id: "agents", label: "Agentes", help: "Los agentes disponibles y su jerarquía.", icon: Bot },
  { id: "profile", label: "Perfil", help: "Información que se inyecta en el prompt del sistema.", icon: User },
  { id: "presets", label: "Órdenes", help: "Prompts predefinidos para lanzar tareas rápido.", icon: ListChecks },
  { id: "skills", label: "Skills", help: "Habilidades reutilizables para los agentes.", icon: Sparkles },
  { id: "mcp", label: "MCP", help: "Servidores MCP disponibles para los agentes.", icon: Plug },
  { id: "hooks", label: "Hooks", help: "Acciones automáticas en eventos del orquestador.", icon: Webhook },
  { id: "context", label: "Contexto", help: "Texto compartido agregado al system prompt de todos los agentes.", icon: FileText },
  { id: "remote", label: "Remoto", help: "Acceso desde el celular en la misma red local.", icon: Smartphone },
];

/** Configuración, as a modal with an internal sidebar of sections (replaces the old settings screen). */
export function SettingsDialog() {
  const settingsOpen = useAppStore(state => state.settingsOpen);
  const settingsSection = useAppStore(state => state.settingsSection);
  const openSettings = useAppStore(state => state.openSettings);
  const closeSettings = useAppStore(state => state.closeSettings);

  const active = SECTIONS.find(s => s.id === settingsSection) ?? SECTIONS[0];

  const sections = {
    general: <GeneralSettings />,
    agents: <AgentsPanel />,
    remote: <RemotePanel />,
  }

  return (
    <Dialog open={settingsOpen} onOpenChange={(o) => !o && closeSettings()}>
      <DialogContent className="p-0 gap-0 w-[92vw] max-w-6xl h-[85vh] overflow-hidden flex flex-col sm:max-w-6xl">
        <div className="flex h-full min-h-0">
          <div className="w-56 shrink-0 bg-muted/40 border-r border-border flex flex-col">
            <div className="h-14 shrink-0 flex items-center px-4 border-b border-border">
              <DialogTitle className="font-semibold text-sm">Configuración</DialogTitle>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
              {SECTIONS.map(s => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openSettings(s.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors",
                      s.id === settingsSection
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between h-14 shrink-0 px-6 border-b border-border">
              <div className="flex flex-col justify-center">
                <h3 className="font-semibold text-sm">{active.label}</h3>
                <p className="text-xs text-muted-foreground">{active.help}</p>
              </div>
              {/* ACA VAN BOTONES ESPECIFICOS POR SECCION ACTIVA */}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {sections[settingsSection as keyof typeof sections] ?? <ResourceSection section={settingsSection} />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
