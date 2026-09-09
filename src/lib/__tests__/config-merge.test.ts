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
});
