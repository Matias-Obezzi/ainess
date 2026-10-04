// Where a streaming answer is cut so that only its last paragraph is parsed again each flush.
import { describe, it, expect } from "vitest";
import { settledBlocks } from "@/components/shell/Markdown";

describe("settledBlocks", () => {
  it("cuts at blank lines", () => {
    expect(settledBlocks("uno\n\ndos\nsigue\n\ntres")).toEqual(["uno", "dos\nsigue", "tres"]);
  });

  it("never inside a fence, closed or still open", () => {
    const code = "```ts\nconst a = 1;\n\nconst b = 2;\n```";
    expect(settledBlocks(`antes\n\n${code}\n\ndespués`)).toEqual(["antes", code, "después"]);
    expect(settledBlocks("antes\n\n```delegate\n[{\n\n")).toEqual(["antes", "```delegate\n[{\n\n"]);
  });

  it("keeps a finished paragraph the same string while the next one grows", () => {
    const [first] = settledBlocks("hecho\n\nescribiendo");
    expect(settledBlocks("hecho\n\nescribiendo más")[0]).toBe(first);
  });

  it("leaves nothing empty behind", () => {
    expect(settledBlocks("\n\nuno\n\n\n\ndos\n\n")).toEqual(["uno", "dos"]);
  });
});
