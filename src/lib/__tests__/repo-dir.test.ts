// A project's folder and its repository are the same folder in the common case, and one level
// apart when the folder was made for the project and the repo put inside it.
import { describe, it, expect, beforeEach } from "vitest";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { findRepoDir, repoDirOf } from "@/lib/repo-dir";

/** A fake machine: which folders are repos, and what each folder contains. */
function machine(repos: string[], subdirs: Record<string, string[]>) {
  setTransport({
    ...nullTransport,
    exec: async (_program: string, args: string[]) => {
      const dir = args[args.indexOf("-C") + 1];
      return repos.includes(dir) ? { code: 0, stdout: "true\n", stderr: "" } : { code: 128, stdout: "", stderr: "fatal: not a git repository" };
    },
    listSubdirs: async (dir: string) => subdirs[dir] ?? [],
  } as never);
}

beforeEach(() => setTransport(nullTransport));

describe("repoDirOf", () => {
  it("is the workspace unless a repo was found under it", () => {
    expect(repoDirOf({ workspaceDir: "C:/p" })).toBe("C:/p");
    expect(repoDirOf({ workspaceDir: "C:/p", repoDir: "C:/p/app" })).toBe("C:/p/app");
  });
});

describe("findRepoDir", () => {
  it("answers the folder itself when it is a repo", async () => {
    machine(["C:/p"], { "C:/p": ["C:/p/app"] });
    expect(await findRepoDir("C:/p")).toBe("C:/p");
  });

  it("finds a repo one level down, skipping what is never one", async () => {
    machine(["C:/p/app"], { "C:/p": ["C:/p/.claude", "C:/p/node_modules", "C:/p/app", "C:/p/app-wt-claude"] });
    expect(await findRepoDir("C:/p")).toBe("C:/p/app");
  });

  it("answers nothing for a folder with no repo in it or under it", async () => {
    machine([], { "C:/p": ["C:/p/docs"] });
    expect(await findRepoDir("C:/p")).toBeNull();
    expect(await findRepoDir("")).toBeNull();
  });
});
