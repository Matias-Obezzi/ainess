import { describe, it, expect } from "vitest";
import { parseBranches, parseGitStatus, parsePullRequests } from "@/lib/git";

describe("parseGitStatus", () => {
  it("reads the branch, its upstream and how far ahead or behind it is", () => {
    const stdout = [
      "# branch.oid 6ab9c2f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
      "# branch.head feat/git-status",
      "# branch.upstream origin/feat/git-status",
      "# branch.ab +3 -2",
      "",
    ].join("\n");
    expect(parseGitStatus(stdout)).toEqual({
      branch: "feat/git-status",
      upstream: "origin/feat/git-status",
      ahead: 3,
      behind: 2,
      dirty: 0,
    });
  });

  it("counts every changed path, staged, unstaged, renamed or untracked", () => {
    const stdout = [
      "# branch.oid 6ab9c2f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +0 -0",
      "1 .M N... 100644 100644 100644 aaa bbb src/store.ts",
      "1 M. N... 100644 100644 100644 ccc ddd src/App.tsx",
      "2 R. N... 100644 100644 100644 eee fff R100 src/new.ts\tsrc/old.ts",
      "u UU N... 100644 100644 100644 100644 ggg hhh iii src/conflict.ts",
      "? notes.txt",
    ].join("\n");
    const status = parseGitStatus(stdout);
    expect(status.dirty).toBe(5);
    expect(status.branch).toBe("main");
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
  });

  it("handles a fresh repo with no commits and no upstream", () => {
    const stdout = "# branch.oid (initial)\n# branch.head main\n? README.md\n";
    expect(parseGitStatus(stdout)).toEqual({
      branch: "main",
      upstream: null,
      ahead: 0,
      behind: 0,
      dirty: 1,
    });
  });

  it("reports no branch on a detached HEAD and survives CRLF and empty output", () => {
    const detached = parseGitStatus("# branch.oid abc123\r\n# branch.head (detached)\r\n");
    expect(detached.branch).toBeNull();
    expect(parseGitStatus("")).toEqual({
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      dirty: 0,
    });
  });
});

describe("parsePullRequests", () => {
  it("marks a draft as such even when its state is open", () => {
    const json = JSON.stringify([
      {
        number: 12,
        title: "Estado de git en el sidebar",
        state: "OPEN",
        isDraft: true,
        headRefName: "feat/git-status",
        url: "https://github.com/Matias-Obezzi/ainess/pull/12",
        updatedAt: "2026-09-06T10:00:00Z",
        statusCheckRollup: [],
        reviewDecision: "",
      },
    ]);
    expect(parsePullRequests(json)).toEqual([
      {
        number: 12,
        title: "Estado de git en el sidebar",
        state: "draft",
        head: "feat/git-status",
        checks: "none",
        review: "none",
        url: "https://github.com/Matias-Obezzi/ainess/pull/12",
        updatedAt: Date.parse("2026-09-06T10:00:00Z"),
      },
    ]);
  });

  it("a failing check outranks the ones still running", () => {
    const json = JSON.stringify([
      {
        number: 7,
        title: "CI roto",
        state: "OPEN",
        isDraft: false,
        headRefName: "fix/ci",
        url: "https://example.com/7",
        updatedAt: "2026-09-05T08:30:00Z",
        statusCheckRollup: [
          { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
          { __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null },
          { __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" },
        ],
        reviewDecision: "REVIEW_REQUIRED",
      },
    ]);
    const [pr] = parsePullRequests(json);
    expect(pr.checks).toBe("failing");
    expect(pr.review).toBe("pending");
    expect(pr.state).toBe("open");
  });

  it("reads an approved review with every check green, and pending ones as pending", () => {
    const json = JSON.stringify([
      {
        number: 3,
        title: "Listo para mergear",
        state: "OPEN",
        isDraft: false,
        headRefName: "feat/ready",
        url: "https://example.com/3",
        updatedAt: "2026-09-04T12:00:00Z",
        statusCheckRollup: [
          { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
          { __typename: "StatusContext", state: "SUCCESS" },
        ],
        reviewDecision: "APPROVED",
      },
      {
        number: 4,
        title: "Esperando el CI",
        state: "OPEN",
        isDraft: false,
        headRefName: "feat/waiting",
        url: "https://example.com/4",
        updatedAt: "2026-09-04T13:00:00Z",
        statusCheckRollup: [{ __typename: "StatusContext", state: "PENDING" }],
        reviewDecision: "CHANGES_REQUESTED",
      },
    ]);
    const prs = parsePullRequests(json);
    expect(prs[0].checks).toBe("passing");
    expect(prs[0].review).toBe("approved");
    expect(prs[1].checks).toBe("pending");
    expect(prs[1].review).toBe("changes-requested");
  });

  it("tolerates missing fields and returns an empty list for invalid JSON", () => {
    expect(parsePullRequests("no soy json")).toEqual([]);
    expect(parsePullRequests("{}")).toEqual([]);
    expect(parsePullRequests("[]")).toEqual([]);
    expect(parsePullRequests(JSON.stringify([{ title: "sin número" }, null, 5]))).toEqual([]);
    expect(parsePullRequests(JSON.stringify([{ number: 9 }]))).toEqual([
      {
        number: 9,
        title: "",
        state: "open",
        head: "",
        checks: "none",
        review: "none",
        url: "",
        updatedAt: 0,
      },
    ]);
  });
});

describe("parseBranches", () => {
  it("separates the local ones from the remote ones", () => {
    const out = [
      "refs/heads/main",
      "refs/heads/dev",
      "refs/remotes/origin/HEAD",
      "refs/remotes/origin/main",
      "refs/remotes/origin/feat/coupons",
    ].join("\n");

    expect(parseBranches(out)).toEqual({
      local: ["main", "dev"],
      // origin/HEAD is a pointer, and origin/main is already local: neither is worth offering.
      remote: ["origin/feat/coupons"],
    });
  });

  it("survives an empty answer and \rLF", () => {
    expect(parseBranches("")).toEqual({ local: [], remote: [] });
    expect(parseBranches("refs/heads/main\r\n").local).toEqual(["main"]);
  });
});
