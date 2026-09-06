import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/shell/Markdown";
import { baseDictionary, dictionaries, resolveLanguage, translate } from "@/i18n";

// The card's header comes from the dictionary. Rendered on the server, the store hands back its
// initial state (language null), so the label is the one the host's own language resolves to.
const label = (key: string) =>
  translate(dictionaries[resolveLanguage(null)], baseDictionary, key);

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe("Markdown", () => {
  it("renders gfm markdown", () => {
    const out = html("# Hola\n\n- uno\n- dos\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n`inline` y [link](https://x.com)");
    expect(out).toContain("<h1");
    expect(out).toContain("<li");
    expect(out).toContain("<table");
    expect(out).toContain("<code");
    expect(out).toContain('href="https://x.com"');
  });

  it("renders a fenced code block once, with its text", () => {
    const out = html("```ts\nconst a = 1;\n```");
    expect(out).toContain("const a = 1;");
    expect((out.match(/<pre/g) || []).length).toBe(1);
  });

  it("turns a delegate block into a delegation card", () => {
    const out = html('```delegate\n{"tasks":[{"agent":"Obrero","task":"Arreglar tests"}]}\n```');
    expect(out).toContain(label("label.kind.delegation"));
    expect(out).toContain("Obrero");
    expect(out).toContain("Arreglar tests");
    expect(out).not.toContain("<pre");
  });

  it("renders nothing for empty text", () => {
    expect(html("   ")).toBe("");
  });
});
