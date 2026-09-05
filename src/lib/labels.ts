import { AgentRole, AgentStatus, MessageKind, RunStatus } from "@/types";

export const statusLabel: Record<AgentStatus, string> = {
  idle: "Inactivo",
  working: "Trabajando",
  waiting: "Esperando",
  stopped: "Detenido",
  error: "Error"
};

export const roleLabel: Record<AgentRole, string> = {
  planner: "Planificador",
  implementer: "Implementador",
  reviewer: "Revisor",
  custom: "Personalizado"
};

export const kindLabel: Record<MessageKind, string> = {
  user: "Usuario",
  instruction: "Instrucción",
  text: "Texto",
  tool: "Herramienta",
  delegation: "Delegación",
  result: "Resultado",
  system: "Sistema",
  error: "Error",
  stderr: "Stderr"
};

/** How a run's status shows up on the little colored dot. */
export const runDotStatus: Record<RunStatus, AgentStatus> = {
  running: "working",
  done: "idle",
  error: "error",
  killed: "stopped"
};

export const runStatusLabel: Record<RunStatus, string> = {
  running: "En curso",
  done: "Terminada",
  error: "Error",
  killed: "Detenida"
};
