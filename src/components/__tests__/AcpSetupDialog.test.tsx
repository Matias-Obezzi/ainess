// The setup screen and the two answers it owes whoever is waiting for the runtime.
//
// The progress cases are the easy half. The two that matter are retry and cancel on the error face:
// retry has to run the install again with the caller still parked on `ensureAcpRuntime()`, and cancel
// has to close the screen and answer no — without asking Rust to cancel an install that already died.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, resetStore } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { AcpSetupDialog } from "@/components/AcpSetupDialog";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { ensureAcpRuntime } from "@/lib/acp-setup";
import type { AcpManagedStatus } from "@/types";

const READY: AcpManagedStatus = {
  runtimeReady: true,
  adapterReady: true,
  bunVersion: "1.0",
  adapterVersion: "1.0",
  program: "bun",
  args: [],
  installDir: "/acp",
  enginePath: null,
};

describe("AcpSetupDialog", () => {
  let cancelCalled = 0;

  beforeEach(() => {
    resetStore();
    cancelCalled = 0;
    setTransport({
      ...nullTransport,
      acpManagedCancel: async () => { cancelCalled++; },
      openLogsDir: async () => {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows progress with percentage when downloading", async () => {
    useAppStore.setState({ acpSetup: { open: true, phase: "runtime-download", received: 50, total: 100 } });

    render(<AcpSetupDialog />);
    expect(screen.getByText("Preparando Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Descargando entorno de ejecución...")).toBeInTheDocument();

    // Cancelling an install in flight is the one cancel that tells Rust to stop.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(cancelCalled).toBe(1);
  });

  it("shows indeterminate progress without percentage for adapter-install", () => {
    useAppStore.setState({ acpSetup: { open: true, phase: "adapter-install", message: "bun install..." } });

    render(<AcpSetupDialog />);
    expect(screen.getByText("Instalando adaptador ACP...")).toBeInTheDocument();
    expect(screen.getByText("bun install...")).toBeInTheDocument();
  });

  it("runs the install again on retry, and answers the caller once it works", async () => {
    let ensureCalls = 0;
    setTransport({
      ...nullTransport,
      acpManagedEnsure: async () => {
        useAppStore.getState().setAcpSetup({ phase: "error", message: "Sin red" });
        return ++ensureCalls < 2 ? null : READY;
      },
      acpManagedCancel: async () => { cancelCalled++; },
      openLogsDir: async () => {},
    });

    render(<AcpSetupDialog />);
    const answered = ensureAcpRuntime();

    const user = userEvent.setup();
    expect(await screen.findByText("Sin red")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await answered).toBe(true);
    expect(ensureCalls).toBe(2);
    expect(useAppStore.getState().acpSetup.open).toBe(false);
    expect(cancelCalled).toBe(0);
  });

  it("closes on cancel from the error face, without cancelling an install that already failed", async () => {
    setTransport({
      ...nullTransport,
      acpManagedEnsure: async () => {
        useAppStore.getState().setAcpSetup({ phase: "error", message: "Sin red" });
        return null;
      },
      acpManagedCancel: async () => { cancelCalled++; },
      openLogsDir: async () => {},
    });

    render(<AcpSetupDialog />);
    const answered = ensureAcpRuntime();

    const user = userEvent.setup();
    expect(await screen.findByText("Sin red")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await answered).toBe(false);
    expect(cancelCalled).toBe(0);
    expect(useAppStore.getState().acpSetup.open).toBe(false);
    expect(screen.queryByText("Sin red")).not.toBeInTheDocument();
  });
});
