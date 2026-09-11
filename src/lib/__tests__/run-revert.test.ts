// Undoing a run is one command away from throwing away work the user did themselves. These are the
// rules that keep the two apart.
import { describe, it, expect, beforeEach } from "vitest";
import {
  revertPlan,
  parseStatus,
  parseNames,
  isEmptyPlan,
  planRevertOfRun,
  applyRevert,
  readTreeState,
} from "@/lib/run-revert";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";

const clean = { modified: [], untracked: [] };

describe("revertPlan", () => {
  it("puts back what the agent changed in a clean tree", () => {
    const plan = revertPlan(clean, { modified: ["a.ts"], untracked: [] }, ["a.ts"]);
    expect(plan).toEqual({ restore: ["a.ts"], remove: [], keptDirty: [] });
  });

  it("deletes what the agent created", () => {
    const plan = revertPlan(clean, { modified: [], untracked: ["new.ts"] }, []);
    expect(plan.remove).toEqual(["new.ts"]);
  });

  // The heart of it: a file the user had open and half-edited is not the agent's to revert.
  it("leaves alone a file that was already modified before the run", () => {
    const before = { modified: ["mine.ts"], untracked: [] };
    const plan = revertPlan(before, { modified: ["mine.ts", "theirs.ts"], untracked: [] }, ["mine.ts", "theirs.ts"]);
    expect(plan.restore).toEqual(["theirs.ts"]);
    expect(plan.keptDirty).toEqual(["mine.ts"]);
  });

  it("does not delete a file that was already untracked before the run", () => {
    const before = { modified: [], untracked: ["scratch.txt"] };
    const plan = revertPlan(before, { modified: [], untracked: ["scratch.txt", "generated.ts"] }, []);
    expect(plan.remove).toEqual(["generated.ts"]);
    expect(plan.keptDirty).toEqual(["scratch.txt"]);
  });

  it("says there is nothing to do when nothing moved", () => {
    expect(isEmptyPlan(revertPlan(clean, clean, []))).toBe(true);
  });

  it("is not empty when there is only something to delete", () => {
    expect(isEmptyPlan(revertPlan(clean, { modified: [], untracked: ["x"] }, []))).toBe(false);
  });

  it("does not repeat a path that arrives twice", () => {
    const plan = revertPlan(clean, { modified: [], untracked: ["x", "x"] }, ["a", "a"]);
    expect(plan.restore).toEqual(["a"]);
    expect(plan.remove).toEqual(["x"]);
  });
});

describe("parseStatus", () => {
  it("tells tracked changes from untracked files", () => {
    const state = parseStatus(" M src/a.ts\n?? src/new.ts\nA  src/added.ts\n");
    expect(state.modified).toEqual(["src/a.ts", "src/added.ts"]);
    expect(state.untracked).toEqual(["src/new.ts"]);
  });

  // The name that exists on disk is the one on the right.
  it("takes the new name of a rename", () => {
    expect(parseStatus("R  old.ts -> new.ts").modified).toEqual(["new.ts"]);
  });

  // git quotes anything with a space in it, and a literal pair of quotes is not a file.
  it("unwraps a quoted path", () => {
    expect(parseStatus('?? "my file.txt"').untracked).toEqual(["my file.txt"]);
  });

  it("does not mind empty output or blank lines", () => {
    expect(parseStatus("")).toEqual({ modified: [], untracked: [] });
    expect(parseStatus("\n\n")).toEqual({ modified: [], untracked: [] });
  });
});

describe("parseNames", () => {
  it("takes the non-empty lines", () => {
    expect(parseNames("a.ts\n\nb.ts\n")).toEqual(["a.ts", "b.ts"]);
  });
});

describe("planRevertOfRun", () => {
  const withGit = (answer: (args: string[]) => { code: number | null; stdout: string; stderr: string }) => {
    setTransport({ ...nullTransport, exec: async (_p, args) => answer(args) });
  };

  it("refuses to answer without a folder or a base commit", async () => {
    expect(await planRevertOfRun({ baseSha: "abc" })).toBeNull();
    expect(await planRevertOfRun({ cwd: "C:/w" })).toBeNull();
  });

  it("refuses to answer when the folder is not a repository", async () => {
    withGit(() => ({ code: 128, stdout: "", stderr: "not a git repository" }));
    expect(await planRevertOfRun({ cwd: "C:/w", baseSha: "abc" })).toBeNull();
  });

  it("uses the snapshot the run took when it started", async () => {
    withGit(args => args[0] === "status"
      ? { code: 0, stdout: " M mine.ts\n M theirs.ts\n", stderr: "" }
      : { code: 0, stdout: "mine.ts\ntheirs.ts\n", stderr: "" });

    const plan = await planRevertOfRun({
      cwd: "C:/w",
      baseSha: "abc",
      treeAtStart: { modified: ["mine.ts"], untracked: [] },
    });
    expect(plan).toEqual({ restore: ["theirs.ts"], remove: [], keptDirty: ["mine.ts"] });
  });

  // Runs recorded before the snapshot existed: everything that moved counts as the agent's.
  it("treats a run with no snapshot as having started clean", async () => {
    withGit(args => args[0] === "status"
      ? { code: 0, stdout: " M a.ts\n", stderr: "" }
      : { code: 0, stdout: "a.ts\n", stderr: "" });

    const plan = await planRevertOfRun({ cwd: "C:/w", baseSha: "abc" });
    expect(plan?.restore).toEqual(["a.ts"]);
  });
});

describe("applyRevert", () => {
  let calls: string[][];

  beforeEach(() => {
    calls = [];
    setTransport({
      ...nullTransport,
      exec: async (_p, args) => {
        calls.push(args);
        return { code: 0, stdout: "", stderr: "" };
      },
    });
  });

  it("restores with the base commit and removes with an explicit path list", async () => {
    const result = await applyRevert("C:/w", "abc", { restore: ["a.ts"], remove: ["new.ts"], keptDirty: [] });
    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual(["checkout", "abc", "--", "a.ts"]);
    expect(calls[1]).toEqual(["clean", "-fd", "--", "new.ts"]);
  });

  // A clean with no pathspec would be let loose on the whole folder; it never runs without one.
  it("does not run a clean when there is nothing to remove", async () => {
    await applyRevert("C:/w", "abc", { restore: ["a.ts"], remove: [], keptDirty: [] });
    expect(calls.every(args => args[0] !== "clean")).toBe(true);
  });

  it("runs nothing at all for an empty plan", async () => {
    expect(await applyRevert("C:/w", "abc", { restore: [], remove: [], keptDirty: [] })).toEqual({ ok: true });
    expect(calls).toEqual([]);
  });

  it("sends long lists in batches rather than one enormous command", async () => {
    const many = Array.from({ length: 95 }, (_, i) => `f${i}.ts`);
    await applyRevert("C:/w", "abc", { restore: many, remove: [], keptDirty: [] });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toHaveLength(3 + 40);
  });

  it("stops and reports what git said", async () => {
    setTransport({
      ...nullTransport,
      exec: async () => ({ code: 1, stdout: "", stderr: "error: pathspec did not match\nmore" }),
    });
    const result = await applyRevert("C:/w", "abc", { restore: ["a.ts"], remove: ["b.ts"], keptDirty: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("error: pathspec did not match");
  });

  it("does not let a transport that throws escape", async () => {
    setTransport({ ...nullTransport, exec: async () => { throw new Error("no git"); } });
    const result = await applyRevert("C:/w", "abc", { restore: ["a.ts"], remove: [], keptDirty: [] });
    expect(result).toEqual({ ok: false, error: "no git" });
  });
});

describe("readTreeState", () => {
  it("comes back null when git cannot be run", async () => {
    setTransport({ ...nullTransport, exec: async () => { throw new Error("nope"); } });
    expect(await readTreeState("C:/w")).toBeNull();
  });
});
