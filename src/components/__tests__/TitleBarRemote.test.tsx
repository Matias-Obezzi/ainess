// The phone in the window bar used to be the switch: one click started a server on the local
// network. It opens Configuración → Remoto now, where the port, the token and the QR are — and it
// keeps being the light that says whether the server is up.
import { describe, it, expect, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test/render";
import { TitleBar } from "@/components/shell/TitleBar";
import { useAppStore } from "@/store";
import { es } from "@/i18n";

describe("the phone button in the title bar", () => {
  beforeEach(() => {
    useAppStore.setState({
      remoteStatus: { running: false, clients: 0 },
      remoteBusy: false,
      settingsOpen: false,
    });
  });

  it("opens the remote section instead of starting the server", async () => {
    const user = userEvent.setup();
    const toggleRemote = vi.fn();
    useAppStore.setState({ toggleRemote });

    render(<TitleBar />);
    await user.click(screen.getByRole("button", { name: es["titlebar.remoteOpen"] }));

    expect(toggleRemote).not.toHaveBeenCalled();
    expect(useAppStore.getState().settingsOpen).toBe(true);
    expect(useAppStore.getState().settingsSection).toBe("remote");
  });

  it("still says where the server is answering while it runs", async () => {
    useAppStore.setState(state => ({
      remoteStatus: { ...state.remoteStatus, running: true, ip: "192.168.0.10" },
      config: { ...state.config, remote: { ...state.config.remote, port: 4710 } },
    }));

    const user = userEvent.setup();
    render(<TitleBar />);
    // The tooltip only exists once it is asked for, so the hover is part of the assertion.
    await user.hover(screen.getByRole("button", { name: es["titlebar.remoteOpen"] }));

    const expected = es["titlebar.remoteAt"].replace("{host}", "192.168.0.10").replace("{port}", "4710");
    expect((await screen.findAllByText(expected)).length).toBeGreaterThan(0);
  });
});
