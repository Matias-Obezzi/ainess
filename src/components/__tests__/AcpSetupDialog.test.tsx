import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { AcpSetupDialog } from "@/components/AcpSetupDialog";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";

describe("AcpSetupDialog", () => {
  let cancelCalled = false;
  
  beforeEach(() => {
    cancelCalled = false;
    setTransport({
      ...nullTransport,
      acpManagedCancel: async () => { cancelCalled = true; },
      openLogsDir: async () => {},
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows progress with percentage when downloading", async () => {
    useAppStore.setState({
      acpSetup: { open: true, phase: "runtime-download", received: 50, total: 100 }
    });
    
    render(<AcpSetupDialog />);
    expect(screen.getByText("Preparando Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Descargando entorno de ejecución...")).toBeInTheDocument();
    
    // We can check if cancel works
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(cancelCalled).toBe(true);
  });

  it("shows indeterminate progress without percentage for adapter-install", () => {
    useAppStore.setState({
      acpSetup: { open: true, phase: "adapter-install", message: "bun install..." }
    });
    
    render(<AcpSetupDialog />);
    expect(screen.getByText("Instalando adaptador ACP...")).toBeInTheDocument();
    expect(screen.getByText("bun install...")).toBeInTheDocument();
  });

  it("shows error and retry button", async () => {
    let ensureCalled = false;
    setTransport({
      ...nullTransport,
      acpManagedEnsure: async () => { ensureCalled = true; return null; },
      openLogsDir: async () => {},
    } as any);

    useAppStore.setState({
      acpSetup: { open: true, phase: "error", message: "Network error" }
    });
    
    render(<AcpSetupDialog />);
    expect(screen.getByText("Network error")).toBeInTheDocument();
    
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(ensureCalled).toBe(true);
  });
});
