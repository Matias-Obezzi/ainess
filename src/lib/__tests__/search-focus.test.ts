// Ctrl+F is the same palette in a narrower mode, and the thread has to be told where to go.
//
// Two pieces of state carry that: `searchInitialGroup`, which says the palette was opened to search
// inside the conversations (and must be forgotten the moment it closes, or the next Ctrl+K would
// open in the wrong mode), and `focusedMessageId`, which the thread reads to scroll to one message
// and clears once it has flashed it.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

describe("search focus state", () => {
  beforeEach(() => {
    useAppStore.setState({ searchOpen: false, searchInitialGroup: null, focusedMessageId: null });
  });

  it("opens on the messages group when asked for it", () => {
    useAppStore.getState().toggleSearch(true, "messages");
    expect(useAppStore.getState().searchOpen).toBe(true);
    expect(useAppStore.getState().searchInitialGroup).toBe("messages");
  });

  it("forgets the group when the palette closes", () => {
    useAppStore.getState().toggleSearch(true, "messages");
    useAppStore.getState().toggleSearch(false);
    expect(useAppStore.getState().searchOpen).toBe(false);
    expect(useAppStore.getState().searchInitialGroup).toBeNull();
  });

  it("opens with no group when none is asked for", () => {
    useAppStore.getState().toggleSearch(true);
    expect(useAppStore.getState().searchOpen).toBe(true);
    expect(useAppStore.getState().searchInitialGroup).toBeNull();
  });

  it("points the thread at a message and lets go of it", () => {
    useAppStore.getState().focusMessage("m1");
    expect(useAppStore.getState().focusedMessageId).toBe("m1");
    useAppStore.getState().focusMessage(null);
    expect(useAppStore.getState().focusedMessageId).toBeNull();
  });
});
