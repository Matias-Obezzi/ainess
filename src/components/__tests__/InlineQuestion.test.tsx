// How a question is put on screen before it is answered.
//
// Three things here are the fix rather than decoration. The options are a list, one per row and the
// full width of the box — as inline buttons each one was as wide as its own text, so a one-word
// option was a target the size of the word. A question that takes several answers says so, because
// nothing about a list of options tells you whether the second click keeps the first. And the send
// button is always there: answering is two steps now for both kinds, not one click for some.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionPrompt } from "@/components/InlineQuestion";
import type { AgentQuestion } from "@/types";

const question = (over: Partial<AgentQuestion> = {}): AgentQuestion => ({
  id: "q1",
  projectId: "p1",
  agentId: "a1",
  runId: "run-1",
  rootRunId: "run-1",
  round: 0,
  question: "¿Con cuál seguimos?",
  options: ["Postgres", "SQLite"],
  multiple: false,
  allowOther: true,
  status: "pending",
  createdAt: 10,
  ...over,
});

const render = (q: AgentQuestion) => renderToStaticMarkup(<QuestionPrompt question={q} onAnswer={() => {}} />);

describe("QuestionPrompt", () => {
  it("puts every option in its own list row", () => {
    const html = render(question());
    expect(html).toContain("<ul");
    expect((html.match(/<li/g) ?? []).length).toBe(2);
    expect(html).toContain("Postgres");
    expect(html).toContain("SQLite");
  });

  it("gives each option the full width of the box", () => {
    // The whole point of the list: a row you can hit, not a chip the size of its own label.
    const html = render(question());
    expect(html).toMatch(/<button[^>]*class="[^"]*\bw-full\b/);
  });

  it("says so when several answers are allowed", () => {
    expect(render(question({ multiple: true }))).toContain("Podés elegir más de una.");
  });

  it("stays quiet when only one answer is allowed", () => {
    expect(render(question({ multiple: false }))).not.toContain("Podés elegir más de una.");
  });

  it("offers send even on a one-answer question, and disabled until something is marked", () => {
    // It used to answer on the first click, so there was no button here at all.
    const html = render(question({ multiple: false, allowOther: false }));
    expect(html).toContain("Responder");
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("marks the options as radios or checkboxes to match the kind of question", () => {
    expect(render(question({ multiple: false }))).toContain('role="radio"');
    expect(render(question({ multiple: true }))).toContain('role="checkbox"');
  });

  it("shows nothing to pick once it has been answered", () => {
    const html = render(question({ status: "answered", answer: ["Postgres"] }));
    expect(html).not.toContain("<ul");
    expect(html).toContain("Postgres");
  });
});
