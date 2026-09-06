import { AgentRole, AgentStatus, MessageKind, RunStatus } from "@/types";

/** How a run's status shows up on the little colored dot. */
export const runDotStatus: Record<RunStatus, AgentStatus> = {
  running: "working",
  done: "idle",
  error: "error",
  killed: "stopped"
};

// ---- Translated versions of the maps above ----
// The maps stay as plain Spanish for the code that has not been moved to `useT` yet; these give
// the dictionary key for each value, so a component can do `t(statusLabelKey[status])`.

export const statusLabelKey: Record<AgentStatus, string> = {
  idle: "label.status.idle",
  working: "label.status.working",
  waiting: "label.status.waiting",
  stopped: "label.status.stopped",
  error: "label.status.error"
};

export const roleLabelKey: Record<AgentRole, string> = {
  planner: "label.role.planner",
  implementer: "label.role.implementer",
  reviewer: "label.role.reviewer",
  custom: "label.role.custom"
};

export const kindLabelKey: Record<MessageKind, string> = {
  user: "label.kind.user",
  instruction: "label.kind.instruction",
  text: "label.kind.text",
  tool: "label.kind.tool",
  delegation: "label.kind.delegation",
  result: "label.kind.result",
  system: "label.kind.system",
  error: "label.kind.error",
  stderr: "label.kind.stderr"
};

export const runStatusLabelKey: Record<RunStatus, string> = {
  running: "label.runStatus.running",
  done: "label.runStatus.done",
  error: "label.runStatus.error",
  killed: "label.runStatus.killed"
};
