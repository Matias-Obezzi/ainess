// What the communication panel renders as prose and what it leaves alone.
//
// The line between the two is not cosmetic: a tool line carries paths like
// `src/lib/__tests__/x.ts`, and markdown reads that as an instruction to bold half of it.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageItem } from "@/components/MessageItem";
import type { CommMessage, MessageKind } from "@/types";

const message = (kind: MessageKind, text: string): CommMessage => ({
  id: `m-${kind}`,
  ts: 1725840000000,
  fromAgentId: "agent-1",
  toAgentId: "agent-2",
  kind,
  text,
});

const html = (m: CommMessage) => renderToStaticMarkup(<MessageItem message={m} />);

describe("MessageItem", () => {
  it("renders an agent's prose as markdown", () => {
    for (const kind of ["text", "delegation", "result", "note"] as MessageKind[]) {
      const out = html(message(kind, "esto es **importante** y esto `código`"));
      // The renderer styles its own tags, so match the tag and the word, not the exact markup.
      expect(out).toMatch(/<strong[^>]*>importante<\/strong>/);
      expect(out).toContain("<code");
      expect(out).not.toContain("**importante**");
    }
  });

  it("leaves a tool line exactly as it came", () => {
    const out = html(message("tool", "Read src/lib/__tests__/message-raw.test.ts"));
    expect(out).toContain("src/lib/__tests__/message-raw.test.ts");
    expect(out).not.toContain("<strong>");
  });

  it("leaves stderr alone too", () => {
    const out = html(message("stderr", "warning: __init__ failed *twice*"));
    expect(out).toContain("__init__");
    expect(out).toContain("*twice*");
    expect(out).not.toContain("<em>");
  });

  it("shows what the user typed the way they typed it", () => {
    for (const kind of ["user", "instruction"] as MessageKind[]) {
      const out = html(message(kind, "arreglá el **login**"));
      expect(out).toContain("**login**");
      expect(out).not.toContain("<strong>");
    }
  });

  it("keeps a heading from swallowing the line it was never meant to be", () => {
    // `#` at the start of a tool summary is a path fragment, not a title.
    const out = html(message("tool", "Grep #region in src"));
    expect(out).toContain("#region");
    expect(out).not.toContain("<h1");
  });
});
