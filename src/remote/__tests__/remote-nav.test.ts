import { describe, it, expect, vi } from "vitest";
import {
  REMOTE_NAV_KEY,
  readRemoteNav,
  writeRemoteNav,
  restoreNav,
  type RemoteNav,
} from "@/remote/remote-nav";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("remote-nav storage", () => {
  it("round-trips navigation state through storage", () => {
    const storage = new MemoryStorage();
    const nav: RemoteNav = {
      projectId: "proj-1",
      chatId: "chat-1",
      tab: "conversations",
      threadOpen: false,
    };

    writeRemoteNav(storage, nav);
    expect(readRemoteNav(storage)).toEqual(nav);

    const navThread: RemoteNav = {
      projectId: "proj-1",
      chatId: null,
      tab: "conversations",
      threadOpen: true,
    };
    writeRemoteNav(storage, navThread);
    expect(readRemoteNav(storage)).toEqual(navThread);
  });

  it("returns null when storage is empty", () => {
    const storage = new MemoryStorage();
    expect(readRemoteNav(storage)).toBeNull();
  });

  it("returns null on garbage in storage", () => {
    const storage = new MemoryStorage();

    // Invalid JSON syntax
    storage.setItem(REMOTE_NAV_KEY, "{ broken json");
    expect(readRemoteNav(storage)).toBeNull();

    // Primitive values
    storage.setItem(REMOTE_NAV_KEY, "12345");
    expect(readRemoteNav(storage)).toBeNull();

    storage.setItem(REMOTE_NAV_KEY, "\"just a string\"");
    expect(readRemoteNav(storage)).toBeNull();

    // Array instead of object
    storage.setItem(REMOTE_NAV_KEY, "[\"tasks\"]");
    expect(readRemoteNav(storage)).toBeNull();

    // Non-string or non-null fields
    storage.setItem(REMOTE_NAV_KEY, JSON.stringify({ tab: "tasks", projectId: 123 }));
    expect(readRemoteNav(storage)).toBeNull();

    storage.setItem(REMOTE_NAV_KEY, JSON.stringify({ tab: "tasks", chatId: true }));
    expect(readRemoteNav(storage)).toBeNull();

    // Non-boolean threadOpen
    storage.setItem(REMOTE_NAV_KEY, JSON.stringify({ tab: "tasks", threadOpen: "yes" }));
    expect(readRemoteNav(storage)).toBeNull();

    storage.setItem(REMOTE_NAV_KEY, JSON.stringify({ tab: "tasks", threadOpen: 123 }));
    expect(readRemoteNav(storage)).toBeNull();
  });

  it("returns null when the tab is unknown or missing", () => {
    const storage = new MemoryStorage();

    storage.setItem(REMOTE_NAV_KEY, JSON.stringify({ tab: "unknown-tab", projectId: "p1", chatId: null }));
    expect(readRemoteNav(storage)).toBeNull();

    storage.setItem(REMOTE_NAV_KEY, JSON.stringify({ projectId: "p1", chatId: null }));
    expect(readRemoteNav(storage)).toBeNull();
  });

  it("maps legacy tab 'thread' to 'conversations' with threadOpen true", () => {
    const storage = new MemoryStorage();
    storage.setItem(REMOTE_NAV_KEY, JSON.stringify({ projectId: "p1", chatId: null, tab: "thread" }));

    expect(readRemoteNav(storage)).toEqual({
      projectId: "p1",
      chatId: null,
      tab: "conversations",
      threadOpen: true,
    });
  });

  it("maps legacy tab 'chats' to 'conversations' with threadOpen false", () => {
    const storage = new MemoryStorage();
    storage.setItem(REMOTE_NAV_KEY, JSON.stringify({ projectId: "p1", chatId: "c1", tab: "chats" }));

    expect(readRemoteNav(storage)).toEqual({
      projectId: "p1",
      chatId: "c1",
      tab: "conversations",
      threadOpen: false,
    });
  });

  it("defaults threadOpen to false when missing in old saved values", () => {
    const storage = new MemoryStorage();
    storage.setItem(REMOTE_NAV_KEY, JSON.stringify({ projectId: "p1", chatId: null, tab: "tasks" }));

    expect(readRemoteNav(storage)).toEqual({
      projectId: "p1",
      chatId: null,
      tab: "tasks",
      threadOpen: false,
    });
  });

  it("swallows write errors (e.g. quota exceeded or private mode)", () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => {
      writeRemoteNav(storage, { projectId: "p1", chatId: null, tab: "tasks", threadOpen: false });
    }).not.toThrow();
  });

  it("swallows read errors gracefully", () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(readRemoteNav(storage)).toBeNull();
  });
});

describe("restoreNav", () => {
  const projects = [{ id: "proj-1" }, { id: "proj-2" }];
  const chats = [
    { id: "chat-1", projectId: "proj-1" },
    { id: "chat-2", projectId: "proj-2" },
  ];

  it("returns home when saved navigation is null or projectId is null", () => {
    expect(restoreNav(null, projects, chats)).toEqual({
      projectId: null,
      chatId: null,
      tab: "tasks",
      threadOpen: false,
    });

    expect(restoreNav({ projectId: null, chatId: null, tab: "conversations", threadOpen: true }, projects, chats)).toEqual({
      projectId: null,
      chatId: null,
      tab: "tasks",
      threadOpen: false,
    });
  });

  it("returns home when saved project no longer exists", () => {
    const saved: RemoteNav = {
      projectId: "deleted-project",
      chatId: null,
      tab: "tasks",
      threadOpen: false,
    };

    expect(restoreNav(saved, projects, chats)).toEqual({
      projectId: null,
      chatId: null,
      tab: "tasks",
      threadOpen: false,
    });
  });

  it("falls back to conversations list when saved chat no longer exists", () => {
    const saved: RemoteNav = {
      projectId: "proj-1",
      chatId: "deleted-chat",
      tab: "conversations",
      threadOpen: false,
    };

    expect(restoreNav(saved, projects, chats)).toEqual({
      projectId: "proj-1",
      chatId: null,
      tab: "conversations",
      threadOpen: false,
    });
  });

  it("falls back to conversations list when saved chat belongs to another project", () => {
    const saved: RemoteNav = {
      projectId: "proj-1",
      // chat-2 belongs to proj-2, not proj-1
      chatId: "chat-2",
      tab: "conversations",
      threadOpen: false,
    };

    expect(restoreNav(saved, projects, chats)).toEqual({
      projectId: "proj-1",
      chatId: null,
      tab: "conversations",
      threadOpen: false,
    });
  });

  it("forces tab 'conversations' with chat when chat exists in the project", () => {
    const saved: RemoteNav = {
      projectId: "proj-1",
      chatId: "chat-1",
      // Even if saved tab was tasks, existing chat forces conversations tab
      tab: "tasks",
      threadOpen: false,
    };

    expect(restoreNav(saved, projects, chats)).toEqual({
      projectId: "proj-1",
      chatId: "chat-1",
      tab: "conversations",
      threadOpen: false,
    });
  });

  it("preserves saved tab and threadOpen when project exists and no chat was active", () => {
    const tabs: RemoteNav["tab"][] = ["tasks", "conversations", "approvals", "agents"];

    for (const tab of tabs) {
      for (const threadOpen of [true, false]) {
        const saved: RemoteNav = {
          projectId: "proj-1",
          chatId: null,
          tab,
          threadOpen,
        };

        expect(restoreNav(saved, projects, chats)).toEqual({
          projectId: "proj-1",
          chatId: null,
          tab,
          threadOpen,
        });
      }
    }
  });
});
