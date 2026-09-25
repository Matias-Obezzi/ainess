// The creature acting out the one mood that is not its agent's: the user typing. What the drawing
// looks like is a thing for a person to judge (see e2e/mascot.spec.ts); what is pinned down here is
// that the mood puts the binoculars on screen, that no other mood does, and that the label a screen
// reader gets does not change with it.
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { ProjectMascot } from "@/components/ProjectMascot";
import type { MascotMood } from "@/lib/mascot";
import { es } from "@/i18n";

const PROJECT = { projectId: "c0ffee00-1111-2222-3333-444455556666", projectName: "Ainess" };

describe("ProjectMascot", () => {
  it("holds up the binoculars while the user types", () => {
    render(<ProjectMascot {...PROJECT} mood="typing" />);
    expect(screen.getByTestId("mascot-binoculars")).toBeInTheDocument();
  });

  it("holds them up in no other mood", () => {
    for (const mood of ["working", "waiting", "quota", "error", "idle"] as MascotMood[]) {
      const { unmount } = render(<ProjectMascot {...PROJECT} mood={mood} />);
      expect(screen.queryByTestId("mascot-binoculars"), mood).not.toBeInTheDocument();
      unmount();
    }
  });

  it("keeps saying whose mascot it is", () => {
    render(<ProjectMascot {...PROJECT} mood="typing" />);
    expect(screen.getByRole("img")).toHaveAccessibleName(es["mascot.alt"].replace("{name}", "Ainess"));
  });
});
