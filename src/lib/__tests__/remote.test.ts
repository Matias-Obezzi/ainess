import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSnapshot,
  handleRemoteCommand,
  isAllowedWorkspacePath,
  isAllowedAttachmentWritePath,
} from "@/lib/remote";

// Mock @/lib/diagnostics since we want to test handleRemoteCommand wiring, not the actual system diagnostics
vi.mock("@/lib/diagnostics", () => ({
  collectDiagnostics: vi.fn().mockResolvedValue([{ id: "test", level: "ok", title: "Test", detail: "Detail" }])
}));

import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";

describe("remote snapshot and commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildSnapshot includes quota, repoState, and full project metadata", () => {
    const prevConfig = useAppStore.getState().config;
    useAppStore.setState({
      config: {
        ...prevConfig,
        projects: [
          {
            id: "p1",
            name: "Project 1",
            workspaceDir: "/work/p1",
            repoDir: "/work/p1/sub",
            color: "#123456",
            agents: [],
            board: { columns: [{ id: "todo", name: "Todo" }] },
            autonomous: { until: 5000 },
          } as any,
        ],
      },
      quota: {
        claude: { provider: "claude", status: "ok", items: [], fetchedAt: 0 },
        antigravity: { provider: "antigravity", status: "ok", items: [], fetchedAt: 0 },
      },
      repoState: {
        p1: {
          status: "ready",
          branch: "main",
          ahead: 0,
          behind: 0,
          changes: [],
          commits: [],
          prs: [],
          prStatus: "idle",
        } as any,
      },
    });

    const snapshot = buildSnapshot();
    expect(snapshot.quota).toBeDefined();
    expect(snapshot.quota?.claude).toEqual({ provider: "claude", status: "ok", items: [], fetchedAt: 0 });
    expect(snapshot.quota?.antigravity).toEqual({ provider: "antigravity", status: "ok", items: [], fetchedAt: 0 });
    expect(snapshot.projects[0].repoDir).toBe("/work/p1/sub");
    expect(snapshot.projects[0].board).toEqual({ columns: [{ id: "todo", name: "Todo" }] });
    expect(snapshot.projects[0].autonomous).toEqual({ until: 5000 });
    expect((snapshot.repoState?.p1 as any)?.branch).toBe("main");
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
    useAppStore.setState({
      config: { ...useAppStore.getState().config, language: "en" },
    });

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

  it("validates workspace read paths and attachment write paths strictly", () => {
    const allowedRoots = [
      "C:\\Users\\Dev\\ProjectA",
      "C:\\Users\\Dev\\ProjectA\\repo",
      "/home/dev/project-b",
    ];
    const workspaceDirs = [
      "C:\\Users\\Dev\\ProjectA",
      "/home/dev/project-b",
    ];

    expect(isAllowedWorkspacePath("C:\\Users\\Dev\\ProjectA\\src\\index.ts", allowedRoots)).toBe(true);
    expect(isAllowedWorkspacePath("C:/Users/Dev/ProjectA/.ainess/attachments/img.png", allowedRoots)).toBe(true);
    expect(isAllowedWorkspacePath("/home/dev/project-b/README.md", allowedRoots)).toBe(true);
    expect(isAllowedWorkspacePath("C:\\Users\\Dev\\ProjectA\\..\\Secret\\key.pem", allowedRoots)).toBe(false);
    expect(isAllowedWorkspacePath("/etc/passwd", allowedRoots)).toBe(false);

    expect(
      isAllowedAttachmentWritePath("C:\\Users\\Dev\\ProjectA\\.ainess\\attachments\\20261022-file.png", workspaceDirs),
    ).toBe(true);
    expect(
      isAllowedAttachmentWritePath("/home/dev/project-b/.ainess/attachments/20261022-doc.pdf", workspaceDirs),
    ).toBe(true);
    // Reject subdirectories or path traversal inside attachments
    expect(
      isAllowedAttachmentWritePath("/home/dev/project-b/.ainess/attachments/sub/file.png", workspaceDirs),
    ).toBe(false);
    expect(
      isAllowedAttachmentWritePath("/home/dev/project-b/.ainess/attachments/../BOARD.md", workspaceDirs),
    ).toBe(false);
    expect(
      isAllowedAttachmentWritePath("/home/dev/project-b/src/index.ts", workspaceDirs),
    ).toBe(false);
  });

  it("handles fs writeBytes and readBytes commands within allowed workspace paths", async () => {
    useAppStore.setState({
      config: {
        ...useAppStore.getState().config,
        projects: [
          { id: "p1", name: "P1", workspaceDir: "/work/p1", agents: [] } as any,
        ],
      },
    });

    const transport = getTransport();
    const writeSpy = vi.spyOn(transport, "writeFileBytes").mockResolvedValue(undefined);
    const readSpy = vi.spyOn(transport, "readFileBytes").mockResolvedValue("QUJD");

    const writeRes = await handleRemoteCommand("fs", {
      op: "writeBytes",
      path: "/work/p1/.ainess/attachments/hello.txt",
      base64: "QUJD",
    });
    expect(writeRes).toEqual({ ok: true });
    expect(writeSpy).toHaveBeenCalledWith("/work/p1/.ainess/attachments/hello.txt", "QUJD");

    const forbiddenWrite = await handleRemoteCommand("fs", {
      op: "writeBytes",
      path: "/work/p1/src/evil.ts",
      base64: "QUJD",
    });
    expect(forbiddenWrite.error).toBeDefined();

    const readRes = await handleRemoteCommand("fs", {
      op: "readBytes",
      path: "/work/p1/src/main.ts",
    });
    expect(readRes).toEqual({ ok: true, data: "QUJD" });
    expect(readSpy).toHaveBeenCalledWith("/work/p1/src/main.ts", 4 * 1024 * 1024);
  });

  it("handles chat create/update/delete and project commands", async () => {
    const createChat = vi.fn().mockReturnValue("c-new");
    const updateChat = vi.fn();
    const removeChat = vi.fn();
    const resetSession = vi.fn();
    const setAutonomous = vi.fn();
    const clearMessages = vi.fn();

    useAppStore.setState({
      config: {
        ...useAppStore.getState().config,
        projects: [{ id: "p1", name: "P1", workspaceDir: "/work/p1", agents: [{ id: "a1" }] } as any],
        chats: [{ id: "c-new", projectId: "p1", name: "Design", mode: "individual", participants: [] } as any],
      },
      createChat,
      updateChat,
      removeChat,
      resetSession,
      setAutonomous,
      clearMessages,
    } as any);

    expect(
      await handleRemoteCommand("chat", {
        op: "create",
        projectId: "p1",
        name: "Design",
        mode: "individual",
        participants: [{ agentId: "a1", role: "engineer" }],
      }),
    ).toEqual({ ok: true, chatId: "c-new" });
    expect(createChat).toHaveBeenCalledWith({
      projectId: "p1",
      name: "Design",
      mode: "individual",
      participants: [{ agentId: "a1", role: "engineer" }],
    });

    expect(
      await handleRemoteCommand("chat", {
        op: "update",
        chatId: "c-new",
        patch: { name: "Renamed" },
      }),
    ).toEqual({ ok: true });
    expect(updateChat).toHaveBeenCalledWith("c-new", { name: "Renamed" });

    expect(
      await handleRemoteCommand("chat", {
        op: "delete",
        chatId: "c-new",
      }),
    ).toEqual({ ok: true });
    expect(removeChat).toHaveBeenCalledWith("c-new");

    expect(await handleRemoteCommand("project", { op: "resetSession", projectId: "p1", agentId: "a1" })).toEqual({ ok: true });
    expect(resetSession).toHaveBeenCalledWith("a1", "p1");

    expect(
      await handleRemoteCommand("project", { op: "setAutonomous", projectId: "p1", until: 99999 }),
    ).toEqual({ ok: true });
    expect(setAutonomous).toHaveBeenCalledWith("p1", 99999);

    expect(
      await handleRemoteCommand("project", { op: "setAutonomous", projectId: "p1", until: null }),
    ).toEqual({ ok: true });
    expect(setAutonomous).toHaveBeenCalledWith("p1", null);

    expect(await handleRemoteCommand("project", { op: "clearMessages", projectId: "p1" })).toEqual({ ok: true });
    expect(clearMessages).toHaveBeenCalledWith("p1");
  });
});
