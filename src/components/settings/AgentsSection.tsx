// Configuración → Agentes: what this machine has installed (which CLI, which version, how much
// quota is left) and the formations, the saved teams a new project can start from. The agents
// themselves belong to each project and are managed from its hierarchy board.
import { useEffect, useState } from "react";
import { useAppStore, cloneAgents, nextAgentName } from "@/store";
import { AgentAvatar } from "@/components/ProviderLogo";
import { QuotaRing, useProviderModels } from "@/components/QuotaRing";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PROVIDERS } from "@/lib/providers";
import { roleLabel } from "@/lib/labels";
import { summarizeAgentQuota } from "@/lib/quota-summary";
import { confirmDelete } from "@/lib/confirm";
import { AgentDialog } from "@/components/AgentDialog";
import { AgentConfig, Formation, ProviderId } from "@/types";
import { toast } from "@/components/ui/toast";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@/lib/tauri";
import { Bookmark, Check, Copy, Loader2, Pencil, Plus, RefreshCw, ScanSearch, Trash2 } from "lucide-react";
import { createDialogContext } from "@/components/settings/section-context";

const FormationDialogCtx = createDialogContext<Formation>();
export const AgentsSectionProvider = FormationDialogCtx.Provider;

/** Every provider that can be detected on this machine; "custom" is configured per agent. */
const DETECTABLE = (Object.keys(PROVIDERS) as ProviderId[]).filter(p => p !== "custom");

/** Header actions: "Autodetectar" and "Nueva formación". */
export function AgentsSectionActions() {
  const detectBinaries = useAppStore(state => state.detectBinaries);
  const { openCreate } = FormationDialogCtx.useDialogState();

  const handleAutoDetect = async () => {
    const { found } = await detectBinaries();
    if (found.length > 0) {
      toast.success(`Detectados: ${found.map(p => PROVIDERS[p]?.label || p).join(", ")}`);
    } else {
      toast.info("No se detectó ningún CLI nuevo");
    }
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => void handleAutoDetect()}>
        <ScanSearch className="mr-1 size-4" /> Autodetectar
      </Button>
      <Button size="sm" onClick={openCreate}>Nueva formación</Button>
    </div>
  );
}

function ProviderRowSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-3 w-2/3" />
    </Card>
  );
}

/** One installed (or missing) CLI: where it is, which version and how much quota is left. */
function ProviderRow({ provider }: { provider: ProviderId }) {
  const binary = useAppStore(state => state.binaries[provider]);
  const overrides = useAppStore(state => state.config.binaryOverrides);
  const quota = useAppStore(state => state.quota[provider]);
  const updateConfig = useAppStore(state => state.updateConfig);
  const detectBinaries = useAppStore(state => state.detectBinaries);
  const refreshQuota = useAppStore(state => state.refreshQuota);
  const allModels = useProviderModels(provider);
  const [refreshing, setRefreshing] = useState(false);

  const spec = PROVIDERS[provider];
  const summary = summarizeAgentQuota(quota, { allModels });
  const hasOverride = !!overrides?.[provider];

  const pickExecutable = async () => {
    if (!isTauri()) {
      toast.error("Solo disponible en la app de escritorio");
      return;
    }
    const selected = await openFileDialog({ multiple: false, filters: [{ name: "Ejecutable", extensions: ["exe", "cmd", "bat"] }] });
    if (selected && typeof selected === "string") {
      updateConfig({ binaryOverrides: { ...overrides, [provider]: selected } });
      await detectBinaries();
    }
  };

  const clearOverride = async () => {
    const next = { ...overrides };
    delete next[provider];
    updateConfig({ binaryOverrides: next });
    await detectBinaries();
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshQuota(provider);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <AgentAvatar provider={provider} size={26} />
          {spec?.label || provider}
        </div>
        <div className="flex items-center gap-2">
          {binary?.path
            ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">Detectado</Badge>
            : <Badge variant="outline" className="border-destructive/40 text-destructive">No detectado</Badge>}
          <span className="flex items-center gap-1 text-xs text-muted-foreground" title={summary.detail}>
            <QuotaRing fraction={summary.fraction} label={summary.label} size={14} />
            {summary.label}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
        <div className="break-all">
          {binary?.path
            ? <span>{binary.path}{binary.version ? ` (${binary.version})` : ""}</span>
            : <span>Instalalo o cargá la ruta a mano para poder usarlo.</span>}
        </div>
        <div className="text-xs">Cuota: {summary.detail}</div>
        {hasOverride && <div className="text-xs">Ruta cargada a mano.</div>}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={() => void pickExecutable()}>Cargar a mano</Button>
        {hasOverride && (
          <Button size="sm" variant="ghost" onClick={() => void clearOverride()}>Limpiar override</Button>
        )}
        <Button size="sm" variant="ghost" disabled={refreshing} onClick={() => void refresh()}>
          {refreshing ? <Loader2 className="mr-1 size-3 animate-spin" /> : <RefreshCw className="mr-1 size-3" />}
          Actualizar cuota
        </Button>
      </div>
    </Card>
  );
}

/** Summary line of a formation: how many agents and from which providers. */
function formationSummary(formation: Formation): string {
  if (formation.agents.length === 0) return "Sin agentes";
  const providers = [...new Set(formation.agents.map(a => PROVIDERS[a.provider]?.label || a.provider))];
  return `${formation.agents.length} agente${formation.agents.length === 1 ? "" : "s"} · ${providers.join(", ")}`;
}

/** Creates or edits a formation: its name and the team it carries. */
export function FormationDialog({
  open,
  onOpenChange,
  formation
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formation?: Formation | null;
}) {
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
          <DialogTitle>{formation ? "Editar formación" : "Nueva formación"}</DialogTitle>
        </DialogHeader>

        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          <div className="flex flex-col gap-4 py-2">
            <div className="grid gap-2">
              <Label>Nombre</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Equipo de backend" />
            </div>
            <div className="grid gap-2">
              <Label>Descripción (opcional)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} />
            </div>

            <div className="flex items-center justify-between">
              <Label>Agentes</Label>
              <Button size="sm" variant="outline" onClick={() => { setEditingAgent(null); setAgentDialogOpen(true); }}>
                <Plus className="mr-1 size-3" /> Agregar agente
              </Button>
            </div>

            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Una formación sin agentes crea proyectos vacíos: podés armar el equipo después desde la jerarquía.
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
                          {PROVIDERS[a.provider]?.label || a.provider} · {roleLabel[a.role] || a.role}
                          {a.model ? ` · ${a.model}` : ""} · {parent ? `bajo ${parent.name}` : "raíz"}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={`Editar ${a.name}`}
                        onClick={() => { setEditingAgent(a); setAgentDialogOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Quitar ${a.name}`}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!name.trim()}>Guardar</Button>
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

/** Body: what is installed on this machine, and the saved formations. */
export function AgentsSection() {
  const loaded = useAppStore(state => state.loaded);
  const formations = useAppStore(state => state.config.formations);
  const defaultFormationId = useAppStore(state => state.config.defaultFormationId);
  const upsertFormation = useAppStore(state => state.upsertFormation);
  const removeFormation = useAppStore(state => state.removeFormation);
  const setDefaultFormation = useAppStore(state => state.setDefaultFormation);

  const { open, editing, openEdit, openCreate, close } = FormationDialogCtx.useDialogState();

  if (!loaded) {
    return (
      <div className="flex flex-col gap-4">
        <ProviderRowSkeleton />
        <ProviderRowSkeleton />
        <ProviderRowSkeleton />
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
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">IAs instaladas</h3>
          <p className="text-xs text-muted-foreground">
            Los CLIs que esta máquina puede usar. Los agentes de cada proyecto se arman desde su jerarquía.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {DETECTABLE.map(provider => <ProviderRow key={provider} provider={provider} />)}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">Formaciones</h3>
          <p className="text-xs text-muted-foreground">
            Equipos guardados: al crear un proyecto elegís uno y lo podés editar antes de confirmar.
          </p>
        </div>

        {formations.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="Todavía no hay formaciones"
            description="Una formación es un equipo guardado: el punto de partida de cada proyecto nuevo."
            action={{ label: "Crear una formación", onClick: openCreate }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {formations.map(f => (
              <Card key={f.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold">
                      {f.name}
                      {f.id === defaultFormationId && <Badge variant="secondary">Predeterminada</Badge>}
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
                    <Pencil className="mr-1 size-3" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => duplicate(f)}>
                    <Copy className="mr-1 size-3" /> Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={f.id === defaultFormationId}
                    onClick={() => setDefaultFormation(f.id)}
                  >
                    <Check className="mr-1 size-3" /> Predeterminada
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void confirmDelete("la formación", f.name).then(ok => ok && removeFormation(f.id))}
                  >
                    <Trash2 className="mr-1 size-3" /> Eliminar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <FormationDialog open={open} onOpenChange={(o) => !o && close()} formation={editing} />
    </div>
  );
}
