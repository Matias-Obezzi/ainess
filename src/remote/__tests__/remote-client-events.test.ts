// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  connectEvents,
  rememberToken,
  forgetToken,
  STALE_AFTER_MS,
  STALE_ON_RESUME_MS,
} from "@/remote/remote-client";

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closeCount = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, data?: string): void {
    const event = { type, data: data ?? "{}" } as MessageEvent<string>;
    if (type === "open" && this.onopen) {
      this.onopen(event);
    }
    if (type === "error" && this.onerror) {
      this.onerror(event);
    }
    const set = this.listeners.get(type);
    if (set) {
      for (const listener of Array.from(set)) {
        listener(event);
      }
    }
  }

  triggerOpen(): void {
    this.dispatch("open");
  }

  triggerError(): void {
    this.dispatch("error");
  }

  close(): void {
    this.closeCount++;
  }
}

describe("connectEvents", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
    rememberToken("test-token");
    if (typeof document !== "undefined" && !document.visibilityState) {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    forgetToken();
    vi.useRealTimers();
    globalThis.EventSource = originalEventSource;
  });

  it("a ping marks connected", () => {
    let connected = false;
    const teardown = connectEvents({
      onState: () => {},
      onConnected: () => { connected = true; },
      onDisconnected: () => { connected = false; },
    });

    expect(FakeEventSource.instances.length).toBe(1);
    expect(connected).toBe(false);

    FakeEventSource.instances[0].dispatch("ping");
    expect(connected).toBe(true);

    teardown();
  });

  it("source.onopen marks connected", () => {
    let connected = false;
    const teardown = connectEvents({
      onState: () => {},
      onConnected: () => { connected = true; },
      onDisconnected: () => { connected = false; },
    });

    expect(FakeEventSource.instances.length).toBe(1);
    expect(connected).toBe(false);

    FakeEventSource.instances[0].triggerOpen();
    expect(connected).toBe(true);

    teardown();
  });

  it("silence past the watchdog closes and reopens exactly once", () => {
    let connected = true;
    const teardown = connectEvents({
      onState: () => {},
      onConnected: () => { connected = true; },
      onDisconnected: () => { connected = false; },
    });

    expect(FakeEventSource.instances.length).toBe(1);
    const firstInstance = FakeEventSource.instances[0];

    // Advance time to the stale threshold
    vi.advanceTimersByTime(STALE_AFTER_MS);

    // Watchdog should close the first instance, call onDisconnected, and reopen
    expect(firstInstance.closeCount).toBe(1);
    expect(connected).toBe(false);
    expect(FakeEventSource.instances.length).toBe(2);

    const secondInstance = FakeEventSource.instances[1];
    expect(secondInstance.closeCount).toBe(0);

    // Additional time within the second instance's window does not close or reopen again
    vi.advanceTimersByTime(20_000);
    expect(FakeEventSource.instances.length).toBe(2);
    expect(secondInstance.closeCount).toBe(0);

    teardown();
  });

  it("periodic pings keep the connection alive past the watchdog threshold", () => {
    const teardown = connectEvents({
      onState: () => {},
      onConnected: () => {},
      onDisconnected: () => {},
    });

    const instance = FakeEventSource.instances[0];

    // Send a ping every 20s for 60s total (well past the 45s STALE_AFTER_MS)
    vi.advanceTimersByTime(20_000);
    instance.dispatch("ping");
    vi.advanceTimersByTime(20_000);
    instance.dispatch("ping");
    vi.advanceTimersByTime(20_000);
    instance.dispatch("ping");

    expect(instance.closeCount).toBe(0);
    expect(FakeEventSource.instances.length).toBe(1);

    teardown();
  });

  it("a visibilitychange to visible while a retry is pending reconnects immediately", () => {
    const teardown = connectEvents({
      onState: () => {},
      onConnected: () => {},
      onDisconnected: () => {},
    });

    expect(FakeEventSource.instances.length).toBe(1);
    const firstInstance = FakeEventSource.instances[0];

    // Trigger an error to put the client in retry backoff
    firstInstance.triggerError();
    expect(firstInstance.closeCount).toBe(1);

    // Advance slightly, so the retry timer is still pending
    vi.advanceTimersByTime(100);
    expect(FakeEventSource.instances.length).toBe(1);

    // Phone wakes up and tab becomes visible
    document.dispatchEvent(new Event("visibilitychange"));

    // Immediately reconnects without waiting for the rest of the retry timer
    expect(FakeEventSource.instances.length).toBe(2);

    teardown();
  });

  it("teardown removes the listeners (no reopen after teardown)", () => {
    const teardown = connectEvents({
      onState: () => {},
      onConnected: () => {},
      onDisconnected: () => {},
    });

    expect(FakeEventSource.instances.length).toBe(1);
    const instance = FakeEventSource.instances[0];

    teardown();
    expect(instance.closeCount).toBe(1);

    // Fire resume events and advance past watchdog timer
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    vi.advanceTimersByTime(100_000);

    // No new EventSource should ever be opened after teardown
    expect(FakeEventSource.instances.length).toBe(1);
  });

  it("visibilitychange when connection is stale (> 25s) reconnects immediately", () => {
    let disconnected = false;
    const teardown = connectEvents({
      onState: () => {},
      onConnected: () => {},
      onDisconnected: () => { disconnected = true; },
    });

    expect(FakeEventSource.instances.length).toBe(1);
    const firstInstance = FakeEventSource.instances[0];

    // Idle for 26s (longer than STALE_ON_RESUME_MS, but shorter than watchdog 45s)
    vi.advanceTimersByTime(STALE_ON_RESUME_MS + 1000);
    expect(firstInstance.closeCount).toBe(0);
    expect(FakeEventSource.instances.length).toBe(1);

    // Resume app
    document.dispatchEvent(new Event("visibilitychange"));

    expect(firstInstance.closeCount).toBe(1);
    expect(disconnected).toBe(true);
    expect(FakeEventSource.instances.length).toBe(2);

    teardown();
  });

  it("visibilitychange when connection is fresh (< 25s) does not reconnect", () => {
    const teardown = connectEvents({
      onState: () => {},
      onConnected: () => {},
      onDisconnected: () => {},
    });

    const firstInstance = FakeEventSource.instances[0];
    vi.advanceTimersByTime(10_000);
    firstInstance.dispatch("ping");

    vi.advanceTimersByTime(5_000);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(firstInstance.closeCount).toBe(0);
    expect(FakeEventSource.instances.length).toBe(1);

    teardown();
  });

  it("online event reconnects immediately when retry timer is pending", () => {
    const teardown = connectEvents({
      onState: () => {},
      onConnected: () => {},
      onDisconnected: () => {},
    });

    FakeEventSource.instances[0].triggerError();
    vi.advanceTimersByTime(200);
    expect(FakeEventSource.instances.length).toBe(1);

    window.dispatchEvent(new Event("online"));
    expect(FakeEventSource.instances.length).toBe(2);

    teardown();
  });

  it("state event delivers snapshot and marks connected", () => {
    let connected = false;
    let receivedState: unknown = null;
    const teardown = connectEvents({
      onState: (snap) => { receivedState = snap; },
      onConnected: () => { connected = true; },
      onDisconnected: () => { connected = false; },
    });

    const mockSnapshot = {
      projects: [],
      runs: [],
      tasks: [],
      approvals: [],
      runtime: {},
    };
    FakeEventSource.instances[0].dispatch("state", JSON.stringify(mockSnapshot));

    expect(connected).toBe(true);
    expect(receivedState).toEqual(mockSnapshot);

    teardown();
  });
});
