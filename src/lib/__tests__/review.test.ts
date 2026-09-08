import { describe, it, expect } from "vitest";
import { parseReviewVerdict, pickReviewer } from "../review";

describe("parseReviewVerdict", () => {
  it("returns approved for APROBADO", () => {
    expect(parseReviewVerdict("El codigo esta bien.\nVEREDICTO: APROBADO")).toBe("approved");
  });

  it("returns changes for CAMBIOS", () => {
    expect(parseReviewVerdict("Falta algo.\nVEREDICTO: CAMBIOS")).toBe("changes");
  });

  it("returns approved for APPROVED (English)", () => {
    expect(parseReviewVerdict("All good.\nVERDICT: APPROVED")).toBe("approved");
  });

  it("returns changes for CHANGES (English)", () => {
    expect(parseReviewVerdict("Needs work.\nVERDICT: CHANGES")).toBe("changes");
  });

  it("is case-insensitive", () => {
    expect(parseReviewVerdict("verdict: approved")).toBe("approved");
  });

  it("returns changes when no verdict is found", () => {
    expect(parseReviewVerdict("Me parece bien")).toBe("changes");
  });

  it("picks the last verdict when there are multiple", () => {
    const text = `
VEREDICTO: CAMBIOS
Wait, I found something.
Actually, it's fine.
VEREDICTO: APROBADO
    `;
    expect(parseReviewVerdict(text)).toBe("approved");
  });
});

describe("pickReviewer", () => {
  const agents = [
    { id: "a1", role: "planner" },
    { id: "a2", role: "reviewer" },
    { id: "a3", role: "reviewer" },
    { id: "a4", role: "implementer" },
  ];

  it("returns the first reviewer", () => {
    expect(pickReviewer(agents, "a1")).toEqual({ id: "a2", role: "reviewer" });
  });

  it("skips the excluded agent", () => {
    expect(pickReviewer(agents, "a2")).toEqual({ id: "a3", role: "reviewer" });
  });

  it("returns undefined if no reviewer exists", () => {
    expect(pickReviewer([{ id: "a1", role: "planner" }], "a1")).toBeUndefined();
  });

  it("returns undefined if the only reviewer is the excluded agent", () => {
    expect(pickReviewer([{ id: "a2", role: "reviewer" }], "a2")).toBeUndefined();
  });
});
