// What the box offers to write for you.
//
// The two halves fail in opposite directions and both matter. A suggested reply that appears on an
// open question puts a "yes" where a choice was asked for. A completion that appears too eagerly
// covers what you are still typing with something you wrote once, weeks ago.
import { describe, it, expect } from "vitest";
import { ghostFor, historyCompletion, isClosedQuestion, trailingQuestion } from "@/lib/ghost-suggestion";

describe("trailingQuestion", () => {
  it("finds the question an answer ends with", () => {
    const answer = "Listo, cambié los tres archivos.\n\n¿Querés que lo arregle?";
    expect(trailingQuestion(answer)).toBe("¿Querés que lo arregle?");
  });

  it("takes only the last sentence of that line", () => {
    expect(trailingQuestion("Ya está. ¿Lo corro?")).toBe("¿Lo corro?");
  });

  it("says nothing when the message does not end by asking", () => {
    expect(trailingQuestion("Listo, quedó arreglado.")).toBeNull();
    expect(trailingQuestion("")).toBeNull();
  });

  it("ignores a question that is not the last thing said", () => {
    // The agent asked and then answered itself: there is nothing left to reply to.
    expect(trailingQuestion("¿Por qué fallaba? Porque faltaba el import. Ya está.")).toBeNull();
  });

  it("does not read a code fence as a question", () => {
    expect(trailingQuestion("Mirá esto:\n```\nfoo?\n```")).toBeNull();
  });
});

describe("isClosedQuestion", () => {
  it("takes a question that wants a yes", () => {
    for (const q of ["¿Querés que lo arregle?", "¿Lo corro?", "Want me to fix it?", "Should I retry?"]) {
      expect({ q, closed: isClosedQuestion(q) }).toEqual({ q, closed: true });
    }
  });

  it("leaves a question that wants a choice alone", () => {
    // Answering "sí" to "¿cuál preferís?" is worse than answering nothing.
    for (const q of ["¿Cuál preferís?", "¿Qué hago?", "¿Cómo seguimos?", "Which one?", "What should I do?"]) {
      expect({ q, closed: isClosedQuestion(q) }).toEqual({ q, closed: false });
    }
  });
});

describe("historyCompletion", () => {
  const past = ["arreglalo y corré los tests", "andá al otro proyecto", "arreglá el build"];

  it("completes from the most recent match", () => {
    expect(historyCompletion("arre", past)).toBe("glalo y corré los tests");
  });

  it("keeps the past message's own casing", () => {
    expect(historyCompletion("ARRE", past)).toBe("glalo y corré los tests");
  });

  it("stays quiet until enough has been typed", () => {
    // Two characters match half of everything; the suggestion would flicker on every keystroke.
    expect(historyCompletion("a", past)).toBeNull();
    expect(historyCompletion("ar", past)).toBeNull();
  });

  it("offers nothing when what you typed is already the whole message", () => {
    expect(historyCompletion("arreglá el build", past)).toBeNull();
  });

  it("offers nothing when nothing matches", () => {
    expect(historyCompletion("zzz", past)).toBeNull();
  });
});

describe("ghostFor", () => {
  const affirmative = "Sí, dale";

  it("offers the yes on an empty box after a closed question", () => {
    expect(ghostFor({ text: "", past: [], lastAgentMessage: "Listo. ¿Lo arreglo?", affirmative }))
      .toEqual({ text: "Sí, dale", source: "reply" });
  });

  it("offers nothing on an empty box after an open question", () => {
    expect(ghostFor({ text: "", past: [], lastAgentMessage: "¿Cuál de las dos?", affirmative })).toBeNull();
  });

  it("offers nothing on an empty box when the agent did not ask", () => {
    expect(ghostFor({ text: "", past: [], lastAgentMessage: "Quedó listo.", affirmative })).toBeNull();
  });

  it("stops offering the yes the moment you start writing", () => {
    // You have said what you think of the question; a "yes" after your words is nonsense.
    expect(ghostFor({ text: "no,", past: [], lastAgentMessage: "¿Lo arreglo?", affirmative })).toBeNull();
  });

  it("completes from your own history once you are writing", () => {
    const ghost = ghostFor({ text: "arre", past: ["arreglalo y corré los tests"], lastAgentMessage: "¿Lo arreglo?", affirmative });
    expect(ghost).toEqual({ text: "glalo y corré los tests", source: "history" });
  });

  it("treats a box of only spaces as empty", () => {
    expect(ghostFor({ text: "   ", past: [], lastAgentMessage: "¿Lo arreglo?", affirmative })?.source).toBe("reply");
  });
});
