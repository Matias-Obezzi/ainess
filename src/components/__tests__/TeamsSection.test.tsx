// Equipos is its own settings section now (it used to be the lower half of Agentes). What this
// pins down is that the section draws the saved teams — and that it does it without a heading of
// its own, since the sidebar already says what the screen is.
import { describe, it, expect, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test/render";
import { TeamsSection, TeamsSectionActions, TeamsSectionProvider } from "@/components/settings/TeamsSection";
import { useAppStore } from "@/store";
import { es } from "@/i18n";
import type { Formation } from "@/types";

const TEAMS: Formation[] = [
  {
    id: "f1",
    name: "Dúo",
    description: "Un planner y un implementador",
    agents: [
      { id: "a1", name: "Claude", provider: "claude", role: "planner", parentId: null, autoApprove: false },
      { id: "a2", name: "Copilot", provider: "copilot", role: "implementer", parentId: "a1", autoApprove: true },
    ],
  },
  { id: "f2", name: "Solista", agents: [] },
];

function renderSection() {
  return render(
    <TeamsSectionProvider>
      <TeamsSection />
    </TeamsSectionProvider>,
  );
}

describe("TeamsSection", () => {
  beforeEach(() => {
    useAppStore.setState(state => ({
      loaded: true,
      config: { ...state.config, formations: TEAMS, defaultFormationId: "f1" },
    }));
  });

  it("lists every saved team, and marks the default one", () => {
    renderSection();
    expect(screen.getByText("Dúo")).toBeInTheDocument();
    expect(screen.getByText("Solista")).toBeInTheDocument();
    expect(screen.getByText("Un planner y un implementador")).toBeInTheDocument();
    // "Predeterminado" is both the badge on f1 and the button on f2, so the badge is the extra one.
    expect(screen.getAllByText(es["agents.default"]).length).toBe(3);
  });

  it("opens the team dialog from the header action, which lives outside the body", async () => {
    const user = userEvent.setup();
    render(
      <TeamsSectionProvider>
        <TeamsSectionActions />
        <TeamsSection />
      </TeamsSectionProvider>,
    );
    await user.click(screen.getByRole("button", { name: es["agents.newFormation"] }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(es["agents.newFormation"]);
  });

  it("draws no heading of its own: the sidebar already names the screen", () => {
    renderSection();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByText(es["agents.formationsHint"])).not.toBeInTheDocument();
  });

  it("offers to create the first one when there is none", () => {
    useAppStore.setState(state => ({ config: { ...state.config, formations: [], defaultFormationId: null } }));
    renderSection();
    expect(screen.getByText(es["agents.emptyFormations.title"])).toBeInTheDocument();
    expect(screen.getByRole("button", { name: es["agents.emptyFormations.action"] })).toBeInTheDocument();
  });
});
