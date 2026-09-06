// One table for how a task status looks and reads, so the board, the cards and the graph can never
// drift apart. `color` is a plain hex because React Flow paints edges and borders with inline SVG.
import type { TaskStatus } from "@/types";

export interface TaskStatusMeta {
  label: string;
  /** Tailwind classes for the little dot on a card. */
  dot: string;
  /** Hex used for graph node borders and edges. */
  color: string;
}

export const taskStatusMeta: Record<TaskStatus, TaskStatusMeta> = {
  backlog: { label: "Pendiente", dot: "bg-slate-400", color: "#94a3b8" },
  working: { label: "Trabajando", dot: "bg-emerald-500 animate-pulse", color: "#22c55e" },
  "needs-you": { label: "Necesita tu atención", dot: "bg-amber-500", color: "#f59e0b" },
  "in-review": { label: "En revisión", dot: "bg-violet-500", color: "#8b5cf6" },
  ready: { label: "Listo", dot: "bg-sky-500", color: "#38bdf8" },
  done: { label: "Hecho", dot: "bg-slate-500", color: "#64748b" },
};
