import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSnapshot,
  handleRemoteCommand,
  isAllowedWorkspacePath,
  isAllowedAttachmentWritePath,
  isSafeGitArgs,
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

  describe("isSafeGitArgs security enforcement", () => {
    it("allows safe read-only subcommands and flags", () => {
      expect(isSafeGitArgs(["status"])).toBe(true);
      expect(isSafeGitArgs(["diff", "HEAD~1"])).toBe(true);
      expect(isSafeGitArgs(["ls-files", "-m"])).toBe(true);
      expect(isSafeGitArgs(["log", "-n", "10", "--oneline"])).toBe(true);
      expect(isSafeGitArgs(["rev-parse", "HEAD"])).toBe(true);
      expect(isSafeGitArgs(["show", "HEAD:src/index.ts"])).toBe(true);
      expect(isSafeGitArgs(["branch"])).toBe(true);
      expect(isSafeGitArgs(["branch", "--show-current"])).toBe(true);
      expect(isSafeGitArgs(["branch", "-a"])).toBe(true);
      expect(isSafeGitArgs(["branch", "-r"])).toBe(true);
      expect(isSafeGitArgs(["branch", "-v"])).toBe(true);
      expect(isSafeGitArgs(["branch", "--list"])).toBe(true);
      expect(isSafeGitArgs(["branch", "--all"])).toBe(true);
    });

    it("rejects --output and -o flags in any position across subcommands", () => {
      expect(isSafeGitArgs(["diff", "--output=malicious.txt"])).toBe(false);
      expect(isSafeGitArgs(["diff", "--output", "/tmp/pwn"])).toBe(false);
      expect(isSafeGitArgs(["diff", "-o", "overwrite.bin"])).toBe(false);
      expect(isSafeGitArgs(["log", "--output=leak.txt"])).toBe(false);
      expect(isSafeGitArgs(["show", "HEAD", "-o", "out.txt"])).toBe(false);
      expect(isSafeGitArgs(["show", "--output", "file", "HEAD"])).toBe(false);
    });

    it("rejects --no-index, which reads any two paths on disk", () => {
      expect(isSafeGitArgs(["diff", "--no-index", "/dev/null", "C:/Windows/win.ini"])).toBe(false);
      expect(isSafeGitArgs(["diff", "--stat", "--no-index", "a", "b"])).toBe(false);
    });

    it("rejects mutating branch subcommands and positional branch arguments", () => {
      expect(isSafeGitArgs(["branch", "-D", "main"])).toBe(false);
      expect(isSafeGitArgs(["branch", "-d", "feature"])).toBe(false);
      expect(isSafeGitArgs(["branch", "-m", "old", "new"])).toBe(false);
      expect(isSafeGitArgs(["branch", "-f", "main", "HEAD"])).toBe(false);
      expect(isSafeGitArgs(["branch", "new-branch-name"])).toBe(false);
      expect(isSafeGitArgs(["branch", "feature/foo"])).toBe(false);
    });

    it("rejects non-whitelisted git subcommands", () => {
      expect(isSafeGitArgs(["checkout", "main"])).toBe(false);
      expect(isSafeGitArgs(["commit", "-m", "bad"])).toBe(false);
      expect(isSafeGitArgs(["push", "origin", "main"])).toBe(false);
      expect(isSafeGitArgs(["pull"])).toBe(false);
      expect(isSafeGitArgs(["clean", "-fd"])).toBe(false);
      expect(isSafeGitArgs(["reset", "--hard"])).toBe(false);
      expect(isSafeGitArgs([])).toBe(false);
    });
  });

  describe("remote input validation and symlink traversal prevention", () => {
    it("rejects createChat when participant agent does not exist in project", async () => {
      useAppStore.setState({
        config: {
          ...useAppStore.getState().config,
          projects: [{ id: "p1", name: "P1", workspaceDir: "/work/p1", agents: [{ id: "a1" }] } as any],
        },
      });

      const res = await handleRemoteCommand("chat", {
        op: "create",
        projectId: "p1",
        name: "Malicious Chat",
        participants: [{ agentId: "non-existent-agent", role: "hacker" }],
      });

      expect(res).toHaveProperty("error");
    });

    it("sanitizes updateChat payload to allow only whitelisted fields", async () => {
      const updateChat = vi.fn();
      useAppStore.setState({
        config: {
          ...useAppStore.getState().config,
          projects: [{ id: "p1", name: "P1", workspaceDir: "/work/p1", agents: [{ id: "a1" }] } as any],
          chats: [{ id: "c1", projectId: "p1", name: "Existing", mode: "individual", participants: [] } as any],
        },
        updateChat,
      } as any);

      const res = await handleRemoteCommand("chat", {
        op: "update",
        chatId: "c1",
        patch: {
          name: "Updated Name",
          dangerousInjection: "DROP TABLE",
          id: "fake-id",
        },
      });

      expect(res).toEqual({ ok: true });
      expect(updateChat).toHaveBeenCalledWith("c1", { name: "Updated Name" });
    });

    it("blocks fs read/write operations when symlink escapes workspace root", async () => {
      useAppStore.setState({
        config: {
          ...useAppStore.getState().config,
          projects: [{ id: "p1", name: "P1", workspaceDir: "/work/p1", agents: [] } as any],
        },
      });

      const transport = getTransport();
      const readSpy = vi.spyOn(transport, "readFileBytes").mockResolvedValue("SECRET");
      const writeSpy = vi.spyOn(transport, "writeFileBytes").mockResolvedValue(undefined);
      const execSpy = vi.spyOn(transport, "exec").mockResolvedValue({ code: 0, stdout: "ok", stderr: "" });

      // Mock realPath resolving symlink outside workspace to /etc/shadow
      vi.spyOn(transport, "realPath").mockImplementation(async (p: string) => {
        if (p.includes("symlink")) return "/etc/shadow";
        return p;
      });

      const readRes = await handleRemoteCommand("fs", {
        op: "readBytes",
        path: "/work/p1/symlink",
      });
      expect(readRes).toEqual({ ok: true, data: null });
      expect(readSpy).not.toHaveBeenCalled();

      const writeRes = await handleRemoteCommand("fs", {
        op: "writeBytes",
        path: "/work/p1/.ainess/attachments/symlink",
        base64: "QUJD",
      });
      expect(writeRes).toHaveProperty("error");
      expect(writeSpy).not.toHaveBeenCalled();

      const gitRes = await handleRemoteCommand("fs", {
        op: "git",
        cwd: "/work/p1/symlink",
        args: ["status"],
      });
      expect(gitRes).toEqual({ ok: true, code: 1, stdout: "", stderr: "Denied" });
      expect(execSpy).not.toHaveBeenCalled();
    });
  });
});
