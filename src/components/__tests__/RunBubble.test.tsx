// "The partial answers an agent gives while it works are lost when the activity ends, and it only
// shows the last thing it said."
//
// The bubble used to show only `run.output`, losing everything streamed before. It now displays
// both the streamed transcript and the final output (when it adds new information), deduplicating
// when output matches stream, and hiding final output while running.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, resetStore } from "@/test/render";
import { useAppStore } from "@/store";
import { RunBubble } from "../shell/OrchestratorThread";
import type { AgentConfig, CommMessage, Project, Run } from "@/types";

const PROJECT_ID = "p1";
const AGENT_ID = "a1";
const RUN_ID = "r1";

const agent: AgentConfig = {
  id: AGENT_ID,
  name: "Implementer",
  provider: "claude",
  role: "implementer",
  parentId: null,
  autoApprove: false,
};

const project: Project = {
  id: PROJECT_ID,
  name: "Test Project",
  workspaceDir: "C:/work",
  createdAt: 1,
  agents: [agent],
};

function baseRun(over: Partial<Run> = {}): Run {
  return {
    id: RUN_ID,
    projectId: PROJECT_ID,
    agentId: AGENT_ID,
    parentRunId: null,
    rootRunId: RUN_ID,
    prompt: "Investigate problem",
    status: "done",
    startedAt: 1000,
    endedAt: 2000,
    output: "Resumen.",
    rawLines: [],
    childRunIds: [],
    round: 0,
    ...over,
  };
}

function textMessage(text: string, runId = RUN_ID): CommMessage {
  return {
    id: `m-${Math.random()}`,
    ts: 1500,
    projectId: PROJECT_ID,
    fromAgentId: AGENT_ID,
    runId,
    kind: "text",
    text,
  };
}

describe("RunBubble", () => {
  beforeEach(() => {
    resetStore();
    useAppStore.setState(state => ({
      config: {
        ...state.config,
        projects: [project],
      },
    }));
  });

  it("shows both the streamed transcript and final output when done", () => {
    const run = baseRun({ status: "done", output: "Resumen." });
    useAppStore.setState({
      messages: [textMessage("Lo que encontré antes.", run.id)],
    });

    render(<RunBubble run={run} />);

    expect(screen.getByText("Lo que encontré antes.")).toBeInTheDocument();
    expect(screen.getByText("Resumen.")).toBeInTheDocument();
  });

  it("shows output only once when output is identical to the streamed text", () => {
    const text = "Lo que encontré antes.";
    const run = baseRun({ status: "done", output: text });
    useAppStore.setState({
      messages: [textMessage(text, run.id)],
    });

    render(<RunBubble run={run} />);

    const matchingElements = screen.getAllByText(text);
    expect(matchingElements).toHaveLength(1);
  });

  it("does not show output when the run is still running", () => {
    const run = baseRun({ status: "running", output: "Resumen." });
    useAppStore.setState({
      messages: [textMessage("En progreso...", run.id)],
    });

    render(<RunBubble run={run} />);

    expect(screen.queryByText("Resumen.")).not.toBeInTheDocument();
  });
});
