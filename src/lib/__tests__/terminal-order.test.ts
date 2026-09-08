// Dragging a terminal tab to another place in the bar.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

const tab = (id: string) => ({ id, title: id, shellPath: "bash", cwd: "", exited: null });

beforeEach(() => {
  useAppStore.setState({ terminals: [tab("a"), tab("b"), tab("c")] } as never);
});

const order = () => useAppStore.getState().terminals.map(t => t.id);

describe("moveTerminal", () => {
  it("takes a tab to the place it was dropped", () => {
    useAppStore.getState().moveTerminal("c", 0);
    expect(order()).toEqual(["c", "a", "b"]);
  });

  it("drops one at the end", () => {
    useAppStore.getState().moveTerminal("a", 2);
    expect(order()).toEqual(["b", "c", "a"]);
  });

  it("clamps a place that is not there instead of losing the tab", () => {
    useAppStore.getState().moveTerminal("a", 99);
    expect(order()).toEqual(["b", "c", "a"]);
    useAppStore.getState().moveTerminal("c", -3);
    expect(order()).toEqual(["c", "b", "a"]);
  });

  it("has nothing to do for a tab that is gone", () => {
    useAppStore.getState().moveTerminal("z", 0);
    expect(order()).toEqual(["a", "b", "c"]);
  });
});
