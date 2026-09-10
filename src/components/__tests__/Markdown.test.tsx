import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/shell/Markdown";
import { baseDictionary, dictionaries, resolveLanguage, translate } from "@/i18n";

// The card's header comes from the dictionary. Rendered on the server, the store hands back its
// initial state (language null), so the label is the one the host's own language resolves to.
// `<Markdown>` reads it through `useT()`, which falls back to Spanish the same way this does when
// that language is not loaded yet, so the two stay in step regardless of what the host resolves to.
const label = (key: string) =>
  translate(dictionaries[resolveLanguage(null)] ?? baseDictionary, baseDictionary, key);

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

  // The question it describes is drawn under the answer; printing the JSON says it twice, and the
  // second one runs off the side of a phone.
  it("says nothing for an ask block", () => {
    const out = html('Listo.\n\n```ask\n{\"question\":\"¿Por dónde arrancamos?\",\"options\":[\"Una\",\"Otra\"]}\n```');
    expect(out).toContain("Listo.");
    expect(out).not.toContain("question");
    expect(out).not.toContain("<pre");
  });

  // react-markdown blanks out a `file:` href on its own, so without `urlTransform` the link comes
  // back empty and this renders as the plain span again — silently, which is how the bug looked.
  it("draws a file: link as a button, never as an href the window can follow", () => {
    const out = html("[ARCHIVO](file:///C:/Users/matia/archivo.txt)");
    expect(out).toContain("<button");
    expect(out).toContain("ARCHIVO");
    expect(out).not.toContain('href="file:');
  });

  it("still refuses a scheme that runs in the page", () => {
    const out = html("[x](javascript:alert%281%29)");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<a ");
  });

  it("renders nothing for empty text", () => {
    expect(html("   ")).toBe("");
  });
});
