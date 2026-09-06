import { describe, it, expect } from "vitest";
import { hasMarkdown, toPlainText } from "@/lib/text";

describe("hasMarkdown", () => {
  it("spots formatting", () => {
    expect(hasMarkdown("# Título")).toBe(true);
    expect(hasMarkdown("- uno\n- dos")).toBe(true);
    expect(hasMarkdown("1. uno")).toBe(true);
    expect(hasMarkdown("> citado")).toBe(true);
    expect(hasMarkdown("```ts\nconst a = 1;\n```")).toBe(true);
    expect(hasMarkdown("| a | b |\n| - | - |")).toBe(true);
    expect(hasMarkdown("mirá [esto](https://x.com)")).toBe(true);
    expect(hasMarkdown("esto es **importante**")).toBe(true);
    expect(hasMarkdown("corré `npm test`")).toBe(true);
  });

  it("leaves plain prose alone", () => {
    expect(hasMarkdown("Listo: terminé de arreglar los tests.")).toBe(false);
    expect(hasMarkdown("2 * 3 = 6")).toBe(false);
    expect(hasMarkdown("")).toBe(false);
  });
});

describe("toPlainText", () => {
  it("drops the markdown syntax", () => {
    expect(toPlainText("# Título")).toBe("Título");
    expect(toPlainText("- uno\n- dos")).toBe("• uno\n• dos");
    expect(toPlainText("> citado")).toBe("citado");
    expect(toPlainText("esto es **importante**")).toBe("esto es importante");
    expect(toPlainText("corré `npm test`")).toBe("corré npm test");
    expect(toPlainText("mirá [esto](https://x.com)")).toBe("mirá esto (https://x.com)");
  });

  it("keeps the body of a fenced code block", () => {
    expect(toPlainText("```ts\nconst a = 1;\n```")).toBe("const a = 1;");
  });

  it("returns plain prose untouched", () => {
    expect(toPlainText("Listo: terminé de arreglar los tests.")).toBe("Listo: terminé de arreglar los tests.");
  });
});
