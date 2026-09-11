// Knowing when a chat is answering, without asking twice a second.
//
// A turn lives in `lib/chat`'s own memory and not in the store, so nothing could react to it: the
// composer polled `isChatActive` on a 500ms timer and re-rendered itself twice a second for as long
// as a chat was open, whether or not anything was happening.
//
// Two things matter here and both are about what does NOT happen. A listener that is woken for
// changes it does not care about is the poll again with extra steps; and an unsubscribe that leaves
// half of itself behind leaks a store subscription for every composer ever mounted.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { forgetChat, isChatActive, subscribeChatActivity } from "@/lib/chat";

beforeEach(() => {
  useAppStore.setState({ remoteActiveChats: [] } as never);
});

describe("isChatActive", () => {
  it("is false for a chat with nothing in flight", () => {
    expect(isChatActive("c1")).toBe(false);
  });

  it("takes the phone's word for its own turns", () => {
    // On the phone the turns run in that process, so the answer arrives with the snapshot.
    useAppStore.setState({ remoteActiveChats: ["c1"] } as never);
    expect(isChatActive("c1")).toBe(true);
    expect(isChatActive("c2")).toBe(false);
  });
});

describe("subscribeChatActivity", () => {
  it("wakes on a store change, because that is where the phone's turns are", () => {
    const woken = vi.fn();
    const stop = subscribeChatActivity(woken);

    useAppStore.setState({ remoteActiveChats: ["c1"] } as never);
    expect(woken).toHaveBeenCalled();

    stop();
  });

  it("stops waking once it is let go, on both halves", () => {
    // The store half is the one that leaks quietly: a composer mounts and unmounts on every visit
    // to a conversation, and a subscription left behind is never noticed.
    const woken = vi.fn();
    const stop = subscribeChatActivity(woken);
    stop();

    useAppStore.setState({ remoteActiveChats: ["c1"] } as never);
    forgetChat("c1");

    expect(woken).not.toHaveBeenCalled();
  });

  it("says nothing when a chat with no turn is forgotten", () => {
    // Nothing moved, so nobody is told. A wake-up per non-event is the poll again.
    const woken = vi.fn();
    const stop = subscribeChatActivity(woken);

    forgetChat("nunca-tuvo-turno");

    expect(woken).not.toHaveBeenCalled();
    stop();
  });

  it("lets several listeners hold on at once", () => {
    const one = vi.fn();
    const two = vi.fn();
    const stopOne = subscribeChatActivity(one);
    const stopTwo = subscribeChatActivity(two);

    useAppStore.setState({ remoteActiveChats: ["c1"] } as never);
    expect(one).toHaveBeenCalled();
    expect(two).toHaveBeenCalled();

    stopOne();
    stopTwo();
  });
});

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));
