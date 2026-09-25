// The mascot acting out what its agent is doing — and, in one case, what the user is doing. Nothing
// here is compared to a stored image: the moods are drawn so a person can look at them side by side
// and say whether "asleep" reads as asleep, which no assertion is going to settle.
import { test, expect } from "@playwright/test";
import { openDemo, snap } from "./demo";

type Mood = "working" | "waiting" | "idle" | "quota" | "error" | "typing";

/** Puts the corner mascot on screen, with the planner in the state that mood comes from. */
async function setMood(page: import("@playwright/test").Page, mood: Mood): Promise<void> {
  await page.evaluate(m => {
    type Agent = { id: string; role: string };
    type State = {
      config: { projects: { id: string; agents: Agent[] }[]; mascotAlways?: boolean };
      currentProjectId: string | null;
      runtime: Record<string, Record<string, { status: string }>>;
      quotaWaiting: Record<string, unknown>;
      composerTyping: boolean;
    };
    const store = (window as unknown as { __ainess: { getState(): State; setState(patch: object): void } }).__ainess;
    const state = store.getState();
    const projectId = state.currentProjectId;
    if (!projectId) throw new Error("no project open");
    const planner = state.config.projects.find(p => p.id === projectId)?.agents.find(a => a.role === "planner");
    if (!planner) throw new Error("no planner");
    const status = m === "working" || m === "waiting" || m === "error" ? m : "idle";
    store.setState({
      config: { ...state.config, mascotAlways: true },
      // Typing is not a status: it is the flag the composer raises, and it wins over an idle agent.
      composerTyping: m === "typing",
      runtime: { ...state.runtime, [projectId]: { ...state.runtime[projectId], [planner.id]: { ...state.runtime[projectId]?.[planner.id], status } } },
      quotaWaiting: m === "quota"
        ? { "r-demo": { agentId: planner.id, projectId, provider: "claude", prompt: "", createdAt: Date.now(), attempts: 0 } }
        : {},
    });
  }, mood);
}

for (const mood of ["working", "waiting", "idle", "quota", "error", "typing"] as Mood[]) {
  test(`the mascot in the corner, ${mood}`, async ({ page }) => {
    // Shot with the motion turned down, which is the one still frame where every mood shows what it
    // adds: mid-animation the z's are halfway faded out and the clock is halfway out of sight.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page, "chat");
    await setMood(page, mood);
    const mascot = page.getByTestId("mascot");
    await expect(mascot).toBeVisible();
    // 56px is what it is on screen and nothing at all on a screenshot. The drawing is a viewBox,
    // so a bigger box is the same picture, larger.
    await mascot.evaluate(el => {
      const box = el as HTMLElement;
      box.style.width = "224px";
      box.style.height = "224px";
      const svg = box.querySelector("svg");
      svg?.setAttribute("width", "224");
      svg?.setAttribute("height", "224");
    });
    await snap(page, `mascot-${mood}`, mascot);
  });
}

/**
 * The binoculars over each of the four faces.
 *
 * The face is derived from the project id (`lib/mascot.ts#mascotTraits`), so the only way to see
 * all four is to open a project whose id lands on each one. These ids were picked for exactly
 * that, one per pair of eyes and, as it happens, one per body too. What is being looked at: that
 * the pair reads as binoculars at the size the empty thread draws them, and that the gaze — two
 * pupils, a wink, or the light inside a visor — is still above the rims.
 */
const FACES = [
  { eyes: 0, id: "demo-eyes-0-5" },
  { eyes: 1, id: "demo-eyes-1-3" },
  { eyes: 2, id: "demo-eyes-2-18" },
  { eyes: 3, id: "demo-eyes-3-18" },
];

for (const face of FACES) {
  test(`the binoculars over face ${face.eyes}`, async ({ page }) => {
    await openDemo(page, "chat");
    await page.evaluate(id => {
      type Project = { id: string; name: string };
      type State = { config: { projects: Project[] }; currentProjectId: string | null };
      type Store = {
        getState(): State & { openProject(id: string, chatId: string | null, mode: string): void };
        setState(patch: object): void;
      };
      const store = (window as unknown as { __ainess: Store }).__ainess;
      const state = store.getState();
      const open = state.config.projects.find(p => p.id === state.currentProjectId);
      if (!open) throw new Error("no project open");
      // A copy of the demo project under another id: same team and same colour, another face. It
      // has no runs of its own, so the thread shows its empty state — which is where the mascot is
      // drawn at 128px, the size this is about.
      store.setState({ config: { ...state.config, projects: [...state.config.projects, { ...open, id, name: id }] } });
      store.getState().openProject(id, null, "chat");
    }, face.id);
    const mascot = page.getByTestId("mascot");
    await expect(mascot).toBeVisible();
    // After the screen settled, not with it: the composer is remounted by the change of project,
    // and it turns the flag off on its way out.
    await page.evaluate(() => {
      (window as unknown as { __ainess: { setState(patch: object): void } }).__ainess.setState({ composerTyping: true });
    });
    await expect(page.getByTestId("mascot-binoculars")).toBeVisible();
    await mascot.evaluate(el => {
      const box = el as HTMLElement;
      box.style.width = "256px";
      box.style.height = "256px";
      const svg = box.querySelector("svg");
      svg?.setAttribute("width", "256");
      svg?.setAttribute("height", "256");
    });
    await snap(page, `mascot-typing-face-${face.eyes}`, mascot);
  });
}
