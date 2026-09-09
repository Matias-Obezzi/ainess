// A path is told apart by its end, not its beginning.
import { describe, it, expect } from "vitest";
import { shortenPath } from "@/lib/format";

describe("shortenPath", () => {
  it("leaves a path that already fits", () => {
    expect(shortenPath("C:/dev/app", 40)).toBe("C:/dev/app");
  });

  it("keeps the end, which is the part that says which project this is", () => {
    const a = "C:/Users/me/Desktop/projects/ainess";
    const b = "C:/Users/me/Desktop/projects/something-else";
    expect(shortenPath(a, 16)).toBe("…/projects/ainess");
    expect(shortenPath(a, 16).endsWith("ainess")).toBe(true);
    expect(shortenPath(b, 16).endsWith("something-else")).toBe(true);
    // Two projects side by side must not shorten to the same string.
    expect(shortenPath(a, 16)).not.toBe(shortenPath(b, 16));
  });

  it("marks that it cut something", () => {
    expect(shortenPath("C:/Users/me/Desktop/projects/ainess", 10).startsWith("…")).toBe(true);
  });

  it("handles the edges without throwing", () => {
    expect(shortenPath("", 10)).toBe("");
    expect(shortenPath("C:/dev", 0)).toBe("");
  });
});
