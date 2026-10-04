// Picking, out of what the user's other tools have, what ainess should have too.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, resetStore } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { ImportMcpDialog } from "@/components/settings/ImportMcpDialog";
import { useAppStore } from "@/store";
import type { DetectedMcp } from "@/lib/mcp-import";

const detected: DetectedMcp[] = [
  { server: { name: "codegraph", transport: "stdio", command: "codegraph", args: ["serve", "--mcp"] }, sources: ["claude-code", "copilot"] },
  { server: { name: "Stitch", transport: "http", url: "https://stitch.googleapis.com/mcp", headers: { "X-Goog-Api-Key": "SECRET-VALUE" } }, sources: ["antigravity"] },
  { server: { name: "known", transport: "stdio", command: "known" }, sources: ["gemini"] },
  { server: { name: "db", transport: "stdio", command: "db-mcp" }, sources: ["claude-code"], project: "C:\\work\\app" },
  { server: { name: "elsewhere", transport: "stdio", command: "x" }, sources: ["claude-code"], project: "D:/other" },
];

describe("ImportMcpDialog", () => {
  beforeEach(() => {
    resetStore();
    useAppStore.setState(state => ({
      config: {
        ...state.config,
        mcpServers: [{ id: "k", name: "known", transport: "stdio", command: "known", enabledFor: "all" }],
        projects: [{
          id: "p", name: "App", workspaceDir: "C:/work/app/", createdAt: 1,
          agents: [{ id: "a1", name: "Uno", provider: "claude", role: "planner", parentId: null, autoApprove: true }],
        }] as never,
      },
    }));
  });

  it("ticks what is new, never shows a header's value, and imports each where it belongs", async () => {
    render(<ImportMcpDialog open onOpenChange={() => {}} detected={detected} />);

    // New, from anywhere, and the one kept for a folder that is an ainess project: four of five
    // minus the one ainess already has and the one for a folder ainess does not know.
    expect(screen.getByRole("button", { name: /Importar 3/ })).toBeTruthy();
    expect(document.body.textContent).not.toContain("SECRET-VALUE");
    expect(document.body.textContent).toContain("Claude Code");
    expect(document.body.textContent).toContain("Antigravity");

    await userEvent.click(screen.getByRole("button", { name: /Importar 3/ }));

    const servers = useAppStore.getState().config.mcpServers;
    expect(servers.map(s => s.name)).toEqual(["known", "codegraph", "Stitch", "db"]);
    expect(servers.find(s => s.name === "db")?.enabledFor).toEqual(["a1"]);
    expect(servers.find(s => s.name === "Stitch")?.enabledFor).toBe("all");
    expect(servers.find(s => s.name === "Stitch")?.headers).toEqual({ "X-Goog-Api-Key": "SECRET-VALUE" });
  });

  it("says so when it is still looking, and when there is nothing", () => {
    const { rerender } = render(<ImportMcpDialog open onOpenChange={() => {}} detected={null} />);
    expect(document.body.textContent).toContain("Buscando en tus CLIs");
    rerender(<ImportMcpDialog open onOpenChange={() => {}} detected={[]} />);
    expect(document.body.textContent).toContain("No encontramos servidores MCP");
  });
});
