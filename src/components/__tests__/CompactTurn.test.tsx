// A compaction turn used to be drawn as a bubble the user had typed, and then was hidden
// altogether — which left an automatic compaction restarting an agent's session with nothing said.
// It is now a maintenance note: the state on one line, the app's prompt and the agent's answer
// behind "more details", and a different sentence depending on who asked for it.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, resetStore } from "@/test/render";
import { useAppStore } from "@/store";
import { CompactTurn } from "../shell/OrchestratorThread";
import { translateNow } from "@/i18n/useT";
import type { AgentConfig, Project, Run } from "@/types";

const PROJECT_ID = "p1";
const AGENT_ID = "a1";
const AGENT_NAME = "Implementer";

const agent: AgentConfig = {
  id: AGENT_ID,
  name: AGENT_NAME,
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

const PROMPT = "Rewrite the history file and answer with a single line.";
const ANSWER = "Kept the decisions and the state of each thing.";

function compactRun(over: Partial<Run> = {}): Run {
  return {
    id: "r1",
    projectId: PROJECT_ID,
    agentId: AGENT_ID,
    parentRunId: null,
    rootRunId: "r1",
    prompt: PROMPT,
    status: "done",
    startedAt: 1000,
    endedAt: 2000,
    output: ANSWER,
    rawLines: [],
    childRunIds: [],
    round: 0,
    kind: "compact",
    ...over,
  };
}

const tDetails = translateNow("thread.compact.details");
const tAsked = translateNow("thread.compact.asked");
const tAnswered = translateNow("thread.compact.answered");

describe("CompactTurn", () => {
  beforeEach(() => {
    resetStore();
    useAppStore.setState(state => ({
      config: { ...state.config, projects: [project] },
    }));
  });

  it("starts closed: the state shows, the app's prompt does not", () => {
    render(<CompactTurn run={compactRun()} />);

    expect(screen.getByText(translateNow("thread.compact.done", { name: AGENT_NAME }))).toBeInTheDocument();
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(screen.queryByText(ANSWER)).toBeNull();
  });

  it("shows what was asked and what came back once opened", () => {
    render(<CompactTurn run={compactRun()} />);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(tDetails) }));

    expect(screen.getByText(tAsked)).toBeInTheDocument();
    expect(screen.getByText(PROMPT)).toBeInTheDocument();
    expect(screen.getByText(tAnswered)).toBeInTheDocument();
    expect(screen.getByText(ANSWER)).toBeInTheDocument();
  });

  it("says the app asked for it when the compaction was automatic", () => {
    render(<CompactTurn run={compactRun({ auto: true })} />);

    expect(screen.getByText(translateNow("thread.compact.auto", { name: AGENT_NAME }))).toBeInTheDocument();
    expect(screen.queryByText(translateNow("thread.compact.done", { name: AGENT_NAME }))).toBeNull();
  });

  it("says only that it compacted when the user typed /compact", () => {
    render(<CompactTurn run={compactRun()} />);

    expect(screen.getByText(translateNow("thread.compact.done", { name: AGENT_NAME }))).toBeInTheDocument();
    expect(screen.queryByText(translateNow("thread.compact.auto", { name: AGENT_NAME }))).toBeNull();
  });

  it("leaves out the answer half while the run is still going", () => {
    render(<CompactTurn run={compactRun({ status: "running", output: "", endedAt: undefined })} />);

    expect(screen.getByText(translateNow("thread.compact.running", { name: AGENT_NAME }))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(tDetails) }));
    expect(screen.getByText(tAsked)).toBeInTheDocument();
    expect(screen.queryByText(tAnswered)).toBeNull();
  });

  it("reports a compaction that failed without asking anything of the user", () => {
    render(<CompactTurn run={compactRun({ status: "error", output: "" })} />);

    expect(screen.getByText(translateNow("thread.compact.error", { name: AGENT_NAME }))).toBeInTheDocument();
  });
});
