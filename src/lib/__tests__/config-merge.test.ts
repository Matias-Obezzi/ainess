import { describe, it, expect } from "vitest";
import { mergeConfig } from "@/lib/config-merge";
import type { AppConfig } from "@/types";

const cfg = (over: Partial<AppConfig>): AppConfig => ({
  projects: [], formations: [], chats: [], skills: [], mcpServers: [], hooks: [], presets: [],
  ...over,
} as unknown as AppConfig);

const p = (id: string) => ({ id, name: id, workspaceDir: `C:\\${id}`, createdAt: 1, agents: [] });

describe("mergeConfig", () => {
  it("keeps a project another process added while this one was running", () => {
    const base = cfg({ projects: [p("a")] });
    const mem = cfg({ projects: [p("a")], maxRounds: 9 } as Partial<AppConfig>);
    const disk = cfg({ projects: [p("a"), p("b")] });
    const out = mergeConfig(disk, mem, base);
    expect(out.projects.map(x => x.id)).toEqual(["a", "b"]);
    expect((out as { maxRounds?: number }).maxRounds).toBe(9);
  });

  it("does not revive a project this process deleted", () => {
    const base = cfg({ projects: [p("a"), p("b")] });
    const mem = cfg({ projects: [p("a")] });
    const disk = cfg({ projects: [p("a"), p("b")] });
    expect(mergeConfig(disk, mem, base).projects.map(x => x.id)).toEqual(["a"]);
  });

  it("memory wins for items both sides know", () => {
    const base = cfg({ projects: [p("a")] });
    const mem = cfg({ projects: [{ ...p("a"), name: "renamed" }] });
    const disk = cfg({ projects: [{ ...p("a"), name: "stale" }] });
    expect(mergeConfig(disk, mem, base).projects[0].name).toBe("renamed");
  });

  it("returns memory as-is when there is no file yet", () => {
    const mem = cfg({ projects: [p("a")] });
    expect(mergeConfig(null, mem, null)).toBe(mem);
  });

  it("merges messaging configurations", () => {
    const base = cfg({});
    const mem = cfg({ messaging: { telegram: { enabled: true, token: "a", allowedChatIds: [], projectId: null } } });
    const disk = cfg({ messaging: { discord: { enabled: false, token: "b", allowedChatIds: [], projectId: null } } } as any);
    const out = mergeConfig(disk, mem, base);
    expect(out.messaging).toEqual({
      telegram: { enabled: true, token: "a", allowedChatIds: [], projectId: null },
      discord: { enabled: false, token: "b", allowedChatIds: [], projectId: null },
    });
  });

  it("keeps a board token another process wrote while this one had none", () => {
    const base = cfg({});
    const mem = cfg({});
    const disk = cfg({ boards: { github: { token: "github_pat_written_elsewhere" } } });
    expect(mergeConfig(disk, mem, base).boards).toEqual({ github: { token: "github_pat_written_elsewhere" } });
  });

  // The two platforms are separate keys under `boards`, so a process that only ever touched
  // Trello cannot wipe the GitHub token somebody else wrote, and the other way round. What does
  // travel as one thing is the Trello pair: whoever writes the key has to write the token too.
  it("keeps each platform's credentials when another process wrote the other one", () => {
    const base = cfg({});
    const mem = cfg({ boards: { trello: { key: "k", token: "t" } } });
    const disk = cfg({ boards: { github: { token: "github_pat_written_elsewhere" } } });
    expect(mergeConfig(disk, mem, base).boards).toEqual({
      github: { token: "github_pat_written_elsewhere" },
      trello: { key: "k", token: "t" },
    });
  });

  it("lets this process's board token win over the one on disk", () => {
    const base = cfg({});
    const mem = cfg({ boards: { github: { token: "github_pat_mine" } } });
    const disk = cfg({ boards: { github: { token: "github_pat_older" } } });
    expect(mergeConfig(disk, mem, base).boards).toEqual({ github: { token: "github_pat_mine" } });
  });
});
