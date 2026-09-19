// The board seam's only rule: `boardProviderFor` always hands back something that works. A project
// with no board, one that names a provider this build cannot do yet, or one whose config was
// hand-edited into nonsense all fall back to the local file — a board that refuses to load is
// worse than a local board.
import { describe, it, expect } from "vitest";
import { BOARD_PROVIDERS, boardProviderFor } from "@/lib/board/registry";
import { localBoardProvider } from "@/lib/board/local";
import { githubProjectsBoardProvider } from "@/lib/board/github-projects";
import type { Project } from "@/types";

function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Project",
    workspaceDir: "/tmp/p1",
    createdAt: 0,
    agents: [],
    ...over,
  };
}

describe("boardProviderFor", () => {
  it("falls back to local when there is no project at all", () => {
    expect(boardProviderFor(undefined)).toBe(localBoardProvider);
  });

  it("uses local for a project that never picked one", () => {
    expect(boardProviderFor(makeProject())).toBe(localBoardProvider);
  });

  it("uses local when the project picked local", () => {
    expect(boardProviderFor(makeProject({ board: { provider: "local" } }))).toBe(localBoardProvider);
  });

  it("falls back to local for a provider that is declared but not built yet", () => {
    expect(boardProviderFor(makeProject({ board: { provider: "trello" } }))).toBe(localBoardProvider);
    expect(boardProviderFor(makeProject({ board: { provider: "jira" } }))).toBe(localBoardProvider);
  });

  // The fallback stops the moment a provider is built. A project on GitHub whose owner, number or
  // column mapping is missing does *not* quietly read the local file any more: it fails to load,
  // which is what the user has to see — a board that answers with somebody else's cards, or with
  // none, is worse than one that says it is not configured.
  it("uses the GitHub provider once the project picked it", () => {
    const provider = boardProviderFor(makeProject({ board: { provider: "github-projects" } }));
    expect(provider).toBe(githubProjectsBoardProvider);
    expect(provider).not.toBe(localBoardProvider);
  });

  it("falls back to local for a provider this build has never heard of", () => {
    const project = makeProject({ board: { provider: "algo-que-no-existe" } as never });
    expect(boardProviderFor(project)).toBe(localBoardProvider);
  });
});

describe("BOARD_PROVIDERS", () => {
  it("offers the two providers that are built, in the order the picker shows them", () => {
    const available = BOARD_PROVIDERS.filter(p => p.available);
    expect(available.map(p => p.id)).toEqual(["local", "github-projects"]);
  });

  it("declares the four ids once each, with a label key for every one", () => {
    const ids = BOARD_PROVIDERS.map(p => p.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const meta of BOARD_PROVIDERS) expect(meta.labelKey).toMatch(/^board\.provider\./);
  });
});
