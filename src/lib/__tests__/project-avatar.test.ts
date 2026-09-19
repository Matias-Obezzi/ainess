// The two letters in a project's circle and the colour they are written in. Both are pure, and
// both have to survive names nobody designed for them: a folder is called whatever it is called.
import { describe, it, expect } from "vitest";
import { projectInitials, readableTextColor } from "@/lib/avatar";

describe("project initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(projectInitials("desde-abajo")).toBe("DA");
    expect(projectInitials("hola mundo")).toBe("HM");
    expect(projectInitials("mi_proyecto")).toBe("MP");
    expect(projectInitials("api.gateway")).toBe("AG");
    expect(projectInitials("web/client")).toBe("WC");
    // Three words or thirty: the first two are the ones that fit.
    expect(projectInitials("una cosa más")).toBe("UC");
  });

  it("reads a camelCase name as two words", () => {
    expect(projectInitials("miProyecto")).toBe("MP");
    expect(projectInitials("aiNessDesktop")).toBe("AN");
  });

  it("gives a single word its first two letters", () => {
    expect(projectInitials("ainess")).toBe("AI");
    expect(projectInitials("Checkout")).toBe("CH");
    // One letter is all there is; padding it would be inventing a name.
    expect(projectInitials("a")).toBe("A");
  });

  it("holds up on names that are not latin", () => {
    expect(projectInitials("日本語")).toBe("日本");
    expect(projectInitials("проект аврора")).toBe("ПА");
    expect(projectInitials("Ñandú")).toBe("ÑA");
    // One emoji is one character, not half a surrogate pair.
    expect(projectInitials("🚀")).toBe("🚀");
    expect(projectInitials("🚀 launcher")).toBe("🚀L");
  });

  it("still draws something when the name is nothing", () => {
    for (const name of ["", "   ", "---", "___", "  -  ", undefined as unknown as string]) {
      expect(projectInitials(name)).not.toBe("");
      expect(projectInitials(name)).toBe(projectInitials(name));
    }
  });
});

describe("readable text colour", () => {
  it("writes black on a light colour and white on a dark one", () => {
    expect(readableTextColor("#ffff00")).toBe("#000000"); // yellow
    expect(readableTextColor("#ffffff")).toBe("#000000");
    expect(readableTextColor("#001f3f")).toBe("#ffffff"); // navy
    expect(readableTextColor("#000000")).toBe("#ffffff");
  });

  it("decides the middle of the range by luminance, not by the bytes", () => {
    // Both are mid-grey to a byte counter; only the green one is bright to an eye.
    expect(readableTextColor("#00a000")).toBe("#000000");
    expect(readableTextColor("#0000ff")).toBe("#ffffff");
    // The default project blue, and one step either side of the black/white line.
    expect(readableTextColor("#4f8cff")).toBe("#000000");
    expect(readableTextColor("#6e6e6e")).toBe("#ffffff");
    expect(readableTextColor("#808080")).toBe("#000000");
  });

  it("falls back instead of throwing on a colour it cannot read", () => {
    expect(["#000000", "#ffffff"]).toContain(readableTextColor(""));
    expect(["#000000", "#ffffff"]).toContain(readableTextColor("not a colour"));
  });
});
