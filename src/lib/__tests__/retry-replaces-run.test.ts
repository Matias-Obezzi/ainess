// Retrying replaces the run that failed instead of adding another one next to it.
//
// The bug: `RetryRunDialog` went through `submitPrompt`, which writes a `user` message and opens a
// task card for it. So asking for the same work again showed the user their own request repeated,
// an extra bubble under it and a second card on the board — while the run that had failed stayed
// exactly where it was. `retryRun` is the path of its own: no message, no new card, and a run that
// points back at the one it takes the place of.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { attachListeners, retryRun } from "@/lib/orchestrator";
import { shownRootRuns } from "@/lib/retry";
import type { Project, Run, RunExitEvent, Task } from "@/types";

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));

const project: Project = {
  id: "p1",
  name: "P",
  workspaceDir: "C:/p",
  createdAt: 1,
  agents: [
    { id: "a1", name: "Implementador", provider: "claude", role: "implementer", parentId: null, autoApprove: true },
    { id: "a2", name: "Suplente", provider: "claude", role: "implementer", parentId: null, autoApprove: true },
  ],
};

const failed: Run = {
  id: "r1", projectId: "p1", agentId: "a1", parentRunId: null, rootRunId: "r1",
  prompt: "arreglá el parser", status: "error", startedAt: 1000, endedAt: 2000,
  output: "usage limit reached", rawLines: [], childRunIds: [], round: 0, model: "sonnet",
};

const card: Task = {
  id: "t1", projectId: "p1", title: "arreglá el parser", status: "working",
  agentId: "a1", runId: "r1", dependsOn: [], createdAt: 1000, updatedAt: 1000, order: 0, archived: false,
};

const runs = () => Object.values(useAppStore.getState().runs);
const replacement = (of = "r1") => runs().find(r => r.replacesRunId === of);
const cards = () => useAppStore.getState().tasks.p1 ?? [];
const thread = () => shownRootRuns(runs().filter(r => r.parentRunId === null && r.kind !== "chat"));

function setUp(run: Run = failed, tasks: Task[] = [card]) {
  useAppStore.setState({
    runs: { [run.id]: run },
    tasks: { p1: tasks },
    messages: [],
    questions: {},
    approvals: {},
    activeTaskRunId: {},
    runtime: { p1: { a1: { agentId: "a1", status: "error", queuedInstructions: [], currentRunId: run.id } } },
    binaries: { claude: { path: "claude", version: "1" } },
    config: { ...useAppStore.getState().config, projects: [project] },
  } as never);
}

beforeEach(async () => {
  setTransport({
    ...nullTransport,
    spawnRun: async () => {},
    writeFileAbs: async () => {},
    onRunExit: async (h: (e: RunExitEvent) => void) => { void h; return () => {}; },
  } as never);
  await attachListeners();
  setUp();
});

describe("retrying a run", () => {
  it("does not write the user's request into the thread again", () => {
    retryRun("r1", { agentId: "a1" });
    expect(useAppStore.getState().messages.filter(m => m.kind === "user")).toHaveLength(0);
  });

  it("starts the same prompt again, pointing at the run it replaces", () => {
    retryRun("r1", { agentId: "a1", model: "opus" });
    const next = replacement()!;
    expect(next.prompt).toBe("arreglá el parser");
    expect(next.model).toBe("opus");
    expect(next.agentId).toBe("a1");
    // Its own request, not a round of the old one: the retry is where that request restarts.
    expect(next.rootRunId).toBe(next.id);
  });

  it("leaves the failed run in the store, out of the thread", () => {
    retryRun("r1", { agentId: "a1" });
    // Still there — its detail is the only record of why the first attempt failed.
    expect(useAppStore.getState().runs.r1).toBeTruthy();
    expect(thread().map(r => r.id)).toEqual([replacement()!.id]);
  });

  it("does not open a second card: the one that was there moves to the new run", () => {
    retryRun("r1", { agentId: "a1" });
    expect(cards()).toHaveLength(1);
    expect(cards()[0].id).toBe("t1");
    expect(cards()[0].runId).toBe(replacement()!.id);
    expect(cards()[0].status).toBe("working");
  });

  it("takes the card with it when the retry goes to another agent", () => {
    retryRun("r1", { agentId: "a2" });
    expect(cards()).toHaveLength(1);
    expect(cards()[0].agentId).toBe("a2");
    expect(cards()[0].runId).toBe(replacement()!.id);
  });

  // Without this the card would sit at "working" for ever: `taskOnRootFinished` looks it up by the
  // run the project has in flight.
  it("makes the new run the request the project is working on", () => {
    retryRun("r1", { agentId: "a1" });
    expect(useAppStore.getState().activeTaskRunId.p1).toBe(replacement()!.id);
  });

  it("leaves another request that is already in flight alone", () => {
    useAppStore.setState(state => ({ activeTaskRunId: { ...state.activeTaskRunId, p1: "otra" } }));
    retryRun("r1", { agentId: "a1" });
    expect(useAppStore.getState().activeTaskRunId.p1).toBe("otra");
  });

  it("does nothing at all for a run that is not there", () => {
    retryRun("gone", { agentId: "a1" });
    expect(runs()).toHaveLength(1);
  });

  it("works with no card on the board", () => {
    setUp(failed, []);
    retryRun("r1", { agentId: "a1" });
    expect(replacement()).toBeTruthy();
    expect(cards()).toHaveLength(0);
  });
});

/**
 * The same idea in a chat, where the thread draws messages and not runs.
 *
 * Adding a second pair of bubbles would repeat a question the user asked once, so the answer that
 * failed goes back to being the empty pending bubble it was before the run that failed — same id,
 * same place in the conversation — now on the run that is trying again.
 */
describe("retrying a chat answer", () => {
  const chat = {
    id: "c1",
    projectId: "p1",
    name: "Con el implementador",
    mode: "individual" as const,
    participants: [{ agentId: "a1", role: "implementer" }],
    createdAt: 1,
  };

  const chatRun: Run = {
    ...failed, id: "cr1", rootRunId: "cr1", kind: "chat", chatId: "c1", prompt: "¿qué rompió el parser?",
  };

  const messages = () => useAppStore.getState().chatMessages.c1 ?? [];

  beforeEach(() => {
    setUp(chatRun, []);
    useAppStore.setState(state => ({
      config: { ...state.config, chats: [chat] },
      chatMessages: {
        c1: [
          { id: "m1", chatId: "c1", ts: 1, from: "user", text: "¿qué rompió el parser?" },
          { id: "m2", chatId: "c1", ts: 2, from: "a1", text: "usage limit reached", runId: "cr1", status: "error" as const },
        ],
      },
    }));
  });

  it("answers again in the bubble that failed, without adding one", async () => {
    const { retryChatRun } = await import("@/lib/chat");
    retryChatRun("cr1", { agentId: "a1" });

    expect(messages()).toHaveLength(2);
    const answer = messages()[1];
    expect(answer.id).toBe("m2");
    expect(answer.status).toBe("pending");
    expect(answer.text).toBe("");
    expect(answer.runId).toBe(replacement("cr1")!.id);
  });

  it("does not ask the user's question a second time", async () => {
    const { retryChatRun } = await import("@/lib/chat");
    retryChatRun("cr1", { agentId: "a1" });
    expect(messages().filter(m => m.from === "user")).toHaveLength(1);
  });

  it("keeps the chat's own run: same chat, pointing at the attempt it replaces", async () => {
    const { retryChatRun } = await import("@/lib/chat");
    retryChatRun("cr1", { agentId: "a1" });
    const next = replacement("cr1")!;
    expect(next.kind).toBe("chat");
    expect(next.chatId).toBe("c1");
    expect(next.prompt).toBe("¿qué rompió el parser?");
  });

  it("puts the bubble under whoever is answering this time", async () => {
    const { retryChatRun } = await import("@/lib/chat");
    retryChatRun("cr1", { agentId: "a2" });
    expect(messages()[1].from).toBe("a2");
  });

  it("does nothing when that answer is no longer in the conversation", async () => {
    const { retryChatRun } = await import("@/lib/chat");
    useAppStore.setState({ chatMessages: { c1: [] } });
    retryChatRun("cr1", { agentId: "a1" });
    expect(replacement("cr1")).toBeUndefined();
  });
});
