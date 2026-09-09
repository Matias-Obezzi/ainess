import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAppStore, flushStringMapSaves } from "../../store";

describe("drafts persistence", () => {
  let store = new Map<string, string>();

  beforeEach(() => {
    vi.useFakeTimers();
    store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    // Start with a clean store state for each test
    useAppStore.setState({ drafts: {} });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    flushStringMapSaves();
  });

  it("updates the store immediately but delays localStorage write", () => {
    const setItemSpy = vi.spyOn(localStorage, "setItem");

    useAppStore.getState().setDraft("test-key", "hello");

    // The store should have the text immediately
    expect(useAppStore.getState().drafts["test-key"]).toBe("hello");

    // But localStorage should not have been called yet
    expect(setItemSpy).not.toHaveBeenCalled();

    // Advance the timer by 400ms
    vi.advanceTimersByTime(400);

    // Now localStorage should have been written
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith("ainess.drafts", JSON.stringify({ "test-key": "hello" }));
  });

  it("writes latest value when timer fires without resetting timer", () => {
    const setItemSpy = vi.spyOn(localStorage, "setItem");

    useAppStore.getState().setDraft("test-key", "hello 1");
    
    vi.advanceTimersByTime(200);
    useAppStore.getState().setDraft("test-key", "hello 2");
    
    vi.advanceTimersByTime(150); // total 350ms
    useAppStore.getState().setDraft("test-key", "hello 3");
    
    expect(setItemSpy).not.toHaveBeenCalled();
    
    vi.advanceTimersByTime(50); // total 400ms
    
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith("ainess.drafts", JSON.stringify({ "test-key": "hello 3" }));
  });

  it("writes latest value correctly with 10 fast keystrokes", () => {
    const setItemSpy = vi.spyOn(localStorage, "setItem");

    for (let i = 1; i <= 10; i++) {
      useAppStore.getState().setDraft("test-key", `keystroke ${i}`);
    }
    
    expect(setItemSpy).not.toHaveBeenCalled();
    
    vi.advanceTimersByTime(400);
    
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith("ainess.drafts", JSON.stringify({ "test-key": "keystroke 10" }));
  });

  it("flushes pending saves on window close (or manually)", () => {
    const setItemSpy = vi.spyOn(localStorage, "setItem");

    useAppStore.getState().setDraft("test-key", "pending-save");

    expect(setItemSpy).not.toHaveBeenCalled();

    // Trigger flush
    flushStringMapSaves();

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith("ainess.drafts", JSON.stringify({ "test-key": "pending-save" }));
    
    // Timer firing later should not write again or throw
    vi.advanceTimersByTime(400);
    expect(setItemSpy).toHaveBeenCalledTimes(1); // Still 1
  });
});
