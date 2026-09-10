import { describe, it, expect } from "vitest";
import { useAppStore } from "@/store";
import { loadLanguage } from "@/i18n";
import { isAutonomous, canAutoAnswer, autonomousReport, MAX_AUTO_ANSWERS, type AutonomousReportInput } from "@/lib/autonomous";
import { budgetState, budgetAllowsStart } from "@/lib/budget";
import type { Project, Run, Approval, AgentQuestion } from "@/types";

/** Same helper shape as budget.test.ts, so a run stub reads the same way across suites. */
function makeRun(over: Partial<Run> = {}): Run {
  return {
    id: "r1",
    projectId: "p1",
    agentId: "a1",
    parentRunId: null,
    rootRunId: "r1",
    prompt: "test",
    status: "done",
    startedAt: 0,
    output: "",
    rawLines: [],
    childRunIds: [],
    round: 0,
    ...over,
  };
}

function makeApproval(over: Partial<Approval> = {}): Approval {
  return {
    id: "ap1",
    projectId: "p1",
    kind: "delegation",
    agentId: "planner",
    summary: "planner → implementer: hacer X",
    payload: { agentId: "implementer", projectId: "p1", prompt: "hacer X", parentRunId: "r1", round: 0 },
    createdAt: 0,
    status: "approved",
    ...over,
  };
}

function makeQuestion(over: Partial<AgentQuestion> = {}): AgentQuestion {
  return {
    id: "q1",
    projectId: "p1",
    agentId: "planner",
    runId: "r1",
    rootRunId: "r1",
    round: 0,
    question: "¿Qué hago con X?",
    options: ["A", "B"],
    multiple: false,
    allowOther: false,
    createdAt: 0,
    status: "answered",
    ...over,
  };
}

/** Real dictionaries, not a mock: `translateNow` reads the store's own language. */
async function withLanguage<T>(language: "es" | "en", body: () => T): Promise<T> {
  await loadLanguage(language);
  const before = useAppStore.getState().config.language;
  useAppStore.setState(state => ({ config: { ...state.config, language } }));
  try {
    return body();
  } finally {
    useAppStore.setState(state => ({ config: { ...state.config, language: before } }));
  }
}

describe("isAutonomous", () => {
  it("is off when the project has no autonomous field", () => {
    const project: Project = { id: "p1", name: "P", workspaceDir: "/x", createdAt: 0, agents: [] };
    expect(isAutonomous(project, 1000)).toBe(false);
  });

  it("is on when until is in the future", () => {
    const project: Project = { id: "p1", name: "P", workspaceDir: "/x", createdAt: 0, agents: [], autonomous: { until: 2000 } };
    expect(isAutonomous(project, 1000)).toBe(true);
  });

  it("is off when until is in the past", () => {
    const project: Project = { id: "p1", name: "P", workspaceDir: "/x", createdAt: 0, agents: [], autonomous: { until: 500 } };
    expect(isAutonomous(project, 1000)).toBe(false);
  });

  it("treats until exactly equal to now as expired, not as still on", () => {
    const project: Project = { id: "p1", name: "P", workspaceDir: "/x", createdAt: 0, agents: [], autonomous: { until: 1000 } };
    expect(isAutonomous(project, 1000)).toBe(false);
  });

  it("is off for undefined project", () => {
    expect(isAutonomous(undefined, 1000)).toBe(false);
  });
});

describe("autonomousReport", () => {
  const empty: AutonomousReportInput = { runs: [], autoApprovals: [], autoAnswers: [], quotaWaits: 0 };

  it("counts finished and failed runs", () => {
    const runs = [
      makeRun({ id: "r1", status: "done" }),
      makeRun({ id: "r2", status: "done" }),
      makeRun({ id: "r3", status: "error" }),
      // Neither finished nor failed: still running, does not belong in either count.
      makeRun({ id: "r4", status: "running" }),
    ];
    const report = autonomousReport({ ...empty, runs });
    expect(report.finished).toBe(2);
    expect(report.failed).toBe(1);
  });

  it("only counts approvals and answers marked auto", () => {
    const autoApprovals = [
      makeApproval({ id: "a1", auto: true, summary: "aprobada sola" }),
      // Approved normally, by the user: not autonomous mode's doing.
      makeApproval({ id: "a2", auto: undefined, summary: "aprobada a mano" }),
    ];
    const autoAnswers = [
      makeQuestion({ id: "q1", auto: true, answer: ["camino conservador"] }),
      makeQuestion({ id: "q2", auto: undefined, answer: ["elegida a mano"] }),
    ];
    const report = autonomousReport({ ...empty, autoApprovals, autoAnswers });
    expect(report.autoApproved).toEqual(["aprobada sola"]);
    expect(report.autoAnswered).toEqual([{ question: "¿Qué hago con X?", instruction: "camino conservador" }]);
  });

  it("carries the quota-wait count through untouched", () => {
    const report = autonomousReport({ ...empty, quotaWaits: 3 });
    expect(report.quotaWaits).toBe(3);
  });

  it("invents no section when there is nothing to report", () => {
    const report = autonomousReport(empty);
    expect(report.finished).toBe(0);
    expect(report.failed).toBe(0);
    expect(report.autoApproved).toEqual([]);
    expect(report.autoAnswered).toEqual([]);
    expect(report.quotaWaits).toBe(0);
    expect(report.lines).toEqual([]);
  });

  it("writes one line per section that actually happened, in Spanish and in English", async () => {
    const input: AutonomousReportInput = {
      runs: [makeRun({ status: "done" }), makeRun({ id: "r2", status: "error" })],
      autoApprovals: [makeApproval({ auto: true, summary: "planner → implementer: hacer X" })],
      autoAnswers: [makeQuestion({ auto: true, question: "¿Qué hago?", answer: ["seguí con lo conservador"] })],
      quotaWaits: 2,
    };
    await withLanguage("es", () => {
      const report = autonomousReport(input);
      expect(report.lines).toHaveLength(4);
      expect(report.lines[0]).toContain("1");
      expect(report.lines.some(l => l.includes("hacer X"))).toBe(true);
      expect(report.lines.some(l => l.includes("¿Qué hago?"))).toBe(true);
      expect(report.lines.some(l => l.includes("2"))).toBe(true);
    });
    await withLanguage("en", () => {
      const report = autonomousReport(input);
      expect(report.lines).toHaveLength(4);
      expect(report.lines[0]).toContain("finished");
    });
  });

  it("skips the tasks line when nothing finished or failed, but keeps the rest", () => {
    const report = autonomousReport({
      runs: [],
      autoApprovals: [makeApproval({ auto: true })],
      autoAnswers: [],
      quotaWaits: 0,
    });
    expect(report.lines).toHaveLength(1);
  });
});

describe("budget gate still applies while autonomous", () => {
  it("a blocked budget refuses to allow a start even when the project is running unattended", () => {
    const project: Project = {
      id: "p1",
      name: "P",
      workspaceDir: "/x",
      createdAt: 0,
      agents: [],
      budget: { dailyUsd: 10, onReached: "block" },
      autonomous: { until: Date.now() + 3_600_000 },
    };
    expect(isAutonomous(project)).toBe(true);

    const now = new Date(2026, 8, 8, 15, 0, 0).getTime();
    const runs = [makeRun({ startedAt: now, usage: { costUsd: 20 } })];
    const state = budgetState(runs, project.budget, now);
    expect(state.exceeded).toBe(true);
    expect(budgetAllowsStart(state, project.budget)).toBe(false);
  });
});

describe("the auto-answer cap", () => {
  const running: Project = {
    id: "p1",
    name: "P",
    workspaceDir: "/x",
    createdAt: 0,
    agents: [],
    autonomous: { until: Date.now() + 3_600_000 },
  };

  it("answers while the task is under the cap", () => {
    expect(canAutoAnswer(running, 0)).toBe(true);
    expect(canAutoAnswer(running, MAX_AUTO_ANSWERS - 1)).toBe(true);
  });

  it("stops at the cap, so a task that only asks questions cannot run all night on them", () => {
    expect(canAutoAnswer(running, MAX_AUTO_ANSWERS)).toBe(false);
    expect(canAutoAnswer(running, MAX_AUTO_ANSWERS + 5)).toBe(false);
  });

  it("never answers for a project that is not running unattended, cap or no cap", () => {
    const supervised: Project = { ...running, autonomous: undefined };
    expect(canAutoAnswer(supervised, 0)).toBe(false);

    const expired: Project = { ...running, autonomous: { until: Date.now() - 1 } };
    expect(canAutoAnswer(expired, 0)).toBe(false);
  });
});
