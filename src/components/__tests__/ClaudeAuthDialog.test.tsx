// The login screen and the two answers it owes whoever is waiting for a session.
//
// It has two faces and they are not the same offer: with an engine on the machine the way out is
// `claude auth login` in a terminal, and with none there is nothing to log in *with*, so the only
// thing worth offering is the managed runtime that brings an engine of its own — and then the login.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, resetStore } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { ClaudeAuthDialog } from "@/components/ClaudeAuthDialog";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { ensureClaudeAuth } from "@/lib/claude-auth";
import type { AcpManagedStatus } from "@/types";

const MANAGED: AcpManagedStatus = {
  runtimeReady: true,
  adapterReady: true,
  bunVersion: "1.0",
  adapterVersion: "1.0",
  program: "bun",
  args: [],
  installDir: "/acp",
  enginePath: "/acp/node_modules/.bin/claude",
};

describe("ClaudeAuthDialog", () => {
  beforeEach(() => {
    resetStore();
    setTransport({ ...nullTransport, whichProgram: async () => "C:/claude.exe" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says what is missing, where the credentials live, and offers the login", async () => {
    render(<ClaudeAuthDialog />);
    const answered = ensureClaudeAuth();

    expect(await screen.findByText("Claude Code no tiene sesión iniciada")).toBeInTheDocument();
    expect(screen.getByText(/las credenciales quedan en ~\/\.claude/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await answered).toBe(false);
    expect(useAppStore.getState().claudeAuth.open).toBe(false);
  });

  it("offers the managed runtime when there is no engine, and the login once it brought one", async () => {
    let installed = false;
    let ensured = 0;
    setTransport({
      ...nullTransport,
      whichProgram: async () => null,
      acpManagedStatus: async () => (installed ? MANAGED : null),
      acpManagedEnsure: async () => { ensured++; installed = true; return MANAGED; },
    });

    render(<ClaudeAuthDialog />);
    const answered = ensureClaudeAuth();

    const user = userEvent.setup();
    const install = await screen.findByRole("button", { name: "Instalar entorno" });
    // No login is offered while there is nothing to log in with.
    expect(screen.queryByRole("button", { name: "Iniciar sesión" })).not.toBeInTheDocument();
    await user.click(install);

    // The install brought an engine, so the screen comes back asking the question it could not ask.
    const login = await screen.findByRole("button", { name: "Iniciar sesión" });
    expect(ensured).toBe(1);
    expect(login).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await answered).toBe(false);
  });

  it("says so when a login came back without a session", async () => {
    // The terminal opens, exits, and the probe still finds nobody: the screen comes back with why.
    setTransport({
      ...nullTransport,
      whichProgram: async () => "C:/claude.exe",
      exec: async () => ({ code: 1, stdout: JSON.stringify({ loggedIn: false }), stderr: "" }),
    });
    useAppStore.setState({ shells: [{ id: "pwsh", label: "PowerShell", path: "C:/pwsh.exe" }] });
    // Nothing renders a terminal here, so the shell is marked dead as soon as the tab appears.
    const unsubscribe = useAppStore.subscribe(state => {
      const tab = state.terminals.find(t => t.exited === null);
      if (tab) useAppStore.getState().markTerminalExited(tab.id, 0);
    });

    render(<ClaudeAuthDialog />);
    const answered = ensureClaudeAuth();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText("La terminal se cerró y sigue sin haber sesión iniciada.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await answered).toBe(false);
    unsubscribe();
  });
});
