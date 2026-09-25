import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startRun } from "@/lib/orchestrator";
import { useAppStore } from "@/store";
import { nullTransport } from "@/lib/transport-null";
import { setTransport } from "@/lib/transport";
import { forgetAcpAdapter, acpAdapterAvailability } from "@/lib/acp/adapter";
import type { AcpManagedStatus } from "@/types";

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

vi.mock("@/lib/acp/adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/acp/adapter")>();
  return {
    ...actual,
    acpAdapterAvailability: vi.fn(actual.acpAdapterAvailability),
  };
});

describe("the ACP setup gate before a run", () => {
  beforeEach(async () => {
    useAppStore.setState({
      config: {
        projects: [{ id: "p1", name: "P1", agents: [{ id: "a1", name: "A1", provider: "claude", model: "claude-3-5", role: "custom" }] }],
        binaryOverrides: {},
        skills: [],
        mcpServers: [],
      } as any,
      currentProjectId: "p1",
      runtime: { p1: { a1: { agentId: "a1", status: "idle", queuedInstructions: [] } } },
      runs: {},
      messages: [],
      acpSetup: { open: false }
    });
  });

  afterEach(() => {
    forgetAcpAdapter();
    vi.restoreAllMocks();
  });

  const getRun = (id: string) => useAppStore.getState().runs[id];

  it("does not open the dialog if acpManagedStatus is null (e.g., node transport)", async () => {
    let checked = false;
    setTransport({
      ...nullTransport,
      acpManagedStatus: async () => { checked = true; return null; },
    } as any);

    const id = startRun({ agentId: "a1", projectId: useAppStore.getState().currentProjectId!, prompt: "hello" })!;
    await new Promise(r => setTimeout(r, 10));
    expect(checked).toBe(true);
    expect(useAppStore.getState().acpSetup.open).toBe(false);
    expect(getRun(id).status).not.toBe("killed");
  });

  it("opens the dialog, installs, and starts the run if ready: false", async () => {
    let ensureCalled = false;
    vi.mocked(acpAdapterAvailability).mockResolvedValue({ ready: false, via: "managed" });
    
    setTransport({
      ...nullTransport,
      acpManagedStatus: async () => READY,
      acpManagedEnsure: async () => {
        ensureCalled = true;
        return READY;
      },
    } as any);

    const id = startRun({ agentId: "a1", projectId: useAppStore.getState().currentProjectId!, prompt: "hello" })!;
    
    // Wait for the async gate to process
    await new Promise(r => setTimeout(r, 10));
    
    expect(ensureCalled).toBe(true);
    expect(useAppStore.getState().acpSetup.open).toBe(false); // Closed after success
    expect(getRun(id).status).not.toBe("killed");
  });

  it("fails the run if the installation is canceled", async () => {
    vi.mocked(acpAdapterAvailability).mockResolvedValue({ ready: false, via: "managed" });
    
    setTransport({
      ...nullTransport,
      acpManagedStatus: async () => READY,
      acpManagedEnsure: async () => null, // null means failed/canceled
    } as any);

    const id = startRun({ agentId: "a1", projectId: useAppStore.getState().currentProjectId!, prompt: "hello" })!;
    
    await new Promise(r => setTimeout(r, 10));
    
    expect(useAppStore.getState().acpSetup.open).toBe(false);
    expect(getRun(id).status).toBe("killed");
    expect(getRun(id).output).toContain("falló o fue cancelada");
  });
});