// The mascot acting out what its agent is doing. Nothing here is compared to a stored image: the
// four moods are drawn so a person can look at them side by side and say whether "asleep" reads as
// asleep, which no assertion is going to settle.
import { test, expect } from "@playwright/test";
import { openDemo, snap } from "./demo";

type Mood = "working" | "waiting" | "idle" | "quota";

/** Puts the corner mascot on screen, with the planner in the state that mood comes from. */
async function setMood(page: import("@playwright/test").Page, mood: Mood): Promise<void> {
  await page.evaluate(m => {
    type Agent = { id: string; role: string };
    type State = {
      config: { projects: { id: string; agents: Agent[] }[]; mascotAlways?: boolean };
      currentProjectId: string | null;
      runtime: Record<string, Record<string, { status: string }>>;
      quotaWaiting: Record<string, unknown>;
    };
    const store = (window as unknown as { __ainess: { getState(): State; setState(patch: object): void } }).__ainess;
    const state = store.getState();
    const projectId = state.currentProjectId;
    if (!projectId) throw new Error("no project open");
    const planner = state.config.projects.find(p => p.id === projectId)?.agents.find(a => a.role === "planner");
    if (!planner) throw new Error("no planner");
    const status = m === "working" ? "working" : m === "waiting" ? "waiting" : "idle";
    store.setState({
      config: { ...state.config, mascotAlways: true },
      runtime: { ...state.runtime, [projectId]: { ...state.runtime[projectId], [planner.id]: { ...state.runtime[projectId]?.[planner.id], status } } },
      quotaWaiting: m === "quota"
        ? { "r-demo": { agentId: planner.id, projectId, provider: "claude", prompt: "", createdAt: Date.now(), attempts: 0 } }
        : {},
    });
  }, mood);
}

for (const mood of ["working", "waiting", "idle", "quota"] as Mood[]) {
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
