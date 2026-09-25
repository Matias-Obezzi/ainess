// The gate before a claude run on a machine with nothing to spawn.
//
// Only one machine has to be offered anything: the one where neither `claude-agent-acp` nor `npx` is
// on PATH (see src/lib/acp/adapter.ts). There the run waits behind the setup screen instead of dying
// on a spawn error nobody can read, and — the part that matters here — it waits for the *screen*, not
// for one install: a first attempt that fails and a retry that works still starts the run that asked.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startRun } from "@/lib/orchestrator";
import { useAppStore } from "@/store";
import { nullTransport } from "@/lib/transport-null";
import { setTransport } from "@/lib/transport";
import { forgetAcpAdapter, acpAdapterAvailability } from "@/lib/acp/adapter";
import { registerAcpSetupHost, type AcpSetupDecision } from "@/lib/acp-setup";
import type { AcpManagedStatus, Project } from "@/types";

const READY: AcpManagedStatus = {
  runtimeReady: true,
  adapterReady: true,
  bunVersion: "1.0",
  adapterVersion: "1.0",
  program: "bun",
  args: [],
  installDir: "/acp",
  enginePath: null,
};

const project: Project = {
  id: "p1",
  name: "P1",
  workspaceDir: "C:/p1",
  createdAt: 1,
  agents: [
    { id: "a1", name: "A1", provider: "claude", role: "implementer", parentId: null, autoApprove: true, model: "claude-3-5" },
  ],
};

vi.mock("@/lib/acp/adapter", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/acp/adapter")>();
  return {
    ...actual,
    acpAdapterAvailability: vi.fn(actual.acpAdapterAvailability),
  };
});

describe("the ACP setup gate before a run", () => {
  let unregisterScreen: (() => void) | null = null;

  beforeEach(() => {
    useAppStore.setState({
      config: { ...useAppStore.getState().config, projects: [project] },
      currentProjectId: "p1",
      runtime: { p1: { a1: { agentId: "a1", status: "idle", queuedInstructions: [] } } },
      runs: {},
      messages: [],
      acpSetup: { open: false },
    } as never);
  });

  afterEach(() => {
    unregisterScreen?.();
    unregisterScreen = null;
    forgetAcpAdapter();
    vi.restoreAllMocks();
  });

  /** A screen that answers the error face the way the user would, in order; then always cancel. */
  function screenAnswers(...decisions: AcpSetupDecision[]) {
    let asked = 0;
    unregisterScreen = registerAcpSetupHost(question => {
      question.resolve(decisions[asked++] ?? "cancel");
    });
  }

  const getRun = (id: string) => useAppStore.getState().runs[id];
  const ask = () => startRun({ agentId: "a1", projectId: "p1", prompt: "hola", parentRunId: null, round: 0 })!;

  it("asks nothing when the platform has no managed runtime to offer (the CLI, the phone)", async () => {
    let checked = false;
    let spawned = false;
    setTransport({
      ...nullTransport,
      acpManagedStatus: async () => { checked = true; return null; },
      spawnRun: async () => { spawned = true; },
    });

    const id = ask();
    await vi.waitFor(() => expect(spawned).toBe(true));
    expect(checked).toBe(true);
    expect(useAppStore.getState().acpSetup.open).toBe(false);
    expect(getRun(id).status).not.toBe("killed");
  });

  it("installs behind the screen and then starts the run", async () => {
    let ensureCalls = 0;
    let spawned = false;
    vi.mocked(acpAdapterAvailability).mockResolvedValue({ ready: false, via: "none" });
    setTransport({
      ...nullTransport,
      acpManagedStatus: async () => READY,
      acpManagedEnsure: async () => { ensureCalls++; return READY; },
      spawnRun: async () => { spawned = true; },
    });

    const id = ask();
    await vi.waitFor(() => expect(spawned).toBe(true));
    expect(ensureCalls).toBe(1);
    expect(useAppStore.getState().acpSetup.open).toBe(false);
    expect(getRun(id).status).not.toBe("killed");
  });

  it("retries as many times as the screen asks, and starts the run when one attempt works", async () => {
    let ensureCalls = 0;
    let spawned = false;
    vi.mocked(acpAdapterAvailability).mockResolvedValue({ ready: false, via: "none" });
    setTransport({
      ...nullTransport,
      acpManagedStatus: async () => READY,
      // Two failures, then the download that goes through.
      acpManagedEnsure: async () => (++ensureCalls < 3 ? null : READY),
      spawnRun: async () => { spawned = true; },
    });
    screenAnswers("retry", "retry");

    const id = ask();
    await vi.waitFor(() => expect(spawned).toBe(true));
    expect(ensureCalls).toBe(3);
    expect(useAppStore.getState().acpSetup.open).toBe(false);
    expect(getRun(id).status).not.toBe("killed");
  });

  it("clears the failed attempt from the screen before trying again", async () => {
    let ensureCalls = 0;
    const phasesSeen: (string | undefined)[] = [];
    vi.mocked(acpAdapterAvailability).mockResolvedValue({ ready: false, via: "none" });
    setTransport({
      ...nullTransport,
      acpManagedStatus: async () => READY,
      acpManagedEnsure: async () => {
        phasesSeen.push(useAppStore.getState().acpSetup.phase);
        return ++ensureCalls < 2 ? null : READY;
      },
    });
    screenAnswers("retry");

    ask();
    await vi.waitFor(() => expect(ensureCalls).toBe(2));
    // The second attempt starts on a clean screen: the first one's error is not still on it.
    expect(phasesSeen).toEqual([undefined, undefined]);
  });

  it("fails the run when the screen gives up", async () => {
    let ensureCalls = 0;
    vi.mocked(acpAdapterAvailability).mockResolvedValue({ ready: false, via: "none" });
    setTransport({
      ...nullTransport,
      acpManagedStatus: async () => READY,
      acpManagedEnsure: async () => { ensureCalls++; return null; },
    });
    screenAnswers("cancel");

    const id = ask();
    await vi.waitFor(() => expect(getRun(id).status).toBe("killed"));
    expect(ensureCalls).toBe(1);
    expect(useAppStore.getState().acpSetup.open).toBe(false);
    expect(getRun(id).output).toContain("falló o fue cancelada");
  });
});
