import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RemoteApp } from "@/remote/RemoteApp";
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

describe("RemoteApp desktop vs mobile layout", () => {
  beforeEach(() => {
    markRemoteBuild();
    localStorage.clear();
    useAppStore.setState({
      loaded: true,
      screen: "home",
      currentProjectId: null,
      currentChatId: null,
      openProjects: [],
    });
  });

  it("renders the full desktop shell on wide viewports (>= 768px) and allows toggling to mobile view", async () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });

    render(<RemoteApp />);

    await waitFor(() => {
      expect(screen.getByTestId("remote-desktop-shell")).toBeTruthy();
    });
    expect(useAppStore.getState().remoteLayout).toBe("desktop");

    // Click the layout switch button in TitleBar to switch to mobile view
    const switchToMobile = screen.getByRole("button", { name: /vista móvil|mobile view/i });
    fireEvent.click(switchToMobile);

    await waitFor(() => {
      expect(screen.getByTestId("remote-mobile-shell")).toBeTruthy();
    });
    expect(useAppStore.getState().remoteLayout).toBe("mobile");
    expect(localStorage.getItem(REMOTE_LAYOUT_KEY)).toBe("mobile");
  });

  it("renders the mobile shell on narrow viewports (< 768px) and allows toggling to desktop view", async () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 390 });

    render(<RemoteApp />);

    await waitFor(() => {
      expect(screen.getByTestId("remote-mobile-shell")).toBeTruthy();
    });

    // Wait for ready phase (header with layout switch button)
    const switchToDesktop = await screen.findByRole("button", { name: /vista de escritorio|desktop view/i });
    expect(useAppStore.getState().remoteLayout).toBe("mobile");

    fireEvent.click(switchToDesktop);

    await waitFor(() => {
      expect(screen.getByTestId("remote-desktop-shell")).toBeTruthy();
    });
    expect(useAppStore.getState().remoteLayout).toBe("desktop");
    expect(localStorage.getItem(REMOTE_LAYOUT_KEY)).toBe("desktop");
  });
});
