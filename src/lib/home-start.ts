// Starting work from the home screen: a folder, a team, and something to say.
//
// Everything the app can do lives inside a project, and a project used to be a dialog you filled in
// before you could type a word. The home screen takes the prompt first now — the folder and the
// team are two fields beside it — and works out for itself whether that folder is already a
// project or is about to become one.
//
// Pure module: no store, no dialogs. What it decides is which of the three is missing and where the
// prompt is going, which is the part worth pinning down.
import type { AgentConfig, Formation, Project } from "@/types";

/**
 * A path as it compares, not as it is shown.
 *
 * Windows writes the same folder as `C:\p`, `C:/p` and `C:\p\`, and its filesystem does not care
 * about case. Two projects on one folder is the failure this prevents: the agents would share a
 * workspace and neither would know about the other.
 */
export function normalizePath(dir: string): string {
  return dir.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** The project already working in this folder, if there is one. */
export function projectForDir(projects: Project[], dir: string): Project | undefined {
  const wanted = normalizePath(dir);
  if (!wanted) return undefined;
  return projects.find(p => normalizePath(p.workspaceDir) === wanted);
}

/** What to call a project made from a folder: the folder's own name. */
export function projectNameFromDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() ?? "";
}

/**
 * Who a prompt with no addressee goes to: the planner at the root, or whoever is at the root.
 *
 * The same rule the composer and the phone already follow. A team with no root at all gets nothing
 * rather than an arbitrary agent — a prompt to a random implementer is worse than a prompt refused.
 */
export function plannerOf(agents: AgentConfig[]): AgentConfig | undefined {
  const roots = agents.filter(a => a.parentId === null);
  return roots.find(a => a.role === "planner") ?? roots[0];
}

/**
 * What is stopping this from being sent.
 *
 * `formations` comes first and means something different from the rest: it is not a field left
 * empty but a thing the user has never made, so the box points at where teams are created instead
 * of at itself. An existing folder needs no team — it has one, and picking a second would add
 * agents to a project rather than start one.
 */
export type StartBlocker = "formations" | "folder" | "team" | "prompt";

export function startBlockers(input: {
  prompt: string;
  workspaceDir: string;
  formationId: string | null;
  formations: Formation[];
  projects: Project[];
}): StartBlocker[] {
  const out: StartBlocker[] = [];
  const existing = projectForDir(input.projects, input.workspaceDir);

  // Resolved, not merely set: the preselected default is whatever the config last remembered, and a
  // team deleted since then leaves an id pointing at nothing. Trusting the id gave a button that
  // was enabled and did nothing when pressed.
  const team = input.formations.some(f => f.id === input.formationId);

  if (input.formations.length === 0 && !existing) out.push("formations");
  if (!input.workspaceDir.trim()) out.push("folder");
  if (!existing && input.formations.length > 0 && !team) out.push("team");
  if (!input.prompt.trim()) out.push("prompt");

  return out;
}

/** Where the prompt is going: a project that exists, or one about to be made from these two. */
export type StartTarget =
  | { kind: "existing"; project: Project }
  | { kind: "new"; name: string; workspaceDir: string; formation: Formation };

export function startTarget(input: {
  workspaceDir: string;
  formationId: string | null;
  formations: Formation[];
  projects: Project[];
}): StartTarget | null {
  const existing = projectForDir(input.projects, input.workspaceDir);
  if (existing) return { kind: "existing", project: existing };

  const dir = input.workspaceDir.trim();
  const formation = input.formations.find(f => f.id === input.formationId);
  if (!dir || !formation) return null;

  const name = projectNameFromDir(dir);
  return name ? { kind: "new", name, workspaceDir: dir, formation } : null;
}
