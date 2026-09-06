// The dependency graph: the same tasks as the board, laid out in layers, with an arrow from every
// prerequisite to the task that waits for it. Same look as the hierarchy board (HierarchyGraph.tsx):
// dotted background, no attribution, no minimap.
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAppStore, selectTasks, selectAgent } from "@/store";
import { AgentAvatar } from "@/components/ProviderLogo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { blockedBy, EMPTY_TASK_FILTER, filterTasks, isFiltering, layoutTaskGraph, TASK_NODE_HEIGHT, TASK_NODE_WIDTH, type TaskFilter } from "@/lib/tasks";
import { taskStatusMeta } from "./task-meta";
import { cn } from "@/lib/utils";
import type { Task } from "@/types";
import { Ban, ListTodo, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useT } from "@/i18n/useT";

const FIT_VIEW_OPTIONS = { padding: 0.2 } as const;

const HANDLE_STYLE = { width: 8, height: 8, border: "none", background: "var(--muted-foreground)" } as const;

interface TaskNodeData extends Record<string, unknown> {
  task: Task;
  blocked: number;
}

function TaskGraphNode({ data }: NodeProps<Node<TaskNodeData>>) {
  const t = useT();
  const { task, blocked } = data;
  const agent = useAppStore(state => (task.agentId ? selectAgent(state, task.agentId) : undefined));
  const meta = taskStatusMeta[task.status];

  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl border-2 bg-card p-2.5 text-card-foreground shadow-sm"
      style={{ width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT, borderColor: meta.color }}
    >
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <div className="flex items-start gap-2">
        {agent ? (
          <AgentAvatar provider={agent.provider} color={agent.color} size={22} />
        ) : (
          <span className="mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full border border-dashed border-border" />
        )}
        <p className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug">{task.title}</p>
      </div>
      {task.branch && <p className="truncate font-mono text-[10px] text-muted-foreground">{task.branch}</p>}
      <div className="mt-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
        <span className="truncate">{t(meta.labelKey)}</span>
        {blocked > 0 && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-400">
            <Ban className="h-3 w-3" /> {blocked}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    </div>
  );
}

const nodeTypes = { task: TaskGraphNode };

interface TaskGraphProps {
  projectId: string;
  /** Same view filter as the board, so both views count the same work. */
  filter?: TaskFilter;
  onOpenTask(id: string): void;
  onNewTask(): void;
}

export function TaskGraph(props: TaskGraphProps) {
  return (
    <ReactFlowProvider>
      <TaskGraphBoard {...props} />
    </ReactFlowProvider>
  );
}

function TaskGraphBoard({ projectId, filter = EMPTY_TASK_FILTER, onOpenTask, onNewTask }: TaskGraphProps) {
  const t = useT();
  const all = useAppStore(state => selectTasks(state, projectId));
  const linkTaskDependency = useAppStore(state => state.linkTaskDependency);
  const containerRef = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // The archive belongs to the board; the graph only shows live work, and only what passes the filter.
  const tasks = useMemo(() => filterTasks(all.filter(task => !task.archived), filter), [all, filter]);
  const positions = useMemo(() => layoutTaskGraph(tasks), [tasks]);
  const blocked = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      if (task.dependsOn.length > 0) map.set(task.id, blockedBy(task, tasks).length);
    }
    return map;
  }, [tasks]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TaskNodeData>>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(
      tasks.map(task => ({
        id: task.id,
        type: "task",
        position: positions[task.id] ?? { x: 0, y: 0 },
        data: { task, blocked: blocked.get(task.id) ?? 0 },
      }))
    );
  }, [tasks, positions, blocked, setNodes]);

  useEffect(() => {
    const known = new Set(tasks.map(t => t.id));
    const next: Edge[] = [];
    for (const task of tasks) {
      for (const depId of task.dependsOn) {
        if (!known.has(depId)) continue;
        const done = tasks.find(t => t.id === depId)?.status;
        const satisfied = done === "ready" || done === "done";
        const color = satisfied ? taskStatusMeta.ready.color : taskStatusMeta["needs-you"].color;
        next.push({
          id: `${depId}-${task.id}`,
          source: depId,
          target: task.id,
          type: "smoothstep",
          style: { stroke: color, strokeOpacity: 0.7, strokeWidth: satisfied ? 1.5 : 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        });
      }
    }
    setEdges(next);
  }, [tasks, setEdges]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    // The arrow goes from the prerequisite to the task, so the target is the one that depends.
    if (!linkTaskDependency(connection.target, connection.source)) {
      toast.error(t("tasks.cycle"));
    }
  }, [linkTaskDependency]);

  const taskCount = tasks.length;
  useEffect(() => {
    if (taskCount === 0) return;
    const timer = window.setTimeout(() => void fitView(FIT_VIEW_OPTIONS), 0);
    return () => window.clearTimeout(timer);
  }, [taskCount, fitView]);

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

  if (tasks.length === 0) {
    return isFiltering(filter) ? (
      <EmptyState icon={ListTodo} title={t("tasks.noMatches")} description={t("tasks.noMatchesBody")} />
    ) : (
      <EmptyState
        icon={ListTodo}
        title={t("tasks.empty.title")}
        description={t("tasks.graphEmpty.body")}
        action={{ label: t("tasks.new"), onClick: onNewTask }}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onNodeClick={(_, node) => onOpenTask(node.id)}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable
        nodesConnectable
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>

      <div className="absolute right-3 top-3 flex gap-0.5 rounded-lg border border-border bg-card/90 p-0.5 shadow-sm backdrop-blur">
        <ToolbarButton label={t("tasks.fitView")} onClick={() => void fitView({ ...FIT_VIEW_OPTIONS, duration: 200 })}>
          <Maximize2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t("tasks.zoomIn")} onClick={() => zoomIn({ duration: 150 })}>
          <ZoomIn className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t("tasks.zoomOut")} onClick={() => zoomOut({ duration: 150 })}>
          <ZoomOut className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} className="h-7 w-7" onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
