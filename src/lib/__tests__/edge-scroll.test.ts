import { describe, it, expect } from "vitest";
import { edgeScrollStep, EDGE_ZONE_PX, EDGE_MAX_SPEED } from "@/lib/edge-scroll";

const rect = { start: 100, end: 900 };

describe("edgeScrollStep", () => {
  it("does not pull from the middle", () => {
    expect(edgeScrollStep(500, rect)).toBe(0);
  });

  it("pulls towards the start near the left edge and towards the end near the right", () => {
    expect(edgeScrollStep(rect.start + 10, rect)).toBeLessThan(0);
    expect(edgeScrollStep(rect.end - 10, rect)).toBeGreaterThan(0);
  });

  it("is still at the edge of the zone and fastest at the edge of the container", () => {
    expect(edgeScrollStep(rect.start + EDGE_ZONE_PX, rect)).toBe(0);
    expect(edgeScrollStep(rect.start, rect)).toBe(-EDGE_MAX_SPEED);
    expect(edgeScrollStep(rect.end, rect)).toBe(EDGE_MAX_SPEED);
  });

  it("ramps rather than jumping to full speed", () => {
    const near = Math.abs(edgeScrollStep(rect.start + 8, rect));
    const far = Math.abs(edgeScrollStep(rect.start + EDGE_ZONE_PX - 8, rect));
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it("keeps pulling when the pointer runs past the container", () => {
    expect(edgeScrollStep(rect.start - 200, rect)).toBe(-EDGE_MAX_SPEED);
    expect(edgeScrollStep(rect.end + 200, rect)).toBe(EDGE_MAX_SPEED);
  });

  // Two zones wider than the container would overlap, and a pointer in the middle would be told to
  // go both ways at once. Each edge gets its own half instead.
  it("does not pull both ways in a container narrower than two zones", () => {
    const narrow = { start: 0, end: 80 };
    expect(edgeScrollStep(41, narrow)).toBeGreaterThanOrEqual(0);
    expect(edgeScrollStep(39, narrow)).toBeLessThanOrEqual(0);
    expect(edgeScrollStep(40, narrow)).toBe(0);
  });

  it("answers zero for a container with no width", () => {
    expect(edgeScrollStep(10, { start: 50, end: 50 })).toBe(0);
  });
});
