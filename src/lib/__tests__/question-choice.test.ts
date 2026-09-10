// The marks made on a question before it is sent.
//
// There was no state to test before: on a single-answer question the click WAS the answer. Now both
// kinds wait for a send button, so there is an in-between, and the rules of that in-between are the
// ones a user would notice being wrong — a second click that does nothing, or an answer that goes
// out saying two contradictory things because the option and the free text were both kept.
import { describe, it, expect } from "vitest";
import { answerOf, EMPTY_CHOICE, pickOption, typeOther } from "@/lib/question-choice";

describe("pickOption, one answer", () => {
  it("marks the option", () => {
    expect(pickOption(EMPTY_CHOICE, "Postgres", false).chosen).toEqual(["Postgres"]);
  });

  it("replaces rather than adds", () => {
    const first = pickOption(EMPTY_CHOICE, "Postgres", false);
    expect(pickOption(first, "SQLite", false).chosen).toEqual(["SQLite"]);
  });

  it("unmarks when the same one is clicked again, so a misclick is undoable", () => {
    const first = pickOption(EMPTY_CHOICE, "Postgres", false);
    expect(pickOption(first, "Postgres", false).chosen).toEqual([]);
  });

  it("clears the free text, because one answer cannot also be a different sentence", () => {
    const typed = typeOther(EMPTY_CHOICE, "ninguna, usemos SQLite", false);
    expect(pickOption(typed, "Postgres", false)).toEqual({ chosen: ["Postgres"], other: "" });
  });
});

describe("pickOption, several answers", () => {
  it("adds up", () => {
    const a = pickOption(EMPTY_CHOICE, "uno", true);
    expect(pickOption(a, "dos", true).chosen).toEqual(["uno", "dos"]);
  });

  it("toggles one off without touching the rest", () => {
    const both = pickOption(pickOption(EMPTY_CHOICE, "uno", true), "dos", true);
    expect(pickOption(both, "uno", true).chosen).toEqual(["dos"]);
  });

  it("keeps the free text: here they are not in competition", () => {
    const typed = typeOther(EMPTY_CHOICE, "y también esto", true);
    expect(pickOption(typed, "uno", true)).toEqual({ chosen: ["uno"], other: "y también esto" });
  });
});

describe("typeOther", () => {
  it("unmarks the option on a single-answer question", () => {
    const picked = pickOption(EMPTY_CHOICE, "Postgres", false);
    expect(typeOther(picked, "ninguna", false)).toEqual({ chosen: [], other: "ninguna" });
  });

  it("leaves the marks alone on a multiple one", () => {
    const picked = pickOption(EMPTY_CHOICE, "uno", true);
    expect(typeOther(picked, "y esto", true).chosen).toEqual(["uno"]);
  });

  it("whitespace is not typing, so it unmarks nothing", () => {
    const picked = pickOption(EMPTY_CHOICE, "Postgres", false);
    expect(typeOther(picked, "   ", false).chosen).toEqual(["Postgres"]);
  });
});

describe("answerOf", () => {
  it("is empty when nothing was marked, which is what keeps send disabled", () => {
    expect(answerOf(EMPTY_CHOICE)).toEqual([]);
  });

  it("ignores free text that is only whitespace", () => {
    expect(answerOf({ chosen: [], other: "   " })).toEqual([]);
  });

  it("puts the typed answer last, trimmed", () => {
    expect(answerOf({ chosen: ["uno"], other: "  y esto  " })).toEqual(["uno", "y esto"]);
  });
});
