// @vitest-environment jsdom
// The shell has to end up the size of the terminal on screen, not the size it had when it was asked
// to start: resizes sent while it is starting are dropped on the other side.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setTransport, type Transport } from "@/lib/transport";

const sized = { cols: 80, rows: 24 };
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    get cols() { return sized.cols; }
    get rows() { return sized.rows; }
    options: Record<string, unknown> = {};
    loadAddon() {}
    open() {}
    attachCustomKeyEventHandler() {}
    onData() { return { dispose() {} }; }
    onResize() { return { dispose() {} }; }
    write() {}
    focus() {}
  },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));

describe("a new terminal", () => {
  let calls: string[];
  beforeEach(() => {
    calls = [];
    setTransport({
      ptySpawn: async ({ cols, rows }: { cols: number; rows: number }) => {
        calls.push(`spawn ${cols}x${rows}`);
        // The panel finishes opening while the shell starts.
        sized.cols = 132;
      },
      ptyResize: async (_id: string, cols: number, rows: number) => { calls.push(`resize ${cols}x${rows}`); },
      ptyWrite: async () => {},
      onPtyOutput: async () => () => {},
      onPtyExit: async () => () => {},
    } as unknown as Transport);
  });

  it("tells the shell the size on screen once it exists", async () => {
    const { ensureTerminal } = await import("@/lib/terminal-create");
    ensureTerminal({ id: "t1", title: "pwsh", shellId: "pwsh", shellPath: "pwsh.exe", cwd: "C:/", projectId: null }, document.createElement("div"));
    await vi.waitFor(() => expect(calls).toContain("spawn 80x24"));
    await vi.waitFor(() => expect(calls.at(-1)).toBe("resize 132x24"));
  });
});
