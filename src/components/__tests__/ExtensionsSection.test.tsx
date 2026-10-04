// Installing, configuring and removing a desktop extension from Settings → Extensions.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, resetStore, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { ExtensionsSection, ExtensionsSectionActions, ExtensionsSectionProvider } from "@/components/settings/ExtensionsSection";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";

vi.mock("@/lib/pick-dir", () => ({ pickPath: async () => "C:/Downloads/files.mcpb", pickWorkspaceDir: async () => null }));
vi.mock("@/lib/confirm", () => ({ confirmDelete: async () => true }));

const DIR = "C:\\Users\\u\\AppData\\Roaming\\com.ainess\\extensions\\files";
const MANIFEST = JSON.stringify({
  name: "files",
  display_name: "Files",
  version: "1.0.0",
  server: { type: "node", mcp_config: { command: "node", args: ["${__dirname}/index.js"], env: { API_KEY: "${user_config.api_key}" } } },
  user_config: { api_key: { type: "string", title: "API key", sensitive: true, required: true } },
});

let removed: string[];

function renderSection() {
  return render(
    <ExtensionsSectionProvider>
      <ExtensionsSectionActions />
      <ExtensionsSection />
    </ExtensionsSectionProvider>,
  );
}

describe("ExtensionsSection", () => {
  beforeEach(() => {
    resetStore();
    removed = [];
    setTransport({
      ...nullTransport,
      homeDir: async () => "C:\\Users\\u",
      installExtension: async () => ({ dir: DIR, manifest: MANIFEST }),
      removeExtension: async (dir: string) => { removed.push(dir); },
      readFileAbs: async (path: string) => (path.endsWith("manifest.json") ? MANIFEST : null),
    } as never);
  });

  it("installs a file, asks for what the manifest wants (secrets hidden), and adds its server for everyone", async () => {
    renderSection();
    await userEvent.click(screen.getAllByRole("button", { name: /Instalar extensión/ })[0]);

    const key = await screen.findByLabelText(/API key/);
    expect((key as HTMLInputElement).type).toBe("password");
    const save = screen.getByRole("button", { name: "Guardar" });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(key, "sk-123");
    await userEvent.click(save);

    await waitFor(() => expect(useAppStore.getState().config.mcpServers).toHaveLength(1));
    const [server] = useAppStore.getState().config.mcpServers;
    expect(server).toMatchObject({
      name: "Files",
      command: "node",
      args: [`${DIR}/index.js`],
      env: { API_KEY: "sk-123" },
      enabledFor: "all",
      extension: { id: "files", dir: DIR, version: "1.0.0", config: { api_key: "sk-123" } },
    });
  });

  it("uninstalls one of its own, deleting the folder, but never another app's", async () => {
    useAppStore.setState(state => ({
      config: {
        ...state.config,
        mcpServers: [
          { id: "mine", name: "Files", transport: "stdio", command: "node", enabledFor: "all", extension: { id: "files", dir: DIR } },
          { id: "claude", name: "Blender", transport: "stdio", command: "uv", enabledFor: "all", extension: { id: "blender", dir: "C:/Claude/Extensions/blender", external: true } },
        ],
      },
    }));
    renderSection();
    const buttons = await screen.findAllByRole("button", { name: "Desinstalar" });
    await userEvent.click(buttons[1]);
    await waitFor(() => expect(useAppStore.getState().config.mcpServers.map(s => s.id)).toEqual(["mine"]));
    expect(removed).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Desinstalar" }));
    await waitFor(() => expect(useAppStore.getState().config.mcpServers).toHaveLength(0));
    expect(removed).toEqual([DIR]);
  });

  it("turns one off without uninstalling it", async () => {
    useAppStore.setState(state => ({
      config: { ...state.config, mcpServers: [{ id: "mine", name: "Files", transport: "stdio", command: "node", enabledFor: "all", extension: { id: "files", dir: DIR } }] },
    }));
    renderSection();
    await userEvent.click(await screen.findByRole("switch"));
    expect(useAppStore.getState().config.mcpServers[0].enabledFor).toEqual([]);
  });
});
