// Configuración → Equipos: the saved teams a new project can start from. The agents themselves
// belong to each project and are managed from its hierarchy board; what lives here is the
// `Formation` list — the same type as always, only named "team" in front of the user.
import { useEffect, useState } from "react";
import { useAppStore, cloneAgents, nextAgentName } from "@/store";
import { AgentAvatar } from "@/components/ProviderLogo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PROVIDERS } from "@/lib/providers";
import { roleLabelKey } from "@/lib/labels";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";
import { confirmDelete } from "@/lib/confirm";
import { AgentDialog } from "@/components/AgentDialog";
import { AgentConfig, Formation } from "@/types";
import { Bookmark, Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { createDialogContext } from "@/components/settings/section-context";

const FormationDialogCtx = createDialogContext<Formation>();
export const TeamsSectionProvider = FormationDialogCtx.Provider;

/** Header action: "Nuevo equipo". */
export function TeamsSectionActions() {
  const t = useT();
  const { openCreate } = FormationDialogCtx.useDialogState();

  return (
    <Button size="sm" onClick={openCreate}>{t("agents.newFormation")}</Button>
  );
}

/** Summary line of a team: how many agents and from which providers. */
function useFormationSummary(): (formation: Formation) => string {
  const t = useT();
  return (formation: Formation) => {
    const n = formation.agents.length;
    if (n === 0) return t("agents.noAgents");
    const providers = [...new Set(formation.agents.map(a => PROVIDERS[a.provider]?.label || a.provider))].join(", ");
    return plural(n, t("agents.summary.one", { n, providers }), t("agents.summary.other", { n, providers }));
  };
}

/** Creates or edits a team: its name and the agents it carries. */
export function FormationDialog({
  open,
  onOpenChange,
  formation
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formation?: Formation | null;
}) {
  const t = useT();
  const upsertFormation = useAppStore(state => state.upsertFormation);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);

  useEffect(() => {
    if (!open) return;
    setId(formation?.id ?? crypto.randomUUID());
    setName(formation?.name ?? "");
    setDescription(formation?.description ?? "");
    setAgents(formation ? formation.agents.map(a => ({ ...a })) : []);
    setEditingAgent(null);
  }, [open, formation]);

  const saveAgent = (agent: AgentConfig) => {
    setAgents(prev => (prev.some(a => a.id === agent.id) ? prev.map(a => (a.id === agent.id ? agent : a)) : [...prev, agent]));
  };

  const removeAgent = (agentId: string) => {
    setAgents(prev => {
      const target = prev.find(a => a.id === agentId);
      return prev
        .filter(a => a.id !== agentId)
        .map(a => (a.parentId === agentId ? { ...a, parentId: target?.parentId ?? null } : a));
    });
  };

  const save = () => {
    if (!name.trim()) return;
    upsertFormation({ id, name: name.trim(), description: description.trim() || undefined, agents });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{formation ? t("agents.editFormation") : t("agents.newFormation")}</DialogTitle>
        </DialogHeader>

        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          <div className="flex flex-col gap-4 py-2">
            <div className="grid gap-2">
              <Label>{t("common.name")}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("agents.namePlaceholder")} />
            </div>
            <div className="grid gap-2">
              <Label>{t("agents.descriptionOptional")}</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} />
            </div>

            <div className="flex items-center justify-between">
              <Label>{t("settings.section.agents")}</Label>
              <Button size="sm" variant="outline" onClick={() => { setEditingAgent(null); setAgentDialogOpen(true); }}>
                <Plus className="mr-1 size-3" /> {t("agents.addAgent")}
              </Button>
            </div>

            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("agents.emptyFormationHint")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {agents.map(a => {
                  const parent = agents.find(p => p.id === a.parentId);
                  return (
                    <li key={a.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                      <AgentAvatar provider={a.provider} color={a.color} size={22} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{a.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {PROVIDERS[a.provider]?.label || a.provider} · {t(roleLabelKey[a.role]) || a.role}
                          {a.model ? ` · ${a.model}` : ""} · {parent ? t("agents.underParent", { name: parent.name }) : t("agents.root")}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={t("agents.editNamed", { name: a.name })}
                        onClick={() => { setEditingAgent(a); setAgentDialogOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t("agents.removeNamed", { name: a.name })}
                        onClick={() => removeAgent(a.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={!name.trim()}>{t("common.save")}</Button>
        </DialogFooter>

        <AgentDialog
          open={agentDialogOpen}
          onOpenChange={setAgentDialogOpen}
          agent={editingAgent ?? undefined}
          agents={agents}
          onSave={saveAgent}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Body: the saved teams, one card each. The section is one thing, so it needs no heading of its own. */
export function TeamsSection() {
  const t = useT();
  const formationSummary = useFormationSummary();
  const loaded = useAppStore(state => state.loaded);
  const formations = useAppStore(state => state.config.formations);
  const defaultFormationId = useAppStore(state => state.config.defaultFormationId);
  const upsertFormation = useAppStore(state => state.upsertFormation);
  const removeFormation = useAppStore(state => state.removeFormation);
  const setDefaultFormation = useAppStore(state => state.setDefaultFormation);

  const { open, editing, openEdit, openCreate, close } = FormationDialogCtx.useDialogState();

  // Before the config is read the list is empty, and an empty list here means "you have no teams":
  // two placeholders rather than an empty state that is about to be contradicted.
  if (!loaded) {
    return (
      <div className="flex flex-col gap-3" data-testid="teams-section">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const duplicate = (formation: Formation) => {
    upsertFormation({
      ...formation,
      id: crypto.randomUUID(),
      name: nextAgentName(formations, formation.name),
      agents: cloneAgents(formation.agents),
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="teams-section">
      {formations.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={t("agents.emptyFormations.title")}
          description={t("agents.emptyFormations.body")}
          action={{ label: t("agents.emptyFormations.action"), onClick: openCreate }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {formations.map(f => (
            <Card key={f.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    {f.name}
                    {f.id === defaultFormationId && <Badge variant="secondary">{t("agents.default")}</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">{formationSummary(f)}</div>
                  {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
                </div>
                <div className="flex shrink-0 -space-x-1">
                  {f.agents.slice(0, 5).map(a => (
                    <AgentAvatar key={a.id} provider={a.provider} color={a.color} size={22} />
                  ))}
                </div>
              </div>

              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(f)}>
                  <Pencil className="mr-1 size-3" /> {t("common.edit")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => duplicate(f)}>
                  <Copy className="mr-1 size-3" /> {t("agentActions.duplicate")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={f.id === defaultFormationId}
                  onClick={() => setDefaultFormation(f.id)}
                >
                  <Check className="mr-1 size-3" /> {t("agents.default")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void confirmDelete(t("agents.deleteFormation"), f.name).then(ok => ok && removeFormation(f.id))}
                >
                  <Trash2 className="mr-1 size-3" /> {t("common.delete")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <FormationDialog open={open} onOpenChange={(o) => !o && close()} formation={editing} />
    </div>
  );
}
