// The hierarchy board: who reports to whom, who is working on what, and a side inspector with
// the live activity of the selected agent. Layout is computed here (no dagre): levels by depth,
// and every group of children centered under its parent.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAppStore, selectProjectAgents, selectProjectWorktrees } from "@/store";
import { AgentNode } from "./AgentNode";
import { AgentDialog } from "./AgentDialog";
import { AgentInspector } from "./shell/AgentInspector";
import { WorktreePanel } from "./WorktreePanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Bookmark, Crosshair, GitBranch, Maximize2, Network, Plus, ZoomIn, ZoomOut } from "lucide-react";
import type { AgentStatus } from "@/types";

const nodeTypes = { agent: AgentNode };

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 190;
export const GAP_X = 40;
export const GAP_Y = 90;
const ROW_Y = NODE_HEIGHT + GAP_Y;

const FIT_VIEW_OPTIONS = { padding: 0.2 } as const;

export interface LayoutAgent {
  id: string;
  parentId: string | null;
}

/**
 * Position of every agent in the tree: `y` by depth, `x` so each parent sits centered over the
 * block its descendants occupy. Orphans (a `parentId` that no longer exists) and any node caught
 * in a cycle are laid out as extra roots, so nothing ever disappears from the board.
 */
export function layoutAgents(agents: LayoutAgent[]): Record<string, { x: number; y: number }> {
  const byId = new Map(agents.map(a => [a.id, a]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];

  for (const a of agents) {
    if (a.parentId && a.parentId !== a.id && byId.has(a.parentId)) {
      const list = children.get(a.parentId);
      if (list) list.push(a.id);
      else children.set(a.parentId, [a.id]);
    } else {
      roots.push(a.id);
    }
  }

  const cache = new Map<string, number>();
  const width = (id: string, seen: Set<string>): number => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return NODE_WIDTH;
    seen.add(id);
    const kids = children.get(id) ?? [];
    let value = NODE_WIDTH;
    if (kids.length > 0) {
      const total = kids.reduce((sum, k) => sum + width(k, seen), 0) + GAP_X * (kids.length - 1);
      value = Math.max(NODE_WIDTH, total);
    }
    seen.delete(id);
    cache.set(id, value);
    return value;
  };
  const subtreeWidth = (id: string) => width(id, new Set());

  const positions: Record<string, { x: number; y: number }> = {};
  const placed = new Set<string>();

  const place = (id: string, level: number, left: number) => {
    if (placed.has(id)) return;
    placed.add(id);
    const own = subtreeWidth(id);
    positions[id] = { x: left + (own - NODE_WIDTH) / 2, y: level * ROW_Y };

    const kids = children.get(id) ?? [];
    if (kids.length === 0) return;
    const block = kids.reduce((sum, k) => sum + subtreeWidth(k), 0) + GAP_X * (kids.length - 1);
    let cursor = left + (own - block) / 2;
    for (const kid of kids) {
      place(kid, level + 1, cursor);
      cursor += subtreeWidth(kid) + GAP_X;
    }
  };

  let cursor = 0;
  for (const id of roots) {
    place(id, 0, cursor);
    cursor += subtreeWidth(id) + GAP_X;
  }
  for (const a of agents) {
    if (placed.has(a.id)) continue;
    place(a.id, 0, cursor);
    cursor += subtreeWidth(a.id) + GAP_X;
  }

  // Center the whole board around x = 0 so `fitView` has nothing lopsided to correct.
  const shift = -(cursor - GAP_X) / 2;
  for (const key of Object.keys(positions)) positions[key].x += shift;
  return positions;
}

export function HierarchyGraph() {
  return (
    <ReactFlowProvider>
      <HierarchyBoard />
    </ReactFlowProvider>
  );
}

function HierarchyBoard() {
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const agents = useAppStore(state => selectProjectAgents(state, state.currentProjectId));
  const runtime = useAppStore(state => state.runtime);
  const projectName = useAppStore(state => state.config.projects.find(p => p.id === state.currentProjectId)?.name);
  const worktrees = useAppStore(state => selectProjectWorktrees(state, state.currentProjectId));

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formationOpen, setFormationOpen] = useState(false);
  const [worktreesOpen, setWorktreesOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const projectRuntime = currentProjectId ? runtime[currentProjectId] : undefined;
  const statusOf = useCallback(
    (agentId: string): AgentStatus => projectRuntime?.[agentId]?.status ?? "idle",
    [projectRuntime]
  );

  const positions = useMemo(() => layoutAgents(agents), [agents]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  // Rebuild the nodes whenever the roster changes (a drag only moves them until then).
  useEffect(() => {
    setNodes(
      agents.map(agent => ({
        id: agent.id,
        type: "agent",
        position: positions[agent.id] ?? { x: 0, y: 0 },
        data: { agent }
      }))
    );
  }, [agents, positions, setNodes]);

  useEffect(() => {
    const next: (Edge & { pathOptions?: { borderRadius?: number } })[] = [];
    for (const agent of agents) {
      if (!agent.parentId || !agents.some(a => a.id === agent.parentId)) continue;
      const status = statusOf(agent.id);
      const working = status === "working";
      const color = agent.color || "#888888";
      next.push({
        id: `${agent.parentId}-${agent.id}`,
        source: agent.parentId,
        target: agent.id,
        type: "smoothstep",
        pathOptions: { borderRadius: 12 },
        animated: working,
        style: { stroke: color, strokeOpacity: 0.7, strokeWidth: working ? 2.5 : 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        ...(working || status === "waiting"
          ? {
              label: "delegado",
              labelStyle: { fill: "var(--muted-foreground)", fontSize: 10 },
              labelBgStyle: { fill: "var(--card)" },
              labelBgPadding: [4, 2] as [number, number],
              labelBgBorderRadius: 4
            }
          : {})
      });
    }
    setEdges(next);
  }, [agents, statusOf, setEdges]);

  const clearSelection = useCallback(() => {
    setSelectedAgentId(null);
    setNodes(prev => (prev.some(n => n.selected) ? prev.map(n => (n.selected ? { ...n, selected: false } : n)) : prev));
  }, [setNodes]);

  // Re-frame when the roster or the available width changes (the right dock takes 380px).
  const agentCount = agents.length;
  useEffect(() => {
    if (agentCount === 0) return;
    const timer = window.setTimeout(() => void fitView(FIT_VIEW_OPTIONS), 0);
    return () => window.clearTimeout(timer);
  }, [agentCount, fitView]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let lastWidth = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (Math.abs(element.clientWidth - lastWidth) < 8) return;
      lastWidth = element.clientWidth;
      void fitView({ ...FIT_VIEW_OPTIONS, duration: 200 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitView]);

  const counts = useMemo(() => {
    let working = 0;
    let waiting = 0;
    for (const agent of agents) {
      const status = statusOf(agent.id);
      if (status === "working") working++;
      else if (status === "waiting") waiting++;
    }
    return { working, waiting, idle: agents.length - working - waiting };
  }, [agents, statusOf]);

  const workingIds = useMemo(
    () => agents.filter(a => statusOf(a.id) === "working").map(a => ({ id: a.id })),
    [agents, statusOf]
  );

  const selectedAgent = agents.find(a => a.id === selectedAgentId) ?? null;

  if (agents.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmptyState
          icon={Network}
          title="Este proyecto todavía no tiene agentes"
          description="La jerarquía muestra quién delega a quién. Agregá el primero para empezar."
          action={{ label: "Agregar agente", onClick: () => setCreateOpen(true) }}
        />
        <AgentDialog open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => setSelectedAgentId(node.id)}
        onPaneClick={clearSelection}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.4}
        maxZoom={1.5}
        nodesDraggable
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>

      <div className="pointer-events-none absolute left-3 top-3 flex gap-1">
        <CountBadge
          label="trabajando"
          count={counts.working}
          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          pulse={counts.working > 0}
        />
        <CountBadge
          label="esperando"
          count={counts.waiting}
          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        />
        <CountBadge label="inactivos" count={counts.idle} className="border-border bg-card text-muted-foreground" />
      </div>

      {!selectedAgent && (
        <div className="absolute right-3 top-3 flex gap-0.5 rounded-lg border border-border bg-card/90 p-0.5 shadow-sm backdrop-blur">
          <ToolbarButton label="Agregar agente" disabled={!currentProjectId} onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Guardar como formación"
            disabled={!currentProjectId}
            onClick={() => setFormationOpen(true)}
          >
            <Bookmark className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label={worktrees.length > 0 ? `Worktrees (${worktrees.length})` : "Worktrees"}
            disabled={!currentProjectId}
            onClick={() => setWorktreesOpen(true)}
          >
            <GitBranch className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Ajustar vista" onClick={() => void fitView({ ...FIT_VIEW_OPTIONS, duration: 200 })}>
            <Maximize2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Centrar en el activo"
            disabled={workingIds.length === 0}
            onClick={() => void fitView({ ...FIT_VIEW_OPTIONS, duration: 200, nodes: workingIds, maxZoom: 1.2 })}
          >
            <Crosshair className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Acercar" onClick={() => zoomIn({ duration: 150 })}>
            <ZoomIn className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Alejar" onClick={() => zoomOut({ duration: 150 })}>
            <ZoomOut className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
      )}

      {selectedAgent && <AgentInspector agent={selectedAgent} onClose={clearSelection} />}

      <AgentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <WorktreePanel open={worktreesOpen} onOpenChange={setWorktreesOpen} />
      <SaveFormationDialog
        open={formationOpen}
        onOpenChange={setFormationOpen}
        projectId={currentProjectId}
        projectName={projectName}
      />
    </div>
  );
}

/** Keeps the team of this project as a template other projects can start from. */
function SaveFormationDialog({
  open,
  onOpenChange,
  projectId,
  projectName
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  projectName?: string;
}) {
  const saveProjectAsFormation = useAppStore(state => state.saveProjectAsFormation);
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName(projectName ? `Equipo de ${projectName}` : "");
  }, [open, projectName]);

  const save = () => {
    if (!projectId || !name.trim()) return;
    saveProjectAsFormation(projectId, name.trim());
    toast.success(`Formación "${name.trim()}" guardada`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Guardar como formación</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label>Nombre</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && save()}
            placeholder="Ej: Equipo de backend"
          />
          <p className="text-xs text-muted-foreground">
            Vas a poder elegir este equipo al crear un proyecto, desde Configuración → Agentes.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!name.trim()}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CountBadge({
  label,
  count,
  className,
  pulse
}: {
  label: string;
  count: number;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur",
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current opacity-70", pulse && "animate-pulse opacity-100")} />
      {count} {label}
    </span>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
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
          className="h-7 w-7"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
