import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RemoteApp } from "@/remote/RemoteApp";
import { RemoteDesktopApp } from "@/remote/RemoteDesktopApp";
import { useAppStore } from "@/store";
import { REMOTE_LAYOUT_KEY } from "@/remote/remote-nav";
import { markRemoteBuild } from "@/lib/platform";
import { buildSnapshot } from "@/lib/remote";

vi.mock("@/remote/remote-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/remote/remote-client")>();
  return {
    ...actual,
    getToken: vi.fn(() => "test-token"),
    api: vi.fn(async (path: string) => {
      if (path === "/api/state") {
        return buildSnapshot() as unknown as Record<string, unknown>;
      }
      return { ok: true };
    }),
    connectEvents: vi.fn(() => () => {}),
    installRemoteActions: vi.fn(),
  };
});

describe("RemoteApp and RemoteDesktopApp split layouts", () => {
  const storageMap = new Map<string, string>();
  const fakeStorage: Storage = {
    getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
    setItem: vi.fn((key: string, val: string) => { storageMap.set(key, String(val)); }),
    removeItem: vi.fn((key: string) => { storageMap.delete(key); }),
    clear: vi.fn(() => { storageMap.clear(); }),
    key: vi.fn((i: number) => Array.from(storageMap.keys())[i] ?? null),
    get length() { return storageMap.size; },
  };

  beforeEach(() => {
    markRemoteBuild();
    storageMap.clear();
    vi.stubGlobal("localStorage", fakeStorage);
    vi.stubGlobal("location", {
      href: "http://localhost:4710/?token=test-token",
      search: "?token=test-token",
    });

    useAppStore.setState({
      loaded: true,
      screen: "home",
      currentProjectId: null,
      currentChatId: null,
      openProjects: [],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the mobile shell in RemoteApp and redirects to /desktop when toggled", async () => {
    render(<RemoteApp />);

    await waitFor(() => {
      expect(screen.getByTestId("remote-mobile-shell")).toBeTruthy();
    });
    expect(useAppStore.getState().remoteLayout).toBe("mobile");

    const switchToDesktop = await screen.findByRole("button", { name: /vista de escritorio|desktop view/i });
    fireEvent.click(switchToDesktop);

    expect(window.location.href).toContain("/desktop?token=test-token");
    expect(fakeStorage.getItem(REMOTE_LAYOUT_KEY)).toBe("desktop");
  });

  it("renders the desktop shell in RemoteDesktopApp and redirects to / when toggled", async () => {
    vi.stubGlobal("location", {
      href: "http://localhost:4710/desktop?token=test-token",
      search: "?token=test-token",
    });

    render(<RemoteDesktopApp />);

    await waitFor(() => {
      expect(screen.getByTestId("remote-desktop-shell")).toBeTruthy();
    });
    expect(useAppStore.getState().remoteLayout).toBe("desktop");

    const switchToMobile = await screen.findByRole("button", { name: /vista móvil|mobile view/i });
    fireEvent.click(switchToMobile);

    expect(window.location.href).toContain("/?token=test-token");
    expect(fakeStorage.getItem(REMOTE_LAYOUT_KEY)).toBe("mobile");
  });
});
