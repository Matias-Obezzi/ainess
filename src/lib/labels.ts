import { AgentRole, AgentStatus, MessageKind } from "@/types";

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
