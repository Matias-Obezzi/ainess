import { describe, it, expect } from "vitest";
import { activeCompletion, applyCompletion } from "../completion";

describe("activeCompletion", () => {
  it("opens a variable completion on {{", () => {
    const text = "hola {{proj";
    expect(activeCompletion(text, text.length)).toEqual({ kind: "variable", query: "proj", start: 5 });
  });

  it("opens an agent completion on @ at the start of the text", () => {
    const text = "@cla";
    expect(activeCompletion(text, text.length)).toEqual({ kind: "agent", query: "cla", start: 0 });
  });

  it("opens an agent completion on @ after a space", () => {
    const text = "decile a @cla";
    expect(activeCompletion(text, text.length)).toEqual({ kind: "agent", query: "cla", start: text.indexOf("@") });
  });

  it("does not open an agent completion when @ is glued to another word", () => {
    const text = "hola@mundo";
    expect(activeCompletion(text, text.length)).toBeNull();
  });

  it("opens a file completion on # after a space", () => {
    const text = "mirá #src/lib/completion.ts";
    expect(activeCompletion(text, text.length)).toEqual({
      kind: "file",
      query: "src/lib/completion.ts",
      start: text.indexOf("#"),
    });
  });

  it("keeps /, . and - in a file query", () => {
    const text = "#src/lib/foo-bar.ts";
    const req = activeCompletion(text, text.length);
    expect(req?.kind).toBe("file");
    expect(req?.query).toBe("src/lib/foo-bar.ts");
  });

  it("opens a command completion when / is the first character", () => {
    const text = "/comp";
    expect(activeCompletion(text, text.length)).toEqual({ kind: "command", query: "comp", start: 0 });
  });

  it("does not open a command completion when / is in the middle of the text", () => {
    const text = "ls /tmp";
    expect(activeCompletion(text, text.length)).toBeNull();
  });

  it("closes the command completion once the box moves past the command word", () => {
    const text = "/compact now";
    expect(activeCompletion(text, text.length)).toBeNull();
  });

  it("opens nothing inside a code fence, for every trigger", () => {
    const line = "{{proj @cla #src /comp";
    const text = "```\n" + line + "\n```";
    expect(activeCompletion(text, "```\n".length + line.length)).toBeNull();
  });

  it("does not break on an empty box", () => {
    expect(activeCompletion("", 0)).toBeNull();
  });
});

describe("applyCompletion", () => {
  it("replaces a variable trigger and wraps the value in {{}}", () => {
    const result = applyCompletion("hola {{proj", { kind: "variable", query: "proj", start: 5 }, "project");
    expect(result).toEqual({ text: "hola {{project}}", caret: 16 });
  });

  it("replaces an agent trigger and leaves a trailing space", () => {
    const result = applyCompletion("decile a @cla", { kind: "agent", query: "cla", start: 9 }, "Claude");
    expect(result).toEqual({ text: "decile a @Claude ", caret: 17 });
  });

  it("replaces a file trigger and leaves a trailing space", () => {
    const result = applyCompletion("mirá #src/lib", { kind: "file", query: "src/lib", start: 5 }, "src/lib/completion.ts");
    expect(result).toEqual({ text: "mirá #src/lib/completion.ts ", caret: 28 });
  });

  it("replaces a command trigger with no trailing space", () => {
    const result = applyCompletion("/comp", { kind: "command", query: "comp", start: 0 }, "compact");
    expect(result).toEqual({ text: "/compact", caret: 8 });
  });

  it("only replaces the trigger and its query, keeping the rest of the text", () => {
    const result = applyCompletion("hola {{proj}} y {{ag chau", { kind: "variable", query: "ag", start: 16 }, "agent");
    expect(result).toEqual({ text: "hola {{proj}} y {{agent}} chau", caret: 25 });
  });
});
