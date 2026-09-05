import { useMemo, useState } from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Check, X } from "lucide-react";

/** Pending approvals of the current project (or all projects when `all` is set). */
export function ApprovalsPanel({ all = false }: { all?: boolean }) {
  const approvals = useAppStore(state => state.approvals);
  const agents = useAppStore(state => state.config.agents);
  const projects = useAppStore(state => state.config.projects);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const approve = useAppStore(state => state.approve);
  const reject = useAppStore(state => state.reject);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const pending = useMemo(
    () => Object.values(approvals)
      .filter(a => a.status === "pending" && (all || a.projectId === currentProjectId))
      .sort((a, b) => a.createdAt - b.createdAt),
    [approvals, all, currentProjectId],
  );
  if (pending.length === 0) return null;

  const name = (id?: string) => agents.find(a => a.id === id)?.name ?? id ?? "";
  const projectName = (id: string) => projects.find(p => p.id === id)?.name ?? id;

  return (
    <Card className="p-3 border-amber-500/60 bg-amber-500/5 flex flex-col gap-2">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <ShieldCheck className="h-4 w-4 text-amber-500" />
        {pending.length === 1 ? "1 delegación espera tu aprobación" : `${pending.length} delegaciones esperan tu aprobación`}
      </div>
      {pending.map(a => (
        <div key={a.id} className="rounded-md border border-border bg-card p-2 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{name(a.agentId)} → {name(a.toAgentId)}</Badge>
            {all && <Badge variant="secondary">{projectName(a.projectId)}</Badge>}
            <span>{new Date(a.createdAt).toLocaleTimeString("es-AR", { hour12: false })}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap">{a.payload.prompt}</div>
          {a.payload.model && <div className="text-xs text-muted-foreground">Modelo: {a.payload.model}</div>}
          <div className="flex gap-2 items-center">
            <Input
              className="h-8 text-xs flex-1"
              placeholder="Nota opcional (el agente la recibe si rechazás)"
              value={notes[a.id] ?? ""}
              onChange={e => setNotes({ ...notes, [a.id]: e.target.value })}
            />
            <Button size="sm" className="h-8" onClick={() => void approve(a.id, notes[a.id] || undefined)}>
              <Check className="h-4 w-4 mr-1" /> Aprobar
            </Button>
            <Button size="sm" variant="destructive" className="h-8" onClick={() => void reject(a.id, notes[a.id] || undefined)}>
              <X className="h-4 w-4 mr-1" /> Rechazar
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
