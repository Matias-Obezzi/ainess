// The gate for a run that died because Claude Code has no session.
//
// Reactive, never preventive: `claude auth status` costs seconds and almost every run starts fine,
// so nothing is probed beforehand. What opens the screen is a turn that already came back with
// `auth_required`, and the two things that have to happen after it are the whole point of this file:
// a login that works starts that same run again — through `retryRun`, the path the retry button
// already uses — and a cancel leaves the run finished with the sentence that says what happened,
// not with a startup error nobody can act on.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { attachListeners, startRun } from "@/lib/orchestrator";
import { AcpAuthRequiredError } from "@/lib/acp/auth";
import { registerClaudeAuthHost, type ClaudeAuthDecision } from "@/lib/claude-auth";
import { shownRootRuns } from "@/lib/retry";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { useAppStore } from "@/store";
import type { AcpManagedStatus, Project, RunExitEvent } from "@/types";

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));

// The turn never gets off the ground: the adapter answers `auth_required`, which is what the
// session client re-throws as this error. Spawning an agent to produce it would make the test about
// the protocol; what is under test is what the orchestrator does with the answer.
vi.mock("@/lib/acp/session", () => ({
  runAcpPrompt: async () => { throw new AcpAuthRequiredError("Authentication required"); },
}));

/** A managed runtime that is installed and brought an engine with it. */
const MANAGED: AcpManagedStatus = {
  runtimeReady: true,
  adapterReady: true,
  bunVersion: "1.0",
  adapterVersion: "1.0",
  program: "bun",
  args: [],
  installDir: "/acp",
  enginePath: "/acp/node_modules/.bin/claude",
};

const project: Project = {
  id: "p1",
  name: "P1",
  workspaceDir: "C:/p1",
  createdAt: 1,
  agents: [
    { id: "a1", name: "A1", provider: "claude", role: "implementer", parentId: null, autoApprove: true },
  ],
};

describe("the login gate after a run that could not authenticate", () => {
  let unregisterScreen: (() => void) | null = null;
  let exitRun: ((e: RunExitEvent) => void) | null = null;
  /** How many times the engine was asked who it is logged in as. */
  let probes = 0;
  /** What that answer is, flipped by a login that works. */
  let loggedIn = false;

  beforeEach(async () => {
    probes = 0;
    loggedIn = false;
    useAppStore.setState(state => ({
      config: { ...state.config, projects: [project], binaryOverrides: {} },
      currentProjectId: "p1",
      runtime: { p1: { a1: { agentId: "a1", status: "idle", queuedInstructions: [] } } },
      runs: {},
      tasks: {},
      messages: [],
      activeTaskRunId: {},
      terminals: [],
      shells: [{ id: "pwsh", label: "PowerShell", path: "C:/pwsh.exe" }],
      claudeAuth: { status: null, open: false, hasEngine: true, failed: false },
      acpSetup: { open: false },
    }));

    setTransport({
      ...nullTransport,
      spawnRun: async () => {},
      // No managed runtime here: the install gate has nothing to offer and stays out of the way.
      acpManagedStatus: async () => null,
      whichProgram: async (name: string) => (name === "claude" ? "C:/claude.exe" : null),
      exec: async (_program: string, args: string[]) => {
        if (args[0] !== "auth") return { code: 0, stdout: "", stderr: "" };
        probes++;
        return { code: loggedIn ? 0 : 1, stdout: JSON.stringify({ loggedIn }), stderr: "" };
      },
      // EOF is what ends an ACP session, and the adapter exits on it. Answering the exit right here
      // is what the real one does a moment later, and the run cannot close without it.
      closeStdin: async (runId: string) => { exitRun?.({ runId, code: 0, killed: false }); return true; },
      onRunExit: async (h: (e: RunExitEvent) => void) => { exitRun = h; return () => { exitRun = null; }; },
      ptySpawn: async () => {},
    });
    await attachListeners();
  });

  afterEach(() => {
    unregisterScreen?.();
    unregisterScreen = null;
  });

  /** A screen that answers the way the user would, in order; then always cancel. */
  function screenAnswers(...decisions: ClaudeAuthDecision[]) {
    let asked = 0;
    unregisterScreen = registerClaudeAuthHost(question => {
      question.resolve(decisions[asked++] ?? "cancel");
    });
  }

  /**
   * Plays the part of the terminal view: the tab the login opened gets a shell that runs and dies.
   *
   * Nothing renders in a unit test, so no PTY is ever spawned and nobody would mark the tab exited —
   * and `loginWithClaude` waits for exactly that before it believes anything.
   */
  function terminalRunsAndExits(onExit: () => void) {
    const unsubscribe = useAppStore.subscribe(state => {
      const tab = state.terminals.find(t => t.exited === null);
      if (!tab) return;
      unsubscribe();
      onExit();
      useAppStore.getState().markTerminalExited(tab.id, 0);
    });
    return unsubscribe;
  }

  const runs = () => Object.values(useAppStore.getState().runs);
  const replacement = (of: string) => runs().find(r => r.replacesRunId === of);
  const ask = () => startRun({ agentId: "a1", projectId: "p1", prompt: "arreglá el parser", parentRunId: null, round: 0 })!;

  it("opens the screen, logs in, and starts the very run that failed again", async () => {
    screenAnswers("login");
    terminalRunsAndExits(() => { loggedIn = true; });

    const id = ask();
    await vi.waitFor(() => expect(replacement(id)).toBeTruthy());

    const next = replacement(id)!;
    expect(next.prompt).toBe("arreglá el parser");
    expect(next.agentId).toBe("a1");
    // Through `retryRun`: the failed attempt stays in the store, out of the thread, and the request
    // is not written into the conversation a second time.
    expect(useAppStore.getState().runs[id]).toBeTruthy();
    expect(shownRootRuns(runs().filter(r => r.parentRunId === null && r.kind !== "chat")).map(r => r.id)).toEqual([next.id]);
    expect(useAppStore.getState().messages.filter(m => m.kind === "user")).toHaveLength(0);
    expect(useAppStore.getState().claudeAuth.open).toBe(false);
  });

  it("runs the login in a terminal of its own, with the engine it resolved", async () => {
    screenAnswers("login");
    let command: string | undefined;
    terminalRunsAndExits(() => {
      loggedIn = true;
      command = useAppStore.getState().terminals.at(-1)?.command;
    });

    const id = ask();
    await vi.waitFor(() => expect(replacement(id)).toBeTruthy());
    // Quoted, because a resolved path goes through `C:\Program Files` often enough.
    expect(command).toBe('"C:/claude.exe" auth login');
    // The terminal exiting is not proof of anything: the engine is asked afterwards.
    expect(probes).toBe(1);
  });

  it("ends the run with the sentence about the missing session when the user cancels", async () => {
    screenAnswers("cancel");

    const id = ask();
    await vi.waitFor(() => expect(useAppStore.getState().runs[id]?.endedAt).toBeTruthy());

    const run = useAppStore.getState().runs[id];
    expect(run.output).toBe("Claude Code no tiene sesión iniciada.");
    expect(replacement(id)).toBeUndefined();
    expect(useAppStore.getState().claudeAuth.open).toBe(false);
    // Nothing was asked of the engine: the user said no before any login was attempted.
    expect(probes).toBe(0);
  });

  it("asks again when the terminal came back without a session, and gives up when they do", async () => {
    screenAnswers("login", "cancel");
    // The user closed the browser tab: the shell exits all the same and there is still no session.
    terminalRunsAndExits(() => {});

    const id = ask();
    await vi.waitFor(() => expect(useAppStore.getState().runs[id]?.endedAt).toBeTruthy());
    await vi.waitFor(() => expect(useAppStore.getState().claudeAuth.open).toBe(false));

    expect(probes).toBe(1);
    expect(replacement(id)).toBeUndefined();
    expect(useAppStore.getState().runs[id].output).toBe("Claude Code no tiene sesión iniciada.");
  });

  it("offers the managed runtime instead when there is no engine to log in with, and asks again once it is there", async () => {
    let installed = false;
    let ensured = 0;
    // Nothing to log in with until the managed runtime brings its own engine. `attachListeners` is
    // not run again on purpose: the exit handler it registered in `beforeEach` is the one `exitRun`
    // holds, and re-attaching would leave two of them on the same run.
    setTransport({
      ...nullTransport,
      spawnRun: async () => {},
      whichProgram: async () => null,
      acpManagedStatus: async () => (installed ? MANAGED : null),
      acpManagedEnsure: async () => { ensured++; installed = true; return MANAGED; },
      closeStdin: async (runId: string) => { exitRun?.({ runId, code: 0, killed: false }); return true; },
    });

    const engineSeen: boolean[] = [];
    let asked = 0;
    unregisterScreen = registerClaudeAuthHost(question => {
      engineSeen.push(useAppStore.getState().claudeAuth.hasEngine);
      question.resolve(asked++ === 0 ? "install" : "cancel");
    });

    const id = ask();
    await vi.waitFor(() => expect(asked).toBe(2));

    expect(ensured).toBe(1);
    // First with nothing to offer but the install; then with the engine the install brought.
    expect(engineSeen).toEqual([false, true]);
    expect(useAppStore.getState().runs[id]?.output).toBe("Claude Code no tiene sesión iniciada.");
    await vi.waitFor(() => expect(useAppStore.getState().claudeAuth.open).toBe(false));
  });
});
