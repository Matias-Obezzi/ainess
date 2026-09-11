// What a project's own verification commands do to the card of the run they checked.
//
// Until now a card moved forward because the agent's process exited zero. These are the rules for
// the project getting a say: which runs are checked at all, and where the card lands afterwards.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { verificationFor, taskOnVerified } from "@/lib/task-sync";
import { createTask } from "@/lib/tasks";
import type { AgentConfig, Project, Run, VerifyCommand } from "@/types";

const PROJECT = "p1";

const agent = (over: Partial<AgentConfig> = {}): AgentConfig => ({
  id: "a1",
  name: "Implementer",
  provider: "claude",
  role: "implementer",
  parentId: "planner",
  autoApprove: true,
  ...over,
});

const verifyCommand = (over: Partial<VerifyCommand> = {}): VerifyCommand => ({
  id: "v1",
  label: "test",
  program: "npm",
  args: ["test"],
  ...over,
});

const run = (over: Partial<Run> = {}): Run => ({
  id: "r1",
  projectId: PROJECT,
  agentId: "a1",
  parentRunId: "root",
  rootRunId: "root",
  prompt: "do the thing",
  status: "done",
  startedAt: 1,
  output: "done",
  rawLines: [],
  childRunIds: [],
  round: 0,
  ...over,
});

/** Puts one project, one team and one card pointing at the run into the store. */
function seed(opts: { verify?: VerifyCommand[]; agents?: AgentConfig[] } = {}) {
  const project: Project = {
    id: PROJECT,
    name: "thing",
    workspaceDir: "C:/work/thing",
    createdAt: 1,
    agents: opts.agents ?? [agent()],
    ...(opts.verify ? { verify: opts.verify } : {}),
  };
  useAppStore.setState(state => ({
    config: { ...state.config, projects: [project] },
    tasks: { [PROJECT]: [createTask({ id: "t1", projectId: PROJECT, title: "the card", status: "in-review", runId: "r1" })] },
  }));
}

const cardStatus = () => useAppStore.getState().tasks[PROJECT][0].status;
const cardDetail = () => useAppStore.getState().tasks[PROJECT][0].detail ?? "";

describe("verificationFor", () => {
  beforeEach(() => seed({ verify: [verifyCommand()] }));

  it("gives the project's commands for delegated work that finished", () => {
    expect(verificationFor(run())).toHaveLength(1);
  });

  // A chat with the planner is a conversation; running a test suite because someone asked a
  // question would be a surprise.
  it("checks nothing when the run is not delegated work", () => {
    expect(verificationFor(run({ parentRunId: null }))).toEqual([]);
  });

  it("checks nothing when the run did not finish cleanly", () => {
    expect(verificationFor(run({ status: "error" }))).toEqual([]);
    expect(verificationFor(run({ status: "killed" }))).toEqual([]);
  });

  it("checks nothing when the project declared no commands", () => {
    seed({});
    expect(verificationFor(run())).toEqual([]);
  });

  it("checks nothing for a project that is not there", () => {
    expect(verificationFor(run({ projectId: "gone" }))).toEqual([]);
  });
});

describe("taskOnVerified", () => {
  it("sends the card on when everything passed and nobody reviews", () => {
    seed({ verify: [verifyCommand()] });
    taskOnVerified(run(), { ok: true });
    expect(cardStatus()).toBe("ready");
  });

  // The machine checking does not replace the person: a project with a reviewer still gets one.
  it("hands the card to the reviewer when there is one", () => {
    seed({ verify: [verifyCommand()], agents: [agent(), agent({ id: "rev", name: "Reviewer", role: "reviewer" })] });
    taskOnVerified(run(), { ok: true });
    expect(cardStatus()).toBe("in-review");
  });

  it("brings the card back to you when a command failed, with what it printed", () => {
    seed({ verify: [verifyCommand()] });
    taskOnVerified(run(), { ok: false, failed: { label: "test", code: 1, output: "2 failing" } });
    expect(cardStatus()).toBe("needs-you");
    expect(cardDetail()).toContain("test");
    expect(cardDetail()).toContain("2 failing");
  });

  it("keeps whatever the card already said", () => {
    seed({ verify: [verifyCommand()] });
    useAppStore.getState().updateTask("t1", { detail: "the original brief" });
    taskOnVerified(run(), { ok: false, failed: { label: "test", code: 1, output: "boom" } });
    expect(cardDetail()).toContain("the original brief");
    expect(cardDetail()).toContain("boom");
  });

  // The board is a view of the work and never a gate on it.
  it("does nothing, and does not throw, when no card points at the run", () => {
    seed({ verify: [verifyCommand()] });
    expect(() => taskOnVerified(run({ id: "other" }), { ok: false })).not.toThrow();
    expect(cardStatus()).toBe("in-review");
  });
});
