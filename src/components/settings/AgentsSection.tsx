import { useAppStore } from "@/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PROVIDERS } from "@/lib/providers";
import { roleLabel } from "@/lib/labels";
import { formatResetsAt } from "@/lib/quota";
import { AgentDialog } from "@/components/AgentDialog";
import { island } from "@/components/ui/island";
import { AgentConfig } from "@/types";
import { toast } from "@/components/ui/toast";
import { ScanSearch, Bot } from "lucide-react";
import { createDialogContext } from "@/components/settings/section-context";

const AgentDialogCtx = createDialogContext<AgentConfig>();
export const AgentsSectionProvider = AgentDialogCtx.Provider;

/** Header actions: "Autodetectar" and "Nuevo agente". */
export function AgentsSectionActions() {
  const detectBinaries = useAppStore(state => state.detectBinaries);
  const { openCreate } = AgentDialogCtx.useDialogState();

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
      <Button size="sm" onClick={openCreate}>Nuevo agente</Button>
    </div>
  );
}

function AgentCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </Card>
  );
}

/** Body: the agent cards (the header title/help and actions live in the dialog's shared header). */
export function AgentsSection() {
  const config = useAppStore(state => state.config);
  const loaded = useAppStore(state => state.loaded);
  const binaries = useAppStore(state => state.binaries);
  const quotaByProvider = useAppStore(state => state.quota);
  const removeAgent = useAppStore(state => state.removeAgent);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const resetSession = useAppStore(state => state.resetSession);

  const { open, editing, openEdit, openCreate, close } = AgentDialogCtx.useDialogState();

  const handleDelete = async (agent: AgentConfig) => {
    const confirmed = await island.confirm({
      title: "¿Eliminar agente?",
      description: `Se eliminará ${agent.name}.`,
      destructive: true,
    });
    if (confirmed) removeAgent(agent.id);
  };

  if (!loaded) {
    return (
      <div className="flex flex-col gap-4">
        <AgentCardSkeleton />
        <AgentCardSkeleton />
        <AgentCardSkeleton />
      </div>
    );
  }

  if (config.agents.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="Todavía no hay agentes"
        description="Un agente es un CLI de IA (Claude, Antigravity, Copilot…) con un rol dentro del equipo."
        action={{ label: "Creá tu primer agente", onClick: openCreate }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {config.agents.map(a => {
        const parent = config.agents.find(p => p.id === a.parentId);
        const bin = binaries[a.provider];
        const agentQuota = quotaByProvider[a.provider];
        const globalQuotaItem = agentQuota?.status === "ok" ? agentQuota.items.find(i => !i.model) : undefined;
        const modelQuotaItem = agentQuota?.status === "ok" && a.model
          ? agentQuota.items.find(i => i.model === a.model || (a.provider === "antigravity" && a.model!.startsWith(i.model || "___")))
          : undefined;
        const modelExhausted = modelQuotaItem?.resetsAt && modelQuotaItem.resetsAt > Date.now();

        return (
          <Card key={a.id} className="flex flex-col gap-2 p-4" style={{ borderLeft: `4px solid ${a.color || "#888"}` }}>
            <div className="flex items-start justify-between">
              <div className="font-bold">{a.name}</div>
              <div className="flex gap-1">
                <Badge variant="outline">{roleLabel[a.role] || a.role}</Badge>
                <Badge>{PROVIDERS[a.provider]?.label || a.provider}</Badge>
              </div>
            </div>

            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div><span className="font-semibold">Padre:</span> {parent ? parent.name : "Ninguno (raíz)"}</div>
              {a.model && <div><span className="font-semibold">Modelo:</span> {a.model}</div>}
              <div><span className="font-semibold">Auto-aprobar:</span> {a.autoApprove ? "Sí" : "No"}</div>

              <div>
                <span className="font-semibold">CLI: </span>
                {a.provider === "custom" ? (
                  a.customCommand?.program || "No configurado"
                ) : (!bin ? (
                  <span className="font-medium text-destructive">No detectado</span>
                ) : (
                  <span>{bin.path}{bin.version ? ` (${bin.version})` : ""}</span>
                ))}
              </div>

              {globalQuotaItem && (
                <div>
                  <span className="font-semibold">Cuota: </span>
                  {globalQuotaItem.unlimited
                    ? "ilimitado"
                    : globalQuotaItem.percentRemaining !== undefined
                      ? `${Math.round(globalQuotaItem.percentRemaining)}% disponible`
                      : globalQuotaItem.usedPercent !== undefined
                        ? `${100 - globalQuotaItem.usedPercent}% disponible`
                        : globalQuotaItem.note}
                </div>
              )}
              {modelExhausted && (
                <Badge variant="destructive" className="w-fit">
                  Sin cuota hasta {formatResetsAt(modelQuotaItem!.resetsAt)}
                </Badge>
              )}
            </div>

            <div className="mt-auto flex gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => openEdit(a)}>Editar</Button>
              <Button size="sm" variant="outline" onClick={() => currentProjectId && resetSession(a.id, currentProjectId)}>Reiniciar sesión</Button>
              <Button size="sm" variant="destructive" onClick={() => void handleDelete(a)}>Eliminar</Button>
            </div>
          </Card>
        );
      })}

      <AgentDialog
        open={open}
        onOpenChange={(o) => !o && close()}
        agent={editing ?? undefined}
      />
    </div>
  );
}
