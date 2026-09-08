import { describe, it, expect } from "vitest";
import { changedProjectsFromMessages } from "../history";
import type { CommMessage } from "@/types";

describe("changedProjectsFromMessages", () => {
  const m = (id: string, projectId: string = "p1"): CommMessage => ({
    id,
    projectId,
    ts: 1,
    fromAgentId: "agent1",
    kind: "text",
    text: "test"
  });

  it("returns empty when arrays are the same reference", () => {
    const arr = [m("1")];
    expect(changedProjectsFromMessages(arr, arr)).toEqual([]);
  });

  it("detects an appended message", () => {
    const m1 = m("1");
    const m2 = m("2", "p2");
    const prev = [m1];
    const next = [m1, m2];
    expect(changedProjectsFromMessages(next, prev)).toEqual(["p2"]);
  });

  it("detects mutation of the last element", () => {
    const m1 = m("1");
    const m2a = m("2", "p2");
    const m2b = { ...m2a, text: "changed" } as CommMessage;
    
    const prev = [m1, m2a];
    const next = [m1, m2b];
    expect(changedProjectsFromMessages(next, prev)).toEqual(["p2"]);
  });

  it("detects slice from the beginning", () => {
    const m1 = m("1", "p1");
    const m2 = m("2", "p2");
    const m3 = m("3", "p3");
    
    const prev = [m1, m2, m3];
    const next = [m3];
    // Since index 0 in `next` is m3, and index 0 in `prev` is m1, they mismatch.
    // changedProjectsFromMessages walks from length 3 down to 0, finding all mismatches.
    const res = changedProjectsFromMessages(next, prev);
    expect(res).toContain("p3");
    expect(res).toContain("p2");
    expect(res).toContain("p1");
  });
});
