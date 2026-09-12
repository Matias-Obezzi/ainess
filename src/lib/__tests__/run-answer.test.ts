// "The partial answers an agent gives while it works are lost when the activity ends, and it only
// shows the last thing it said." Reported twice, from opposite ends — the other time it read as
// "my answer disappeared when it delegated, only the delegation was left".
//
// Both are the same thing: the bubble showed `run.output`, which for Claude is the `result` line —
// the last message and only the last message. These are the rules for showing the whole turn again.
import { describe, it, expect } from "vitest";
import { runAnswer, runAnswerText, transcriptOf } from "@/lib/run-answer";

describe("runAnswer", () => {
  // The common case: a plain reply is streamed and then repeated as the result. Showing both would
  // print the same paragraph twice.
  it("drops a final answer the stream already is", () => {
    expect(runAnswer("Listo, quedó arreglado.", "Listo, quedó arreglado.")).toEqual({
      transcript: "Listo, quedó arreglado.",
      final: "",
    });
  });

  it("drops a final answer the stream already ends with", () => {
    const streamed = "Miré el archivo.\nCorrí los tests.\nListo.";
    expect(runAnswer(streamed, "Listo.")).toEqual({ transcript: streamed, final: "" });
  });

  // The bug itself: everything before the last line used to vanish the moment the run ended.
  it("keeps what was said before a final answer that does not contain it", () => {
    const streamed = "Encontré la causa: el índice no existía.";
    const answer = runAnswer(streamed, "```delegate\n{}\n```");
    expect(answer.transcript).toBe(streamed);
    expect(answer.final).toBe("```delegate\n{}\n```");
  });

  it("shows the final answer alone when nothing was streamed", () => {
    expect(runAnswer("", "La respuesta.")).toEqual({ transcript: "", final: "La respuesta." });
  });

  it("shows the stream alone when there is no final answer", () => {
    expect(runAnswer("A medio decir", "")).toEqual({ transcript: "A medio decir", final: "" });
  });

  it("has nothing to show for a turn that said nothing", () => {
    expect(runAnswer("", "")).toEqual({ transcript: "", final: "" });
  });

  // Surrounding whitespace is not a difference anyone can see, and treating it as one brought the
  // duplicate paragraph back.
  it("does not mind surrounding whitespace", () => {
    expect(runAnswer("  hecho  ", "\nhecho\n")).toEqual({ transcript: "hecho", final: "" });
  });
});

describe("runAnswerText", () => {
  // The chat bubble holds one string; this is the same decision folded into it.
  it("joins the transcript and a final answer that adds to it", () => {
    expect(runAnswerText("Lo que vi.", "Resumen.")).toBe("Lo que vi.\n\nResumen.");
  });

  it("is only the transcript when the final answer repeats it", () => {
    expect(runAnswerText("Listo.", "Listo.")).toBe("Listo.");
  });

  it("is only the final answer when nothing was streamed", () => {
    expect(runAnswerText("", "Listo.")).toBe("Listo.");
  });
});

describe("transcriptOf", () => {
  const msg = (runId: string, kind: string, text: string) => ({ runId, kind, text });

  it("keeps only this run's streamed text, in order", () => {
    const messages = [
      msg("r1", "text", "uno"),
      msg("r2", "text", "otro run"),
      msg("r1", "tool", "Read"),
      msg("r1", "text", "dos"),
    ];
    expect(transcriptOf(messages, "r1")).toBe("uno\ndos");
  });

  it("is empty for a run that said nothing", () => {
    expect(transcriptOf([msg("r1", "tool", "Read")], "r1")).toBe("");
  });
});
