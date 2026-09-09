import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/template";

describe("renderTemplate", () => {
  it("replaces variables and leaves unknown ones empty", () => {
    expect(renderTemplate("{{agent}} terminó en {{project}}{{nada}}", { agent: "Obrero", project: "ainess" })).toBe("Obrero terminó en ainess");
  });

  it("truncates with {{var|N}}", () => {
    expect(renderTemplate("{{output|5}}", { output: "0123456789" })).toBe("01234…");
    expect(renderTemplate("{{output|20}}", { output: "corto" })).toBe("corto");
  });

  it("serializes objects and tolerates empty templates", () => {
    expect(renderTemplate("{{data}}", { data: { a: 1 } })).toBe('{"a":1}');
    expect(renderTemplate("", { a: 1 })).toBe("");
  });
});
