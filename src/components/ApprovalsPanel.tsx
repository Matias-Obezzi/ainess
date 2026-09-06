import { useMemo, useState } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Check, Copy, X, ChevronDown, ChevronRight } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ContextActionItems, type MenuAction } from "@/components/menu-actions";
import { copyText } from "@/lib/clipboard";
import { Markdown } from "@/components/shell/Markdown";
import { truncate } from "@/lib/format";
import type { Approval } from "@/types";

/** First non-empty line of the delegated task, for the collapsed row. */
function firstLine(text: string): string {
  const line = text.split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0) ?? "";
  return truncate(line.replace(/^#+\s*/, ""), 140);
}

/** Pending approvals of the current project (or all projects when `all` is set). */
export function ApprovalsPanel({ all = false }: { all?: boolean }) {
  const approvals = useAppStore(state => state.approvals);
  const agents = useAppStore(selectAllAgents);
  const projects = useAppStore(state => state.config.projects);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const approve = useAppStore(state => state.approve);
  const reject = useAppStore(state => state.reject);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const pending = useMemo(
    () => Object.values(approvals)
      .filter(a => a.status === "pending" && (all || a.projectId === currentProjectId))
      .sort((a, b) => a.createdAt - b.createdAt),
    [approvals, all, currentProjectId],
  );
  if (pending.length === 0) return null;

  const name = (id?: string) => agents.find(a => a.id === id)?.name ?? (id ? "Agente anterior" : "");
  const projectName = (id: string) => projects.find(p => p.id === id)?.name ?? id;

  const approvalActions = (a: Approval): MenuAction[] => [
    { key: "approve", label: "Aprobar", icon: Check, onSelect: () => void approve(a.id, notes[a.id] || undefined) },
    {
      key: "copy",
      label: "Copiar la tarea",
      icon: Copy,
      onSelect: () => void copyText(a.payload.prompt, "Tarea copiada"),
    },
    {
      key: "reject",
      label: "Rechazar",
      icon: X,
      destructive: true,
      separatorBefore: true,
      onSelect: () => void reject(a.id, notes[a.id] || undefined),
    },
  ];

  return (
    // Capped: a delegated brief can be pages long and must never push the thread off screen.
    <Card className="p-3 border-amber-500/60 bg-amber-500/5 flex flex-col gap-2 max-h-[45vh] overflow-y-auto">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <ShieldCheck className="h-4 w-4 text-amber-500" />
        {pending.length === 1 ? "1 delegación espera tu aprobación" : `${pending.length} delegaciones esperan tu aprobación`}
      </div>
      {pending.map(a => (
        <ContextMenu key={a.id}>
          <ContextMenuTrigger asChild>
            <div className="rounded-md border border-border bg-card p-2 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{name(a.agentId)} → {name(a.toAgentId)}</Badge>
                {all && <Badge variant="secondary">{projectName(a.projectId)}</Badge>}
                <span>{new Date(a.createdAt).toLocaleTimeString("es-AR", { hour12: false })}</span>
              </div>
              <button
                type="button"
                className="flex items-start gap-1.5 text-left text-sm hover:text-foreground"
                onClick={() => setExpanded(e => ({ ...e, [a.id]: !e[a.id] }))}
                aria-expanded={!!expanded[a.id]}
              >
                {expanded[a.id] ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                <span className={expanded[a.id] ? "font-medium" : "line-clamp-2"}>
                  {expanded[a.id] ? "Tarea delegada" : firstLine(a.payload.prompt)}
                </span>
                {!expanded[a.id] && (
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {a.payload.prompt.split(/\r?\n/).length} líneas
                  </span>
                )}
              </button>
              {expanded[a.id] && (
                <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-background/60 px-3 py-2">
                  <Markdown text={a.payload.prompt} className="text-xs" />
                </div>
              )}
              {a.payload.model && <div className="text-xs text-muted-foreground">Modelo: {a.payload.model}</div>}
              <div className="flex gap-2 items-center">
                <Input
                  className="h-8 text-xs flex-1"
                  placeholder="Nota opcional (el agente la recibe si rechazás)"
                  value={notes[a.id] ?? ""}
                  onChange={e => setNotes({ ...notes, [a.id]: e.target.value })}
                  // Inside a field the right click belongs to the browser, for pasting.
                  onContextMenu={e => e.stopPropagation()}
                />
                <Button size="sm" className="h-8" onClick={() => void approve(a.id, notes[a.id] || undefined)}>
                  <Check className="h-4 w-4 mr-1" /> Aprobar
                </Button>
                <Button size="sm" variant="destructive" className="h-8" onClick={() => void reject(a.id, notes[a.id] || undefined)}>
                  <X className="h-4 w-4 mr-1" /> Rechazar
                </Button>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextActionItems actions={approvalActions(a)} />
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </Card>
  );
}
