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
    expect(out).not.toContain("<pre");
  });

  // Shut, a task says what it is, in the reader's language. The instruction itself is written for
  // the agent doing the work and is only worth reading once you open it.
  it("shows a brief and not the instruction while the task is shut", () => {
    const out = html('```delegate\n{"tasks":[{"agent":"Obrero","task":"Arreglar tests"}]}\n```');
    expect(out).toContain(label("delegation.brief").replace("{name}", "Obrero"));
    expect(out).not.toContain("Arreglar tests");
  });

  it("prefers the title the planner gave the card", () => {
    const out = html('```delegate\n{"tasks":[{"agent":"Obrero","task":"Arreglar tests","title":"Poner en verde la suite"}]}\n```');
    expect(out).toContain("Poner en verde la suite");
    expect(out).not.toContain("Arreglar tests");
  });

  it("opens each task on its own, so there is one toggle per task", () => {
    const out = html('```delegate\n{"tasks":[{"agent":"Uno","task":"a"},{"agent":"Dos","task":"b"}]}\n```');
    expect((out.match(/aria-expanded="false"/g) || []).length).toBe(2);
  });

  // Half-written JSON is not broken JSON: it is a block the agent is still typing.
  it("says who a half-written delegate block is going to, and shows no JSON", () => {
    const partial = '```delegate\n{"tasks":[{"agent":"Obrero","task":"Arregl';
    const streaming = renderToStaticMarkup(<Markdown text={partial} streaming />);
    expect(streaming).toContain(label("delegation.writing").replace("{names}", "Obrero"));
    expect(streaming).not.toContain("tasks");
    expect(streaming).not.toContain("<pre");

    // The same text once the agent has stopped writing is a block that never parsed: an error.
    expect(html(partial)).toContain("<pre");
  });

  // The question it describes is drawn under the answer; printing the JSON says it twice, and the
  // second one runs off the side of a phone.
  it("says nothing for an ask block", () => {
    const out = html('Listo.\n\n```ask\n{\"question\":\"¿Por dónde arrancamos?\",\"options\":[\"Una\",\"Otra\"]}\n```');
    expect(out).toContain("Listo.");
    expect(out).not.toContain("question");
    expect(out).not.toContain("<pre");
  });

  // The reply it holds is the box's grey suggestion, not something the agent said: printed here it
  // would show the user their own answer before they gave it.
  it("says nothing for a suggest block", () => {
    const out = html("Listo, quedó andando.\n\n```suggest\nsí, dale\n```");
    expect(out).toContain("Listo, quedó andando.");
    expect(out).not.toContain("sí, dale");
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
