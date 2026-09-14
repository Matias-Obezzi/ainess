// A chat gets the text of an answer, and the text carries the machine's blocks. Telegram drew one
// as a box of JSON with a "copy" button.
import { describe, it, expect } from "vitest";
import { forChat } from "@/lib/chat-text";

describe("forChat", () => {
  it("puts a question and its options in place of the ask block", () => {
    const text = 'Se puede hacer.\n\n```ask\n{"question":"¿Los tres?","options":["Sí","Solo Telegram","No"],"multiple":false}\n```';
    const out = forChat(text);
    expect(out).not.toContain("```");
    expect(out).not.toContain('"question"');
    expect(out).toContain("¿Los tres?");
    expect(out).toContain("1. Sí");
    expect(out).toContain("3. No");
    expect(out.startsWith("Se puede hacer.")).toBe(true);
  });

  it("says when several answers are allowed", () => {
    const text = '```ask\n{"question":"¿Cuáles?","options":["A","B"],"multiple":true}\n```';
    expect(forChat(text)).toMatch(/A[\s\S]*B[\s\S]*./);
    expect(forChat(text).split("\n").length).toBeGreaterThan(3);
  });

  it("puts one line per task in place of the delegate block", () => {
    const text = 'Voy a repartirlo.\n\n```delegate\n{"tasks":[{"agent":"Implementer 1","task":"## Dónde\\nHacé X"},{"agent":"Reviewer","task":"Revisá"}]}\n```\nListo.';
    const out = forChat(text);
    expect(out).not.toContain("```");
    expect(out).toContain("Implementer 1");
    expect(out).toContain("Dónde");
    expect(out).not.toContain("Hacé X");
    expect(out).toContain("Reviewer");
    expect(out.endsWith("Listo.")).toBe(true);
  });

  it("drops a block that says nothing and leaves plain text alone", () => {
    expect(forChat("```ask\n{not json}\n```\ntexto")).toBe("texto");
    expect(forChat("solo texto, con `código` inline")).toBe("solo texto, con `código` inline");
  });
});
