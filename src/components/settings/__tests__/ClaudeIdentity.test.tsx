// Who Claude Code is logged in as, in Settings → Agents.
//
// `claudeAuth.status` is read straight from the store: `null` is "nobody said anything yet", never
// read as logged out, and only a probe (on mount when nothing is known, or on demand) fills it in.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, resetStore, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { ClaudeIdentity } from "../AgentsSection";
import { useAppStore } from "@/store";
import type { ClaudeAuthStatus } from "@/types";

const probeClaudeAuth = vi.fn();
const ensureClaudeAuth = vi.fn();
const claudeLogout = vi.fn();
const confirm = vi.fn();

vi.mock("@/lib/claude-auth", () => ({
  probeClaudeAuth: (...args: unknown[]) => probeClaudeAuth(...(args as [])),
  ensureClaudeAuth: (...args: unknown[]) => ensureClaudeAuth(...(args as [])),
  claudeLogout: (...args: unknown[]) => claudeLogout(...(args as [])),
}));
vi.mock("@/lib/confirm", () => ({ confirm: (...args: unknown[]) => confirm(...args) }));

const LOGGED_IN: ClaudeAuthStatus = {
  kind: "account",
  label: "matias@example.com (Max)",
  account: { email: "matias@example.com", organization: "Acme", plan: "Max" },
};

const LOGGED_OUT: ClaudeAuthStatus = { kind: "none", label: "Not logged in" };

beforeEach(() => {
  resetStore();
  probeClaudeAuth.mockReset().mockResolvedValue(null);
  ensureClaudeAuth.mockReset().mockResolvedValue(true);
  claudeLogout.mockReset().mockResolvedValue(undefined);
  confirm.mockReset().mockResolvedValue(true);
});

describe("ClaudeIdentity", () => {
  it("shows the email, organization and plan of an active session", () => {
    useAppStore.setState(state => ({ claudeAuth: { ...state.claudeAuth, status: LOGGED_IN } }));
    render(<ClaudeIdentity />);

    expect(screen.getByText("matias@example.com (Max)")).toBeInTheDocument();
    expect(screen.getByText("Email: matias@example.com")).toBeInTheDocument();
    expect(screen.getByText("Organización: Acme")).toBeInTheDocument();
    expect(screen.getByText("Plan: Max")).toBeInTheDocument();
    // Already known: mounting must not pay for another probe.
    expect(probeClaudeAuth).not.toHaveBeenCalled();
  });

  it("says there is no session and logs in through the gate", async () => {
    useAppStore.setState(state => ({ claudeAuth: { ...state.claudeAuth, status: LOGGED_OUT } }));
    ensureClaudeAuth.mockImplementation(async () => {
      useAppStore.setState(state => ({ claudeAuth: { ...state.claudeAuth, status: LOGGED_IN } }));
      return true;
    });
    render(<ClaudeIdentity />);

    expect(screen.getByText(/no hay ninguna sesión iniciada/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(ensureClaudeAuth).toHaveBeenCalled();
    await waitFor(() => expect(probeClaudeAuth).toHaveBeenCalled());
  });

  it("does not call a probe that could not determine anything logged in or logged out", async () => {
    render(<ClaudeIdentity />);

    await waitFor(() => expect(probeClaudeAuth).toHaveBeenCalled());
    expect(screen.getByText(/no se pudo determinar/i)).toBeInTheDocument();
    expect(screen.queryByText(/no hay ninguna sesión iniciada/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).not.toBeInTheDocument();
  });

  it("logs out only after the confirmation is accepted", async () => {
    useAppStore.setState(state => ({ claudeAuth: { ...state.claudeAuth, status: LOGGED_IN } }));
    confirm.mockResolvedValue(false);
    render(<ClaudeIdentity />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(confirm).toHaveBeenCalled();
    expect(claudeLogout).not.toHaveBeenCalled();

    confirm.mockResolvedValue(true);
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => expect(claudeLogout).toHaveBeenCalled());
  });
});
