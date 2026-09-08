import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSnapshot, handleRemoteCommand } from "@/lib/remote";

// Mock @/lib/diagnostics since we want to test handleRemoteCommand wiring, not the actual system diagnostics
vi.mock("@/lib/diagnostics", () => ({
  collectDiagnostics: vi.fn().mockResolvedValue([{ id: "test", level: "ok", title: "Test", detail: "Detail" }])
}));

import { useAppStore } from "@/store";

describe("remote snapshot and commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildSnapshot includes quota", () => {
    useAppStore.setState({
      quota: {
        claude: { provider: "claude", status: "ok", items: [], fetchedAt: 0 },
        antigravity: { provider: "antigravity", status: "ok", items: [], fetchedAt: 0 }
      }
    });

    const snapshot = buildSnapshot();
    expect(snapshot.quota).toBeDefined();
    expect(snapshot.quota?.claude).toEqual({ provider: "claude", status: "ok", items: [], fetchedAt: 0 });
    expect(snapshot.quota?.antigravity).toEqual({ provider: "antigravity", status: "ok", items: [], fetchedAt: 0 });
  });

  it("an unknown action still answers with its error instead of throwing", async () => {
    const result = await handleRemoteCommand("no-such-action", {});
    expect(result.error).toContain("no-such-action");
  });

  it("a snapshot from an older build, with no quota field, hydrates as an empty one", async () => {
    const { hydrate } = await import("@/remote/remote-client");
    const snapshot = buildSnapshot();
    delete (snapshot as Partial<typeof snapshot>).quota;
    expect(() => hydrate(snapshot)).not.toThrow();
    expect(useAppStore.getState().quota).toEqual({});
  });

  it("handleRemoteCommand for diagnostics calls collectDiagnostics with correct args", async () => {
    useAppStore.setState({ config: { language: "en" } } as any);

    const result = await handleRemoteCommand("diagnostics", { refreshQuota: true });
    
    expect(result).toHaveProperty("results");
    expect((result as any).results).toHaveLength(1);
    expect((result as any).results[0].title).toBe("Test");

    const diagnostics = await import("@/lib/diagnostics");
    expect(diagnostics.collectDiagnostics).toHaveBeenCalled();
    const args = vi.mocked(diagnostics.collectDiagnostics).mock.calls[0];
    expect(typeof args[0]).toBe("function"); // t function
    expect(args[1]).toEqual({ refreshQuota: true }); // payload
  });
});
