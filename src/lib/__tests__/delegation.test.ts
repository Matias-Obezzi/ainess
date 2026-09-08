import { describe, it, expect } from "vitest";
import { resolveDelegations } from "@/lib/delegation";

describe("resolveDelegations", () => {
  const children = [
    { id: "a1", name: "Planner" },
    { id: "a2", name: "Coder" },
    { id: "a3", name: "QA" }
  ];

  it("returns empty lists for empty delegations", () => {
    const { resolved, unknown } = resolveDelegations([], children);
    expect(resolved).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it("resolves exact matches by name", () => {
    const { resolved, unknown } = resolveDelegations([{ agent: "Coder" }], children);
    expect(resolved).toEqual([children[1]]);
    expect(unknown).toEqual([]);
  });

  it("resolves case-insensitively by name", () => {
    const { resolved, unknown } = resolveDelegations([{ agent: "coder" }, { agent: "Qa" }], children);
    expect(resolved).toEqual([children[1], children[2]]);
    expect(unknown).toEqual([]);
  });

  it("resolves by exact id", () => {
    const { resolved, unknown } = resolveDelegations([{ agent: "a1" }], children);
    expect(resolved).toEqual([children[0]]);
    expect(unknown).toEqual([]);
  });

  it("gathers unknown agents without repeating them", () => {
    const { resolved, unknown } = resolveDelegations(
      [
        { agent: "Coder" },
        { agent: "Designer" },
        { agent: "Designer" },
        { agent: "Missing" }
      ],
      children
    );
    expect(resolved).toEqual([children[1]]);
    expect(unknown).toEqual(["Designer", "Missing"]);
  });

  it("puts all in unknown if children list is empty", () => {
    const { resolved, unknown } = resolveDelegations([{ agent: "Coder" }], []);
    expect(resolved).toEqual([]);
    expect(unknown).toEqual(["Coder"]);
  });
});
