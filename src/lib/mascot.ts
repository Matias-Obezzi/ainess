import type { AgentStatus } from "@/types";

// Every project gets its own creature, and it gets it without anyone drawing one: the traits are
// derived from the project's identity, so the same project always shows the same face and two
// projects side by side almost never show the same one.
//
// Pure and DOM-free on purpose — the component in `components/ProjectMascot.tsx` only reads the
// traits and paints them, so what is worth pinning down in a test lives here.

/**
 * FNV-1a, 32 bits. Small, stable across runs and machines, and good enough at spreading two
 * near-identical strings ("api-v1", "api-v2") into unrelated numbers.
 *
 * Returns an unsigned integer: `Math.imul` works on signed 32-bit words, so the final `>>> 0` is
 * what keeps the result from coming back negative and the traits from going out of range.
 */
export function mascotHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface MascotTraits {
  /** Silhouette: 0 capsule, 1 soft square, 2 drop, 3 rounded hexagon. */
  body: 0 | 1 | 2 | 3;
  /** Expression: 0 round eyes, 1 visor, 2 wink, 3 mismatched eyes. */
  eyes: 0 | 1 | 2 | 3;
  /** Headpiece: 0 antenna, 1 ears, 2 halo, 3 none. */
  crown: 0 | 1 | 2 | 3;
  /** Fallback hue, only used when the project has no colour of its own. */
  hue: number;
}

/**
 * The seed is the project id and nothing else. The name is deliberately left out: a project that
 * gets renamed is still the same project, and having its mascot change faces on a rename would
 * read as the app having lost track of it.
 */
export function mascotTraits(seed: string): MascotTraits {
  const h = mascotHash(seed);
  // Each trait reads a different slice of the hash, so two seeds that collide on the low bits
  // still differ everywhere else instead of producing the very same creature.
  return {
    body: (h % 4) as 0 | 1 | 2 | 3,
    eyes: ((h >>> 3) % 4) as 0 | 1 | 2 | 3,
    crown: ((h >>> 6) % 4) as 0 | 1 | 2 | 3,
    hue: (h >>> 9) % 360,
  };
}

/** What the creature is doing, one step coarser than `AgentStatus`: four things read at a glance. */
export type MascotMood = "working" | "waiting" | "quota" | "idle";

/**
 * The mood of the agent the mascot stands for. Takes what was already read out of the store rather
 * than the store itself, so it stays as testable as the rest of this file.
 *
 * Out of tokens wins over everything: an agent parked waiting for its quota back still carries
 * whatever status it had when it stopped, and that status is the less useful of the two.
 */
export function mascotMood(runtime: { status: AgentStatus } | undefined, outOfTokens: boolean): MascotMood {
  if (outOfTokens) return "quota";
  if (runtime?.status === "working") return "working";
  if (runtime?.status === "waiting") return "waiting";
  // `stopped` and `error` included: neither is worth its own animation, and both mean the same to
  // someone looking at a corner of the screen — nothing is happening.
  return "idle";
}
