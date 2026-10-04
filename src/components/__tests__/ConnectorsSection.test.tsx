// Adding a remote server, signing in to it, and taking its sign-in along when it is deleted.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, resetStore, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { ConnectorsSection, ConnectorsSectionActions, ConnectorsSectionProvider } from "@/components/settings/ConnectorsSection";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";

vi.mock("@/lib/confirm", () => ({ confirmDelete: async () => true }));

let connected: Set<string>;
let connects: Array<{ id: string; url: string }>;

function renderSection() {
  return render(
    <ConnectorsSectionProvider>
      <ConnectorsSectionActions />
      <ConnectorsSection />
    </ConnectorsSectionProvider>,
  );
}

describe("ConnectorsSection", () => {
  beforeEach(() => {
    resetStore();
    connected = new Set();
    connects = [];
    setTransport({
      ...nullTransport,
      oauthStatus: async (id: string) => ({ connected: connected.has(id), expiresAt: null }),
      oauthConnect: async (id: string, url: string) => { connects.push({ id, url }); connected.add(id); return { connected: true, expiresAt: null }; },
      oauthDisconnect: async (id: string) => { connected.delete(id); },
    } as never);
  });

  it("adds one that signs in with OAuth by default, and keeps no header for it", async () => {
    renderSection();
    await userEvent.click(screen.getAllByRole("button", { name: "Agregar conector" })[0]);
    await userEvent.type(screen.getByLabelText("Nombre"), "Linear");
    await userEvent.type(screen.getByLabelText("Dirección (URL)"), "https://mcp.linear.app/mcp");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const [server] = useAppStore.getState().config.mcpServers;
    expect(server).toMatchObject({ name: "Linear", transport: "http", url: "https://mcp.linear.app/mcp", oauth: true, enabledFor: "all" });
    expect(server.headers).toBeUndefined();
  });

  it("signs in from its card, and shows it", async () => {
    useAppStore.setState(state => ({ config: { ...state.config, mcpServers: [{ id: "lin", name: "Linear", transport: "http", url: "https://mcp.linear.app/mcp", oauth: true, enabledFor: "all" }] } }));
    renderSection();
    await userEvent.click(await screen.findByRole("button", { name: "Conectar" }));
    await waitFor(() => expect(screen.getByText("Conectado")).toBeTruthy());
    expect(connects).toEqual([{ id: "lin", url: "https://mcp.linear.app/mcp" }]);
  });

  it("takes the sign-in out of the keychain when the connector is deleted", async () => {
    connected.add("lin");
    useAppStore.setState(state => ({ config: { ...state.config, mcpServers: [{ id: "lin", name: "Linear", transport: "http", url: "https://x", oauth: true, enabledFor: "all" }] } }));
    renderSection();
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(useAppStore.getState().config.mcpServers).toHaveLength(0));
    expect(connected.has("lin")).toBe(false);
  });

  it("lists only remote servers", () => {
    useAppStore.setState(state => ({ config: { ...state.config, mcpServers: [
      { id: "1", name: "remote-one", transport: "http", url: "https://r", enabledFor: "all" },
      { id: "2", name: "local-one", transport: "stdio", command: "x", enabledFor: "all" },
      { id: "3", name: "packaged-one", transport: "http", url: "https://p", enabledFor: "all", extension: { id: "p", dir: "C:/x" } },
    ] } }));
    renderSection();
    expect(document.body.textContent).toContain("remote-one");
    expect(document.body.textContent).not.toContain("local-one");
    expect(document.body.textContent).not.toContain("packaged-one");
  });
});
