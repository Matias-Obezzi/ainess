import { describe, it, expect } from "vitest";
import { activeVarQuery, applyVarSuggestion } from "../template-vars";

describe("template-vars", () => {
  it("activeVarQuery", () => {
    expect(activeVarQuery("hola {{ag", 9)).toEqual({ start: 5, query: "ag" });
    expect(activeVarQuery("hola {{project}} adios", 16)).toBeNull();
    expect(activeVarQuery("hola", 4)).toBeNull();
    expect(activeVarQuery("{{output|3", 10)).toBeNull();
  });

  it("applyVarSuggestion", () => {
    expect(applyVarSuggestion("hola {{ag", 5, 9, "agent")).toEqual({ text: "hola {{agent}}", caret: 14 });
  });
});
