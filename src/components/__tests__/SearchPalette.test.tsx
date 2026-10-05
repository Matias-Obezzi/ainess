// The palette draws what it found and lets the keyboard pick it.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, resetStore } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { SearchPalette } from "@/components/shell/SearchPalette";
import { useAppStore } from "@/store";

describe("SearchPalette", () => {
  beforeEach(() => {
    resetStore();
    useAppStore.setState(state => ({
      searchOpen: true,
      config: {
        ...state.config,
        projects: [
          { id: "p1", name: "Ácido", workspaceDir: "C:/a", createdAt: 1, agents: [] },
          { id: "p2", name: "Acelga", workspaceDir: "C:/b", createdAt: 2, agents: [] },
          { id: "p3", name: "Zapallo", workspaceDir: "C:/c", createdAt: 3, agents: [] },
        ] as never,
      },
    }));
  });

  it("filters without accents, moves with the arrows and opens the chosen one with Enter", async () => {
    render(<SearchPalette />);
    await userEvent.type(screen.getByRole("combobox"), "ac");

    const options = screen.getAllByRole("option").filter(o => !o.hidden);
    expect(options.slice(0, 2).map(o => o.textContent)).toEqual(["ÁcidoC:/a", "AcelgaC:/b"]);
    expect(options[0].getAttribute("aria-selected")).toBe("true");

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(useAppStore.getState().currentProjectId).toBe("p2");
    expect(useAppStore.getState().searchOpen).toBe(false);
  });

  it("says when nothing matches", async () => {
    render(<SearchPalette />);
    await userEvent.type(screen.getByRole("combobox"), "qqq");
    expect(document.body.textContent).toContain("qqq");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
