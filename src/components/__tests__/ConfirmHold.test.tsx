// What cannot be taken back is held, not clicked: a click on its button answers nothing.
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@/test/render";
import { ConfirmDialogHost, askInDialog } from "@/components/ui/confirm-dialog";

describe("a confirmation that has to be held", () => {
  it("is not answered by a click, and is refused by Cancel", async () => {
    render(<ConfirmDialogHost />);
    let answer: boolean | undefined;
    await act(async () => {
      void askInDialog({ title: "¿Eliminar el proyecto?", destructive: true, hold: true }).then(a => { answer = a; });
    });

    const hold = await screen.findByRole("button", { name: /Eliminar|Delete/ });
    fireEvent.click(hold);
    await act(async () => {});
    expect(answer).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: /Cancelar|Cancel/ }));
    await act(async () => {});
    expect(answer).toBe(false);
  });

  it("is answered yes once the button has been held long enough", async () => {
    // The fill advances frame by frame; jsdom draws no frames, so a timer stands in for them.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    render(<ConfirmDialogHost />);
    let answer: boolean | undefined;
    await act(async () => {
      void askInDialog({ title: "¿Eliminar el chat?", destructive: true, hold: true }).then(a => { answer = a; });
    });

    const hold = await screen.findByRole("button", { name: /Eliminar|Delete/ });
    fireEvent.pointerDown(hold, { button: 0 });
    await act(() => new Promise(resolve => setTimeout(resolve, 1500)));
    expect(answer).toBe(true);
    vi.unstubAllGlobals();
  });
});
