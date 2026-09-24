// Tests for QueuedMessages component: inline editing, keyboard shortcuts, and button behavior.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, resetStore } from "@/test/render";
import { QueuedMessages, type QueuedGroup } from "../shell/QueuedMessages";
import { translateNow } from "@/i18n/useT";

describe("QueuedMessages", () => {
  beforeEach(() => {
    resetStore();
  });

  const tEdit = translateNow("common.edit");
  const tSave = translateNow("common.save");
  const tCancel = translateNow("common.cancel");
  const tQueuedCancel = translateNow("queued.cancel");
  const tSendNow = translateNow("queued.sendNow");

  const createGroup = (over: Partial<QueuedGroup> = {}): QueuedGroup => ({
    to: "Uno",
    lines: [
      { text: "first message", onCancel: vi.fn(), onEdit: vi.fn() },
      { text: "second message", onCancel: vi.fn(), onEdit: vi.fn() },
    ],
    onSendNow: vi.fn(),
    ...over,
  });

  it("renders an edit button for each queued line", () => {
    const group = createGroup();
    render(<QueuedMessages groups={[group]} />);

    const editButtons = screen.getAllByRole("button", { name: tEdit });
    expect(editButtons).toHaveLength(2);
  });

  it("pressing the edit button turns that line into a textarea prefilled with text and hides X", () => {
    const group = createGroup();
    render(<QueuedMessages groups={[group]} />);

    // Initially two cancel buttons (X)
    expect(screen.getAllByRole("button", { name: tQueuedCancel })).toHaveLength(2);

    const editButtons = screen.getAllByRole("button", { name: tEdit });
    fireEvent.click(editButtons[0]);

    // Textarea appears prefilled
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toBeDefined();
    expect(textarea.value).toBe("first message");

    // The edited line's X is hidden (only 1 X for line 2 remains)
    expect(screen.getAllByRole("button", { name: tQueuedCancel })).toHaveLength(1);

    // Save and Cancel buttons for the editor are present
    expect(screen.getByRole("button", { name: tSave })).toBeDefined();
    expect(screen.getByRole("button", { name: tCancel })).toBeDefined();
  });

  it("saving calls onEdit and leaves edit mode", () => {
    const onEdit = vi.fn();
    const group = createGroup({
      lines: [{ text: "first message", onCancel: vi.fn(), onEdit }],
    });
    render(<QueuedMessages groups={[group]} />);

    fireEvent.click(screen.getByRole("button", { name: tEdit }));

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "corrected text" } });

    fireEvent.click(screen.getByRole("button", { name: tSave }));

    expect(onEdit).toHaveBeenCalledWith("corrected text");
    // Textarea is no longer rendered
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("pressing Enter in the textarea saves and calls onEdit", () => {
    const onEdit = vi.fn();
    const group = createGroup({
      lines: [{ text: "first message", onCancel: vi.fn(), onEdit }],
    });
    render(<QueuedMessages groups={[group]} />);

    fireEvent.click(screen.getByRole("button", { name: tEdit }));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "edited with enter" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onEdit).toHaveBeenCalledWith("edited with enter");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("pressing Shift+Enter in the textarea does not save", () => {
    const onEdit = vi.fn();
    const group = createGroup({
      lines: [{ text: "first message", onCancel: vi.fn(), onEdit }],
    });
    render(<QueuedMessages groups={[group]} />);

    fireEvent.click(screen.getByRole("button", { name: tEdit }));

    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("pressing Escape in the textarea cancels edit mode without saving", () => {
    const onEdit = vi.fn();
    const group = createGroup({
      lines: [{ text: "first message", onCancel: vi.fn(), onEdit }],
    });
    render(<QueuedMessages groups={[group]} />);

    fireEvent.click(screen.getByRole("button", { name: tEdit }));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "discarded edit" } });
    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("only puts one line in edit mode at a time", () => {
    const group = createGroup();
    render(<QueuedMessages groups={[group]} />);

    const editButtons = screen.getAllByRole("button", { name: tEdit });
    fireEvent.click(editButtons[0]);

    let textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("first message");

    // Click edit on the second line
    const remainingEditButtons = screen.getAllByRole("button", { name: tEdit });
    fireEvent.click(remainingEditButtons[0]);

    const textareas = screen.getAllByRole("textbox") as HTMLTextAreaElement[];
    expect(textareas).toHaveLength(1);
    expect(textareas[0].value).toBe("second message");
  });

  it("drops out of edit mode when the queue changes and a different line lands at the same index", () => {
    const onEdit = vi.fn();
    const group = createGroup({
      lines: [{ text: "first message", onCancel: vi.fn(), onEdit }],
    });
    const { rerender } = render(<QueuedMessages groups={[group]} />);

    fireEvent.click(screen.getByRole("button", { name: tEdit }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "unsaved draft" } });

    // The turn ended and a brand-new instruction was queued for the same agent: same group and
    // index, unrelated text. The editor must not reattach to it with the old draft.
    const nextGroup = createGroup({
      lines: [{ text: "a completely different message", onCancel: vi.fn(), onEdit: vi.fn() }],
    });
    rerender(<QueuedMessages groups={[nextGroup]} />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("a completely different message")).toBeDefined();
  });

  it("keeps send-now button working even while a line is being edited", () => {
    const onSendNow = vi.fn();
    const group = createGroup({ onSendNow });
    render(<QueuedMessages groups={[group]} />);

    fireEvent.click(screen.getAllByRole("button", { name: tEdit })[0]);

    const sendNowButton = screen.getByRole("button", { name: tSendNow });
    fireEvent.click(sendNowButton);

    expect(onSendNow).toHaveBeenCalledTimes(1);
  });
});
