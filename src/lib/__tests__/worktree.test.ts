import { describe, it, expect } from "vitest";
import { worktreePath, worktreeBranch, worktreeSlug, parseWorktreeList, samePath } from "@/lib/worktree";

describe("worktreeSlug", () => {
  it("lowercases and joins words with dashes", () => {
    expect(worktreeSlug("Claude")).toBe("claude");
    expect(worktreeSlug("Claude Planner")).toBe("claude-planner");
    expect(worktreeSlug("Claude   2")).toBe("claude-2");
  });

  it("drops accents and anything that is not a letter or a digit", () => {
    expect(worktreeSlug("Revisión")).toBe("revision");
    expect(worktreeSlug("Ñandú Ágil")).toBe("nandu-agil");
    expect(worktreeSlug("Agente #1 (backend)")).toBe("agente-1-backend");
    expect(worktreeSlug("  Codex  ")).toBe("codex");
  });

  it("falls back to a usable folder name when nothing survives", () => {
    expect(worktreeSlug("···")).toBe("agente");
    expect(worktreeSlug("")).toBe("agente");
  });
});

describe("worktreePath", () => {
  it("is a sibling folder of the workspace", () => {
    expect(worktreePath("C:\\Users\\m\\projects\\ais", "Antigravity")).toBe("C:\\Users\\m\\projects\\ais-wt-antigravity");
    expect(worktreePath("/home/m/projects/ais", "Antigravity")).toBe("/home/m/projects/ais-wt-antigravity");
  });

  it("handles accents and spaces in the agent name", () => {
    expect(worktreePath("/home/m/ais", "Revisión Final")).toBe("/home/m/ais-wt-revision-final");
    expect(worktreePath("/home/m/ais", "Ñandú")).toBe("/home/m/ais-wt-nandu");
  });

  it("ignores a trailing separator on the workspace", () => {
    expect(worktreePath("/home/m/ais/", "Claude")).toBe("/home/m/ais-wt-claude");
    expect(worktreePath("C:\\Users\\m\\ais\\", "Claude")).toBe("C:\\Users\\m\\ais-wt-claude");
  });

  it("keeps two agents apart", () => {
    expect(worktreePath("/r", "Claude")).not.toBe(worktreePath("/r", "Claude 2"));
  });
});

describe("worktreeBranch", () => {
  it("namespaces the branch under ainess/", () => {
    expect(worktreeBranch("Antigravity")).toBe("ainess/antigravity");
    expect(worktreeBranch("Claude 2")).toBe("ainess/claude-2");
  });

  it("handles accents and spaces", () => {
    expect(worktreeBranch("Revisión Final")).toBe("ainess/revision-final");
    expect(worktreeBranch("Ñandú")).toBe("ainess/nandu");
  });
});

describe("parseWorktreeList", () => {
  it("reads several worktrees, one of them detached", () => {
    const stdout = [
      "worktree C:/Users/m/projects/ais",
      "HEAD 6ab9c2f1111111111111111111111111111111111",
      "branch refs/heads/main",
      "",
      "worktree C:/Users/m/projects/ais-wt-antigravity",
      "HEAD 7f0513a2222222222222222222222222222222222",
      "branch refs/heads/ainess/antigravity",
      "",
      "worktree C:/Users/m/projects/ais-wt-suelto",
      "HEAD 041523b3333333333333333333333333333333333",
      "detached",
      "",
    ].join("\n");

    expect(parseWorktreeList(stdout)).toEqual([
      { path: "C:/Users/m/projects/ais", branch: "main" },
      { path: "C:/Users/m/projects/ais-wt-antigravity", branch: "ainess/antigravity" },
      { path: "C:/Users/m/projects/ais-wt-suelto", branch: null },
    ]);
  });

  it("handles CRLF, a bare repo and a locked worktree", () => {
    const stdout = "worktree /srv/repo.git\r\nbare\r\n\r\nworktree /srv/wt\r\nHEAD abc\r\nbranch refs/heads/feat/x\r\nlocked\r\n";
    expect(parseWorktreeList(stdout)).toEqual([
      { path: "/srv/repo.git", branch: null },
      { path: "/srv/wt", branch: "feat/x" },
    ]);
  });

  it("answers an empty list for empty output", () => {
    expect(parseWorktreeList("")).toEqual([]);
  });
});

describe("samePath", () => {
  it("ignores separators, case and a trailing slash", () => {
    expect(samePath("C:/Users/m/ais-wt-x", "C:\\Users\\m\\ais-wt-x")).toBe(true);
    expect(samePath("C:/Users/M/AIS-WT-X", "C:/users/m/ais-wt-x/")).toBe(true);
    expect(samePath("/home/m/a", "/home/m/b")).toBe(false);
  });
});
