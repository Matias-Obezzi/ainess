// A resumed CLI session replays the conversation it was opened with, roster and all. Change the
// team and the agent keeps delegating to names that no longer exist — which is what this machine's
// history caught in the act:
//
//   Delegation failed: no agent named "claude" answers to Planner.
import { describe, it, expect } from "vitest";
import { teamFingerprint, sessionKnowsTeam } from "@/lib/session-team";

const named = (name: string) => ({ name });

describe("teamFingerprint", () => {
  it("is the same for the same team", () => {
    const a = teamFingerprint(named("Planner"), [named("Impl 1"), named("Impl 2")]);
    const b = teamFingerprint(named("Planner"), [named("Impl 1"), named("Impl 2")]);
    expect(a).toBe(b);
  });

  // The order agents happen to sit in is not a change to the team.
  it("does not mind the order of the children", () => {
    expect(teamFingerprint(named("P"), [named("a"), named("b")]))
      .toBe(teamFingerprint(named("P"), [named("b"), named("a")]));
  });

  it("does not mind case or surrounding space, which is how a delegation resolves anyway", () => {
    expect(teamFingerprint(named(" Planner "), [named("Impl 1")]))
      .toBe(teamFingerprint(named("planner"), [named("impl 1")]));
  });

  it("changes when a child is added", () => {
    expect(teamFingerprint(named("P"), [named("a")]))
      .not.toBe(teamFingerprint(named("P"), [named("a"), named("b")]));
  });

  it("changes when a child is renamed", () => {
    expect(teamFingerprint(named("P"), [named("claude")]))
      .not.toBe(teamFingerprint(named("P"), [named("Implementer 1")]));
  });

  // The agent's own name is in the prompt too, and a delegation can name a sibling by it.
  it("changes when the agent itself is renamed", () => {
    expect(teamFingerprint(named("Claude"), [named("a")]))
      .not.toBe(teamFingerprint(named("Planner"), [named("a")]));
  });

  it("tells one child from none", () => {
    expect(teamFingerprint(named("P"), [])).not.toBe(teamFingerprint(named("P"), [named("a")]));
  });
});

describe("sessionKnowsTeam", () => {
  it("resumes a session opened with this team", () => {
    const team = teamFingerprint(named("P"), [named("a")]);
    expect(sessionKnowsTeam(team, team)).toBe(true);
  });

  it("refuses a session opened with another team", () => {
    expect(sessionKnowsTeam(teamFingerprint(named("P"), [named("claude")]), teamFingerprint(named("P"), [named("a")]))).toBe(false);
  });

  // Sessions that predate the stamp: adopted rather than thrown away, or every agent in every
  // project would lose its context the first time this build runs.
  it("adopts a session that was never stamped", () => {
    expect(sessionKnowsTeam(undefined, teamFingerprint(named("P"), [named("a")]))).toBe(true);
  });
});
