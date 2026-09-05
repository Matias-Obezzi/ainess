import { useMemo } from "react";
import { ReactFlow, Background, Controls, MiniMap, Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAppStore } from "@/store";
import { AgentNode } from "./AgentNode";
import { AgentConfig } from "@/types";

const nodeTypes = { agent: AgentNode };

export function HierarchyGraph() {
  const config = useAppStore(state => state.config);
  const runtime = useAppStore(state => state.runtime);
  const currentProjectId = useAppStore(state => state.currentProjectId);

  const { nodes, edges } = useMemo(() => {
    const agents = config.agents;
    const roots = agents.filter(a => a.parentId === null);
    
    // BFS to assign levels
    const levels = new Map<string, number>();
    const childrenMap = new Map<string, string[]>();
    
    for (const a of agents) {
      if (a.parentId) {
        if (!childrenMap.has(a.parentId)) childrenMap.set(a.parentId, []);
        childrenMap.get(a.parentId)!.push(a.id);
      }
    }

    const queue: { id: string; level: number }[] = roots.map(r => ({ id: r.id, level: 0 }));
    
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      if (!levels.has(id)) {
        levels.set(id, level);
        const children = childrenMap.get(id) || [];
        for (const childId of children) {
          queue.push({ id: childId, level: level + 1 });
        }
      }
    }

    // Assign x based on level items
    const levelItems = new Map<number, AgentConfig[]>();
    for (const a of agents) {
      const lvl = levels.get(a.id) ?? 0;
      if (!levelItems.has(lvl)) levelItems.set(lvl, []);
      levelItems.get(lvl)!.push(a);
    }

    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    const nodeWidth = 280;
    const nodeHeight = 260;

    for (const [lvl, items] of levelItems.entries()) {
      const totalWidth = items.length * nodeWidth;
      const startX = -totalWidth / 2 + nodeWidth / 2;
      
      items.forEach((a, index) => {
        flowNodes.push({
          id: a.id,
          type: "agent",
          position: { x: startX + index * nodeWidth, y: lvl * nodeHeight },
          data: { agent: a }
        });

        if (a.parentId) {
          const status = currentProjectId ? runtime[currentProjectId]?.[a.id]?.status : "idle";
          flowEdges.push({
            id: `${a.parentId}-${a.id}`,
            source: a.parentId,
            target: a.id,
            animated: status === "working",
            style: { stroke: a.color || "#888" }
          });
        }
      });
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [config.agents, runtime, currentProjectId]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
