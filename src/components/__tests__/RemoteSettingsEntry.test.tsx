// The phone in the window bar only opened Configuración → Remoto and said whether the server was
// up. The section does both now — its entry carries the light — so the button is gone. And the
// page the host serves does not offer the two sections it cannot act on: the server it is talking
// through, and the chat bridges.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, resetStore, within } from "@/test/render";
import { TitleBar } from "@/components/shell/TitleBar";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useAppStore } from "@/store";
import { markRemoteBuild } from "@/lib/platform";
import { es } from "@/i18n";

describe("the way to the remote server", () => {
  beforeEach(() => resetStore());

  it("is no longer a button in the window bar", () => {
    useAppStore.setState(state => ({ remoteStatus: { ...state.remoteStatus, running: true } }));
    render(<TitleBar />);
    expect(screen.queryByRole("button", { name: /remot/i })).toBeNull();
  });

  it("is the Remote section, whose entry lights up while the server runs", () => {
    useAppStore.setState(state => ({ settingsOpen: true, remoteStatus: { ...state.remoteStatus, running: true } }));
    render(<SettingsDialog />);
    const entry = screen.getByRole("button", { name: new RegExp(es["settings.section.remote"]) });
    expect(within(entry).getByRole("img", { name: es["titlebar.remoteOn"] })).toBeTruthy();
  });

  it("stays dark while the server is off", () => {
    useAppStore.setState({ settingsOpen: true });
    render(<SettingsDialog />);
    expect(screen.queryByRole("img", { name: es["titlebar.remoteOn"] })).toBeNull();
  });

  // Last: the build flag cannot be taken back.
  it("is not offered by the remote page, nor are the chat bridges", () => {
    markRemoteBuild();
    useAppStore.setState({ settingsOpen: true, settingsSection: "remote" });
    render(<SettingsDialog />);
    expect(screen.queryByRole("button", { name: es["settings.section.remote"] })).toBeNull();
    expect(screen.queryByRole("button", { name: es["settings.section.messaging"] })).toBeNull();
    expect(screen.getByRole("button", { name: es["settings.section.teams"] })).toBeTruthy();
    expect(screen.getByRole("button", { name: es["settings.section.mcp"] })).toBeTruthy();
  });
});
