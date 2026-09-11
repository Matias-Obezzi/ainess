import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AgentAvatar } from "@/components/ProviderLogo";
import { AgentDialog } from "@/components/AgentDialog";
import { pickWorkspaceDir } from "@/lib/pick-dir";
import { projectNameFromDir } from "@/lib/home-start";
import { useAppStore, cloneAgents } from "@/store";
import { PROVIDERS } from "@/lib/providers";
import { roleLabelKey } from "@/lib/labels";
import { useT } from "@/i18n/useT";
import { AgentConfig, Project, Budget } from "@/types";
import { Pencil, Plus, Trash2 } from "lucide-react";

/** Value of the formation select when the project starts with no agents at all. */
const NO_FORMATION = "__none__";

export function ProjectDialog({
  isOpen,
  onOpenChange,
  editProject,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editProject?: Project;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [color, setColor] = useState("#4f8cff");
  const [formationId, setFormationId] = useState<string>(NO_FORMATION);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);
  const [dailyUsd, setDailyUsd] = useState("");
  const [monthlyUsd, setMonthlyUsd] = useState("");
  const [onReached, setOnReached] = useState<"warn" | "block">("warn");
  const store = useAppStore();
  const formations = useAppStore(state => state.config.formations);
  const defaultFormationId = useAppStore(state => state.config.defaultFormationId);

  useEffect(() => {
    if (!isOpen) return;
    setEditingAgent(null);
    if (editProject) {
      setName(editProject.name);
      setWorkspaceDir(editProject.workspaceDir);
      setColor(editProject.color || "#4f8cff");
      setDailyUsd(editProject.budget?.dailyUsd ? String(editProject.budget.dailyUsd) : "");
      setMonthlyUsd(editProject.budget?.monthlyUsd ? String(editProject.budget.monthlyUsd) : "");
      setOnReached(editProject.budget?.onReached ?? "warn");
      // The team of an existing project is managed from its hierarchy, not from here.
      setFormationId(NO_FORMATION);
      setAgents([]);
      return;
    }
    setName("");
    setWorkspaceDir("");
    setColor("#4f8cff");
    setDailyUsd("");
    setMonthlyUsd("");
    setOnReached("warn");
    const initial = defaultFormationId && formations.some(f => f.id === defaultFormationId) ? defaultFormationId : NO_FORMATION;
    setFormationId(initial);
    const formation = formations.find(f => f.id === initial);
    setAgents(formation ? cloneAgents(formation.agents) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editProject]);

  /** Picking a formation refills the list, dropping whatever was edited before. */
  const pickFormation = (value: string) => {
    setFormationId(value);
    const formation = formations.find(f => f.id === value);
    setAgents(formation ? cloneAgents(formation.agents) : []);
  };

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

  const handleSelectDir = async () => {
    const selected = await pickWorkspaceDir();
    if (!selected) return;
    setWorkspaceDir(selected);
    if (!name) {
      const folder = projectNameFromDir(selected);
      if (folder) setName(folder);
    }
  };

  const handleSave = () => {
    if (!name || !workspaceDir) return;

    const dUsd = parseFloat(dailyUsd);
    const mUsd = parseFloat(monthlyUsd);
    const hasDaily = !Number.isNaN(dUsd) && dUsd > 0;
    const hasMonthly = !Number.isNaN(mUsd) && mUsd > 0;
    const budget: Budget | undefined = (hasDaily || hasMonthly) ? {
      dailyUsd: hasDaily ? dUsd : undefined,
      monthlyUsd: hasMonthly ? mUsd : undefined,
      onReached,
    } : undefined;

    if (editProject) {
      store.updateProject(editProject.id, { name, workspaceDir, color, budget });
    } else {
      // What the user left in the list is the team, formation or not.
      store.addProject({ name, workspaceDir, color, agents, budget });
      const newP = useAppStore.getState().config.projects.find(p => p.name === name && p.workspaceDir === workspaceDir);
      if (newP) store.setCurrentProject(newP.id);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{editProject ? t("sidebar.editProject") : t("sidebar.newProject")}</DialogTitle>
        </DialogHeader>

        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("projectDialog.folder")}</Label>
              <div className="flex gap-2">
                <Input value={workspaceDir} readOnly placeholder={t("projectDialog.folderPlaceholder")} />
                <Button type="button" variant="outline" onClick={handleSelectDir}>{t("projectDialog.browse")}</Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("common.name")}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("projectDialog.namePlaceholder")} />
            </div>

            <div className="grid gap-2">
              <Label>{t("projectDialog.color")}</Label>
              <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-16 h-8 p-1" />
            </div>

            <div className="grid gap-2">
              <Label>{t("budget.title")}</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">{t("budget.daily")}</span>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={dailyUsd}
                    onChange={e => setDailyUsd(e.target.value)}
                    placeholder={t("budget.none")}
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">{t("budget.monthly")}</span>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={monthlyUsd}
                    onChange={e => setMonthlyUsd(e.target.value)}
                    placeholder={t("budget.none")}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("budget.onReached")}</Label>
              <Select value={onReached} onValueChange={(v: "warn" | "block") => setOnReached(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warn">{t("budget.onReached.warn")}</SelectItem>
                  <SelectItem value="block">{t("budget.onReached.block")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("budget.hint")}</p>
            </div>

            {/* Only when creating: an existing project's team is managed from its hierarchy. */}
            {!editProject && (
              <>
                <div className="grid gap-2">
                  <Label>{t("projectDialog.formation")}</Label>
                  <Select value={formationId} onValueChange={pickFormation}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_FORMATION}>{t("agents.noAgents")}</SelectItem>
                      {formations.map(f => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.id === defaultFormationId ? t("projectDialog.defaultFormation", { name: f.name }) : f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>{t("projectDialog.team")}</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => { setEditingAgent(null); setAgentDialogOpen(true); }}
                    >
                      <Plus className="mr-1 size-3" /> {t("agents.addAgent")}
                    </Button>
                  </div>

                  {agents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("projectDialog.noAgentsHint")}
                    </p>
                  ) : (
                    /* `min-w-0`: the rows are a grid item, and a grid track is sized to its
                       min-content — which for a nowrap line is the whole line, however long the
                       model id and the parent make it. Without this the dialog grew a horizontal
                       scrollbar and pushed its own buttons off the edge. */
                    <ul className="flex min-w-0 flex-col gap-2">
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
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              aria-label={t("agents.editNamed", { name: a.name })}
                              onClick={() => { setEditingAgent(a); setAgentDialogOpen(true); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
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
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={!name || !workspaceDir}>{t("common.save")}</Button>
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
