import { describe, it, expect } from "vitest";
import { StreamBuffer } from "../stream-buffer";

describe("StreamBuffer", () => {
  it("accumulates text and lines per run", () => {
    const buf = new StreamBuffer();
    expect(buf.isEmpty()).toBe(true);

    buf.pushText("run1", "hello");
    buf.pushLine("run1", "line 1");
    buf.pushText("run2", "world");
    buf.pushText("run1", " there");
    buf.pushLine("run1", "line 2");

    expect(buf.isEmpty()).toBe(false);
    expect(buf.has("run1")).toBe(true);
    expect(buf.has("run2")).toBe(true);
    expect(buf.has("run3")).toBe(false);

    const all = buf.take();
    expect(buf.isEmpty()).toBe(true);
    expect(buf.has("run1")).toBe(false);

    expect(all.size).toBe(2);
    expect(all.get("run1")).toEqual({ text: "hello there", lines: ["line 1", "line 2"] });
    expect(all.get("run2")).toEqual({ text: "world", lines: [] });
  });

  it("can take a single run leaving others", () => {
    const buf = new StreamBuffer();
    buf.pushText("run1", "hello");
    buf.pushText("run2", "world");

    const run1 = buf.takeRun("run1");
    expect(run1).toEqual({ text: "hello", lines: [] });
    
    expect(buf.has("run1")).toBe(false);
    expect(buf.has("run2")).toBe(true);
    expect(buf.isEmpty()).toBe(false);

    const all = buf.take();
    expect(all.size).toBe(1);
    expect(all.get("run2")).toEqual({ text: "world", lines: [] });
  });

  it("handles pushLine when run doesn't exist", () => {
    const buf = new StreamBuffer();
    buf.pushLine("run1", "line 1");
    
    expect(buf.takeRun("run1")).toEqual({ text: "", lines: ["line 1"] });
  });
});
