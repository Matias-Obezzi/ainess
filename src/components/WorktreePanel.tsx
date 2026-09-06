// The worktrees of a project: one row per agent that works on its own branch, with the three
// things the user may want to do with one — open the folder, merge the branch back, delete it.
//
// Everything here that writes to a repo asks first, and the merge refuses to run while either
// side has uncommitted work (src/lib/worktree.ts decides that, not this file).
import { useCallback, useEffect, useState } from "react";
import { FolderOpen, GitMerge, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useAppStore, selectProject, selectProjectAgents, selectProjectWorktrees } from "@/store";
import type { AgentWorktree } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { island } from "@/components/ui/island";
import { confirmDelete } from "@/lib/confirm";
import { revealPath } from "@/lib/open-external";
import { hasUncommittedChanges, mergeWorktree, removeWorktree } from "@/lib/worktree";

/** `null` while it is being read, `undefined` when it could not be read at all. */
type DirtyMap = Record<string, boolean | null | undefined>;

export function WorktreePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const projectId = useAppStore(state => state.currentProjectId);
  const project = useAppStore(state => selectProject(state, state.currentProjectId));
  const agents = useAppStore(state => selectProjectAgents(state, state.currentProjectId));
  const worktrees = useAppStore(state => selectProjectWorktrees(state, state.currentProjectId));
  const repoBranch = useAppStore(state => (state.currentProjectId ? state.repoState[state.currentProjectId]?.status?.branch : null));
  const forgetWorktree = useAppStore(state => state.forgetWorktree);
  const refreshRepoState = useAppStore(state => state.refreshRepoState);

  const [dirty, setDirty] = useState<DirtyMap>({});
  const [reading, setReading] = useState(false);
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<AgentWorktree | null>(null);

  const readDirty = useCallback(async (list: AgentWorktree[]) => {
    if (list.length === 0) return;
    setReading(true);
    const entries = await Promise.all(
      list.map(async w => [w.agentId, (await hasUncommittedChanges(w.path)) ?? undefined] as const)
    );
    setDirty(Object.fromEntries(entries));
    setReading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (projectId) void refreshRepoState(projectId);
    void readDirty(worktrees);
    // Reading every folder again on each render would hammer git: only when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const agentName = (agentId: string) => agents.find(a => a.id === agentId)?.name ?? "Agente eliminado";
  const target = repoBranch || worktrees[0]?.base || "la rama del proyecto";

  const merge = async (worktree: AgentWorktree) => {
    if (!project) return;
    const ok = await island.confirm({
      title: `¿Mergear ${worktree.branch}?`,
      description: `Se va a mergear en ${target}, sin fast-forward. Si quedan conflictos vas a tener que resolverlos a mano en la carpeta del proyecto.`,
      confirmText: "Mergear",
    });
    if (!ok) return;
    setBusyAgentId(worktree.agentId);
    try {
      const result = await mergeWorktree(project, worktree);
      if (result.status === "merged" || result.status === "up-to-date") toast.success(result.message);
      else if (result.status === "conflict") toast.error(result.message);
      else toast.error(result.message);
      if (projectId) void refreshRepoState(projectId);
      void readDirty(worktrees);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAgentId(null);
    }
  };

  const remove = async (worktree: AgentWorktree, deleteBranch: boolean) => {
    if (!project || !projectId) return;
    const ok = await confirmDelete(
      "el worktree",
      agentName(worktree.agentId),
      deleteBranch
        ? `Se borran la carpeta ${worktree.path} y la rama ${worktree.branch}, con todo lo que no esté mergeado.`
        : `Se borra la carpeta ${worktree.path}. La rama ${worktree.branch} queda.`,
    );
    if (!ok) return;
    setBusyAgentId(worktree.agentId);
    try {
      const result = await removeWorktree(project, worktree, { deleteBranch });
      if (result.ok) {
        forgetWorktree(projectId, worktree.agentId);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAgentId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Worktrees</DialogTitle>
            <DialogDescription>
              Cada agente con worktree trabaja en su propia rama, en una carpeta hermana del proyecto. Vos decidís
              qué pasa con esa rama cuando termina.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
            {worktrees.length === 0 ? (
              <EmptyState
                icon={GitMerge}
                title="Todavía no hay worktrees"
                description="Activá «Trabajar en su propio worktree» en un agente: la carpeta se crea en su primera corrida."
              />
            ) : (
              <div className="flex flex-col gap-2 py-2">
                {worktrees.map(worktree => {
                  const busy = busyAgentId === worktree.agentId;
                  const state = dirty[worktree.agentId];
                  return (
                    <div key={worktree.agentId} className="rounded-lg border border-border p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">{agentName(worktree.agentId)}</span>
                            {state === true && (
                              <Badge variant="outline" className="border-amber-500/40 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400">
                                sin commitear
                              </Badge>
                            )}
                            {state === false && (
                              <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
                                limpio
                              </Badge>
                            )}
                            {state === undefined && !reading && (
                              <Badge variant="outline" className="border-destructive/40 px-1.5 py-0 text-[10px] text-destructive">
                                no se pudo leer
                              </Badge>
                            )}
                          </div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground" title={worktree.branch}>
                            {worktree.branch} <span className="opacity-60">· desde {worktree.base}</span>
                          </div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground" title={worktree.path}>
                            {worktree.path}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                          <RowAction
                            icon={FolderOpen}
                            label="Abrir carpeta"
                            disabled={busy}
                            onClick={() => {
                              void revealPath(worktree.path).then(ok => {
                                if (!ok) toast.error("No se pudo abrir la carpeta.");
                              });
                            }}
                          />
                          <RowAction
                            icon={GitMerge}
                            label={`Mergear a ${target}`}
                            disabled={busy || !project}
                            onClick={() => void merge(worktree)}
                          />
                          <RowAction
                            icon={Trash2}
                            label="Eliminar"
                            destructive
                            disabled={busy || !project}
                            onClick={() => setToRemove(worktree)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="mt-2 sm:justify-between">
            <Button variant="outline" size="sm" disabled={reading || worktrees.length === 0} onClick={() => void readDirty(worktrees)}>
              {reading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Actualizar estado
            </Button>
            <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RemoveWorktreeDialog
        worktree={toRemove}
        agentName={toRemove ? agentName(toRemove.agentId) : ""}
        onOpenChange={open => !open && setToRemove(null)}
        onConfirm={deleteBranch => {
          const worktree = toRemove;
          setToRemove(null);
          if (worktree) void remove(worktree, deleteBranch);
        }}
      />
    </>
  );
}

/** Asks what to do with the branch before the deletion is confirmed. */
function RemoveWorktreeDialog({
  worktree,
  agentName,
  onOpenChange,
  onConfirm,
}: {
  worktree: AgentWorktree | null;
  agentName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (deleteBranch: boolean) => void;
}) {
  const [deleteBranch, setDeleteBranch] = useState(false);

  useEffect(() => {
    if (worktree) setDeleteBranch(false);
  }, [worktree]);

  return (
    <Dialog open={!!worktree} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar el worktree de {agentName}</DialogTitle>
          <DialogDescription>
            Se borra la carpeta <span className="font-mono">{worktree?.path}</span>. El agente vuelve a trabajar en la
            carpeta del proyecto, salvo que le crees otro worktree.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 py-2">
          <Switch checked={deleteBranch} onCheckedChange={setDeleteBranch} id="delete-branch" />
          <Label htmlFor="delete-branch">
            Borrar también la rama <span className="font-mono">{worktree?.branch}</span>
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {/* The ellipsis is honest: the final confirmation still comes, as for anything destructive. */}
          <Button variant="destructive" onClick={() => onConfirm(deleteBranch)}>Eliminar…</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          className={destructive ? "h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" : "h-7 w-7"}
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
