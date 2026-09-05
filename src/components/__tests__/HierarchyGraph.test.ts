import { describe, it, expect } from "vitest";
import { layoutAgents, NODE_WIDTH, GAP_X } from "@/components/HierarchyGraph";

const agent = (id: string, parentId: string | null = null) => ({ id, parentId });

describe("layoutAgents", () => {
  it("stacks levels by depth", () => {
    const pos = layoutAgents([agent("a"), agent("b", "a"), agent("c", "b")]);
    expect(pos.a.y).toBe(0);
    expect(pos.b.y).toBeGreaterThan(pos.a.y);
    expect(pos.c.y).toBeGreaterThan(pos.b.y);
  });

  it("centers a parent over its children", () => {
    const pos = layoutAgents([agent("p"), agent("x", "p"), agent("y", "p")]);
    expect(pos.p.x).toBeCloseTo((pos.x.x + pos.y.x) / 2);
    expect(pos.y.x - pos.x.x).toBeCloseTo(NODE_WIDTH + GAP_X);
  });

  it("keeps sibling subtrees from overlapping", () => {
    const pos = layoutAgents([
      agent("root"),
      agent("left", "root"),
      agent("right", "root"),
      agent("l1", "left"),
      agent("l2", "left")
    ]);
    expect(pos.right.x - pos.left.x).toBeGreaterThanOrEqual(NODE_WIDTH + GAP_X);
    expect(pos.l2.x - pos.l1.x).toBeCloseTo(NODE_WIDTH + GAP_X);
    expect(pos.left.x).toBeCloseTo((pos.l1.x + pos.l2.x) / 2);
  });

  it("lays out orphans and cycles as extra roots", () => {
    const pos = layoutAgents([agent("orphan", "ghost"), agent("a", "b"), agent("b", "a")]);
    expect(Object.keys(pos).sort()).toEqual(["a", "b", "orphan"]);
    expect(pos.orphan.y).toBe(0);
  });

  it("returns nothing for an empty roster", () => {
    expect(layoutAgents([])).toEqual({});
  });
});
