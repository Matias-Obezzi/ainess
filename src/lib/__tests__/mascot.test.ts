// The mascot is the project's face: it has to be the same one every time the thread is opened, and
// it has to be a different one per project. Both of those are properties of the hash, not of the
// SVG, so they get pinned down here.
import { describe, it, expect } from "vitest";
import { mascotHash, mascotTraits, mascotMood, withTyping } from "@/lib/mascot";
import type { AgentStatus } from "@/types";

const SEEDS = Array.from({ length: 36 }, (_, i) => `4f9a1c${i.toString(16).padStart(2, "0")}-b2d3-4e5f-8a90-${i}beefcafe01`);

describe("mascotHash", () => {
  it("is always a non-negative integer", () => {
    for (const seed of ["", "a", "proyecto ñandú", "🐙 kraken", "x".repeat(500), ...SEEDS]) {
      const h = mascotHash(seed);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives the same number for the same string", () => {
    expect(mascotHash("ainess")).toBe(mascotHash("ainess"));
    expect(mascotHash("ainess")).not.toBe(mascotHash("ainesss"));
  });
});

describe("mascotTraits", () => {
  it("is deterministic", () => {
    const seed = "c0ffee00-1111-2222-3333-444455556666";
    expect(mascotTraits(seed)).toEqual(mascotTraits(seed));
  });

  it("keeps every trait in range", () => {
    for (const seed of ["", "🐙", ...SEEDS]) {
      const { body, eyes, crown, hue } = mascotTraits(seed);
      for (const trait of [body, eyes, crown]) {
        expect(trait).toBeGreaterThanOrEqual(0);
        expect(trait).toBeLessThanOrEqual(3);
      }
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThanOrEqual(359);
    }
  });

  it("does not collapse every project into the same creature", () => {
    const seen = new Set(SEEDS.map(s => {
      const { body, eyes, crown } = mascotTraits(s);
      return `${body}-${eyes}-${crown}`;
    }));
    // 64 combinations over 36 seeds: a handful of repeats is expected, one single face is a bug.
    expect(seen.size).toBeGreaterThan(8);
  });

  it("separates seeds that differ by one character", () => {
    expect(mascotTraits("project-a")).not.toEqual(mascotTraits("project-b"));
  });
});

describe("mascotMood", () => {
  const at = (status: AgentStatus) => ({ status });

  it("puts having no tokens left over anything the agent was doing", () => {
    expect(mascotMood(at("working"), true)).toBe("quota");
    expect(mascotMood(at("error"), true)).toBe("quota");
    expect(mascotMood(undefined, true)).toBe("quota");
  });

  it("follows the agent while it has tokens", () => {
    expect(mascotMood(at("working"), false)).toBe("working");
    expect(mascotMood(at("waiting"), false)).toBe("waiting");
    expect(mascotMood(at("error"), false)).toBe("error");
  });

  it("treats everything else as nothing happening", () => {
    // `stopped` on purpose: stopped by hand is not broken, so it sleeps rather than showing a bang.
    for (const status of ["idle", "stopped"] as AgentStatus[]) {
      expect(mascotMood(at(status), false)).toBe("idle");
    }
    expect(mascotMood(undefined, false)).toBe("idle");
  });
});

describe("withTyping", () => {
  it("wins over the two moods with nothing of the agent's in them", () => {
    // Waiting is the better of the two trades: what is being typed is the answer it stopped for.
    expect(withTyping("idle", true)).toBe("typing");
    expect(withTyping("waiting", true)).toBe("typing");
  });

  it("loses to everything that is happening on the agent's side", () => {
    expect(withTyping("working", true)).toBe("working");
    expect(withTyping("error", true)).toBe("error");
    expect(withTyping("quota", true)).toBe("quota");
  });

  it("changes nothing when nobody is typing", () => {
    for (const mood of ["working", "waiting", "quota", "error", "idle"] as const) {
      expect(withTyping(mood, false)).toBe(mood);
    }
    expect(withTyping(undefined, false)).toBeUndefined();
  });

  it("stands on its own where there is no agent to read a mood from", () => {
    // The empty thread of a project with no team still has a box to type into.
    expect(withTyping(undefined, true)).toBe("typing");
  });
});
