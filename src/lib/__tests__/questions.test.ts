// The `ask` block: how an agent stops to let the user decide instead of guessing.
import { describe, it, expect } from "vitest";
import { parseQuestions, buildSystemPrompt } from "@/lib/providers";
import type { AgentConfig } from "@/types";

const block = (json: string) => "Antes de seguir necesito saber:\n\n```ask\n" + json + "\n```";

describe("parseQuestions", () => {
  it("reads a question with its options", () => {
    const [q] = parseQuestions(block('{"question":"¿Con cuál seguimos?","options":["Postgres","SQLite"]}'));
    expect(q.question).toBe("¿Con cuál seguimos?");
    expect(q.options).toEqual(["Postgres", "SQLite"]);
    // One answer unless it says otherwise, and the user can always write their own.
    expect(q.multiple).toBe(false);
    expect(q.allowOther).toBe(true);
  });

  it("takes several answers when the block asks for them", () => {
    const [q] = parseQuestions(block('{"question":"¿Cuáles migramos?","options":["users","orders","logs"],"multiple":true}'));
    expect(q.multiple).toBe(true);
    expect(q.options).toHaveLength(3);
  });

  it("lets a block close the door on an answer of the user's own", () => {
    const [q] = parseQuestions(block('{"question":"¿Sí o no?","options":["Sí","No"],"allowOther":false}'));
    expect(q.allowOther).toBe(false);
  });

  it("drops what is not a question", () => {
    // One option is not a choice, and neither is none.
    expect(parseQuestions(block('{"question":"¿Seguimos?","options":["Sí"]}'))).toEqual([]);
    expect(parseQuestions(block('{"question":"","options":["a","b"]}'))).toEqual([]);
    expect(parseQuestions(block("no soy json"))).toEqual([]);
    expect(parseQuestions("una respuesta sin bloques")).toEqual([]);
  });

  it("reads every block of an answer that asked twice", () => {
    const text = block('{"question":"¿Base?","options":["PG","SQLite"]}') + "\n\n" +
      block('{"question":"¿Deploy?","options":["Fly","Render"]}');
    expect(parseQuestions(text).map(q => q.question)).toEqual(["¿Base?", "¿Deploy?"]);
  });

  it("survives a question that carries its own fences", () => {
    // The closing fence has to start a line, or the JSON gets cut at the first ``` inside it.
    const [q] = parseQuestions(block('{"question":"¿Uso ```json``` o yaml?","options":["json","yaml"]}'));
    expect(q?.question).toContain("json");
  });
});

const agent = (over: Partial<AgentConfig> = {}): AgentConfig => ({
  id: "a1", name: "Uno", provider: "claude", role: "implementer", parentId: null, autoApprove: false, ...over,
});

describe("the system prompt", () => {
  it("tells every role how to ask", () => {
    for (const role of ["planner", "implementer", "reviewer"] as const) {
      expect(buildSystemPrompt(agent({ role }), []), role).toContain("```ask");
    }
  });

  it("leaves a custom agent's prompt to the user", () => {
    // A custom role is whatever its owner wrote; nothing of ours goes in it.
    expect(buildSystemPrompt(agent({ role: "custom", systemPrompt: "Sos un traductor." }), [])).not.toContain("```ask");
  });
});
