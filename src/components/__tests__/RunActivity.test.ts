import { describe, it, expect } from "vitest";
import { visibleActivityRows } from "@/components/shell/RunActivity";

const rows = (kinds: string[]) => kinds.map((kind, i) => ({ kind, id: String(i) }));

describe("visibleActivityRows", () => {
  it("shows everything while it fits", () => {
    const list = rows(["text", "tool", "tool"]);
    expect(visibleActivityRows(list, 6, false)).toEqual(list);
  });

  it("keeps only the last rows once there are too many", () => {
    const list = rows(Array(10).fill("tool"));
    const shown = visibleActivityRows(list, 6, false);
    expect(shown).toHaveLength(6);
    expect(shown[0].id).toBe("4");
  });

  it("never folds away the streamed text", () => {
    const list = rows(["text", ...Array(10).fill("tool")]);
    const shown = visibleActivityRows(list, 6, false);
    expect(shown).toHaveLength(7);
    expect(shown[0].kind).toBe("text");
  });

  it("shows everything once expanded", () => {
    const list = rows(Array(10).fill("tool"));
    expect(visibleActivityRows(list, 6, true)).toHaveLength(10);
  });
});
