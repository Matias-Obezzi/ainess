import { describe, it, expect, beforeEach, vi } from "vitest";
import { readRunDiff } from "../git-diff";
import { setTransport, getTransport } from "../transport";

describe("readRunDiff", () => {
  const originalTransport = getTransport();

  beforeEach(() => {
    setTransport({ ...originalTransport });
  });

  it("returns diff text and untracked files when git succeeds", async () => {
    const sampleDiff = `diff --git a/foo.ts b/foo.ts
--- a/foo.ts
+++ b/foo.ts
@@ -1 +1 @@
-old
+new
`;
    const execCalls: { program: string; args: string[]; cwd?: string; timeoutSecs?: number }[] = [];

    setTransport({
      ...getTransport(),
      exec: async (program: string, args: string[], cwd?: string, timeoutSecs?: number) => {
        execCalls.push({ program, args, cwd, timeoutSecs });
        if (args[0] === "diff") {
          return { code: 0, stdout: sampleDiff, stderr: "" };
        }
        if (args[0] === "ls-files") {
          return { code: 0, stdout: "untracked.ts\nsub/another.ts\n", stderr: "" };
        }
        return { code: 0, stdout: "", stderr: "" };
      },
    } as never);

    const res = await readRunDiff("/path/to/project", "abc1234");

    expect(res.available).toBe(true);
    expect(res.text).toBe(sampleDiff);
    expect(res.untracked).toEqual(["untracked.ts", "sub/another.ts"]);
    expect(res.truncated).toBe(false);

    expect(execCalls).toHaveLength(2);
    expect(execCalls[0]).toEqual({
      program: "git",
      args: ["diff", "abc1234", "-M", "--no-color"],
      cwd: "/path/to/project",
      timeoutSecs: 10,
    });
    expect(execCalls[1]).toEqual({
      program: "git",
      args: ["ls-files", "--others", "--exclude-standard"],
      cwd: "/path/to/project",
      timeoutSecs: 10,
    });
  });

  it("returns available: false without calling git when baseSha or cwd is empty", async () => {
    const execSpy = vi.fn();
    setTransport({
      ...getTransport(),
      exec: execSpy,
    } as never);

    const resEmptySha = await readRunDiff("/path/to/project", "");
    expect(resEmptySha.available).toBe(false);
    expect(resEmptySha.text).toBe("");
    expect(resEmptySha.untracked).toEqual([]);

    const resEmptyCwd = await readRunDiff("", "abc1234");
    expect(resEmptyCwd.available).toBe(false);
    expect(resEmptyCwd.text).toBe("");
    expect(resEmptyCwd.untracked).toEqual([]);

    const resBothEmpty = await readRunDiff("", "");
    expect(resBothEmpty.available).toBe(false);
    expect(resBothEmpty.text).toBe("");
    expect(resBothEmpty.untracked).toEqual([]);

    expect(execSpy).not.toHaveBeenCalled();
  });

  it("returns available: false and does not throw when exec returns non-zero code", async () => {
    setTransport({
      ...getTransport(),
      exec: async () => ({
        code: 128,
        stdout: "",
        stderr: "fatal: ambiguous argument 'abc1234': unknown revision",
      }),
    } as never);

    const res = await readRunDiff("/path/to/project", "abc1234");
    expect(res.available).toBe(false);
    expect(res.text).toBe("");
    expect(res.untracked).toEqual([]);
  });

  it("does not throw when exec throws an error and returns available: false", async () => {
    setTransport({
      ...getTransport(),
      exec: async () => {
        throw new Error("spawn git ENOENT");
      },
    } as never);

    const res = await readRunDiff("/path/to/project", "abc1234");
    expect(res.available).toBe(false);
    expect(res.text).toBe("");
    expect(res.untracked).toEqual([]);
  });

  it("truncates diff and marks truncated: true when diff exceeds MAX_DIFF_LENGTH", async () => {
    const hugeDiff = "a".repeat(400_050);

    setTransport({
      ...getTransport(),
      exec: async (_prog: string, args: string[]) => {
        if (args[0] === "diff") {
          return { code: 0, stdout: hugeDiff, stderr: "" };
        }
        return { code: 0, stdout: "", stderr: "" };
      },
    } as never);

    const res = await readRunDiff("/path/to/project", "abc1234");
    expect(res.available).toBe(true);
    expect(res.truncated).toBe(true);
    expect(res.text.length).toBe(400_000);
    expect(res.text).toBe("a".repeat(400_000));
  });
});
