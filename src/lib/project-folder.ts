// The `.ainess/` folder of a project: what the app knows, written where the agents can read it.
//
// Everything the app keeps lives in `%APPDATA%\com.ainess` — the config, the history, the chats and
// the board — so an agent asked to "look at the tasks" had nothing to look at and said so. This
// writes three files into the workspace itself:
//
//   BOARD.md   the open cards, with the id a planner quotes back to move one
//   AGENTS.md  who is on the team, what each one runs on and who they answer to
//   README.md  what this folder is, for whoever finds it in the repo
//
// The app is the one that writes them: they are a view, never the source of truth. A card moves
// when a delegation names it (see `task-sync.ts`), not when somebody edits the markdown — which is
// why every generated file says so on its first line.
import { getTransport } from "@/lib/transport";
import { translateNow } from "@/i18n/useT";
import { shortTaskId } from "@/lib/providers";
import { PROVIDERS } from "@/lib/providers";
import { TASK_STATUSES } from "@/lib/tasks";
import type { AgentConfig, Project, Skill, Task, TaskStatus } from "@/types";

export const FOLDER = ".ainess";

const STATUS_KEY: Record<TaskStatus, string> = {
  backlog: "task.status.backlog",
  working: "task.status.working",
  "needs-you": "task.status.needsYou",
  "in-review": "task.status.inReview",
  ready: "task.status.ready",
  done: "task.status.done",
};

const ROLE_KEY: Record<AgentConfig["role"], string> = {
  planner: "label.role.planner",
  implementer: "label.role.implementer",
  reviewer: "label.role.reviewer",
  custom: "label.role.custom",
};

/** A folder name from a skill's name: no separators, no surprises, never empty. */
export function skillSlug(skill: { id: string; name: string }): string {
  const clean = skill.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return clean || `skill-${skill.id.slice(0, 8)}`;
}

/** Where a skill's instructions live inside the project, relative to the workspace. */
export function skillRelativePath(skill: { id: string; name: string }): string {
  return `${FOLDER}/skills/${skillSlug(skill)}/SKILL.md`;
}

/** One skill as its own file: what it is at the top, the instructions below. */
export function skillMarkdown(skill: Skill): string {
  const lines = [`# ${skill.name}`, ""];
  if (skill.description?.trim()) lines.push(`> ${skill.description.trim()}`, "");
  lines.push(skill.content.trim(), "");
  return lines.join("\n");
}

/**
 * Writes the skills of a project so an agent can open the one it needs.
 *
 * They used to travel whole inside every system prompt — five skills were five manuals in every
 * run, read or not. Now the prompt carries a name, a line of description and this path, and the
 * agent reads the file when the work is about that. A skill's own scripts and templates can sit
 * next to it in the same folder.
 */
export async function writeSkillFiles(project: Project, skills: Skill[]): Promise<void> {
  if (!project.workspaceDir) return;
  const transport = getTransport();
  for (const skill of skills) {
    if (!skill.content.trim()) continue;
    const path = filePath(project.workspaceDir, `skills/${skillSlug(skill)}/SKILL.md`);
    const content = skillMarkdown(skill);
    try {
      if ((await transport.readFileAbs(path)) === content) continue;
      await transport.writeFileAbs(path, content);
    } catch {
      // The folder is a courtesy to the agents, never a step of the run.
    }
  }
}

/** Joins a workspace and a file of the folder, with the separator the workspace already uses. */
export function filePath(workspaceDir: string, name: string): string {
  const sep = workspaceDir.includes("\\") ? "\\" : "/";
  return `${workspaceDir.replace(/[\\/]+$/, "")}${sep}${FOLDER}${sep}${name}`;
}

/** The board as markdown: one section per column, the archived left out. */
export function boardMarkdown(project: Project, tasks: Task[], agents: AgentConfig[]): string {
  const nameOf = (id?: string) => agents.find(a => a.id === id)?.name;
  const lines = [
    `# ${translateNow("folder.board.title", { project: project.name })}`,
    "",
    translateNow("folder.generated"),
    "",
  ];

  const open = tasks.filter(t => !t.archived);
  if (open.length === 0) {
    lines.push(translateNow("folder.board.empty"));
    return lines.join("\n") + "\n";
  }

  for (const status of TASK_STATUSES) {
    const items = open.filter(t => t.status === status).sort((a, b) => a.order - b.order);
    if (items.length === 0) continue;
    lines.push(`## ${translateNow(STATUS_KEY[status])}`, "");
    for (const task of items) {
      const who = nameOf(task.agentId);
      const extras = [who, task.branch].filter(Boolean).join(" · ");
      lines.push(`- \`${shortTaskId(task.id)}\` ${task.title}${extras ? ` — ${extras}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** The team as markdown: who answers to whom, and what each one runs on. */
export function agentsMarkdown(project: Project, agents: AgentConfig[]): string {
  const lines = [
    `# ${translateNow("folder.agents.title", { project: project.name })}`,
    "",
    translateNow("folder.generated"),
    "",
  ];
  if (agents.length === 0) {
    lines.push(translateNow("folder.agents.empty"));
    return lines.join("\n") + "\n";
  }

  const children = (parentId: string | null) => agents.filter(a => a.parentId === parentId);
  const write = (agent: AgentConfig, depth: number) => {
    const cli = PROVIDERS[agent.provider]?.label ?? agent.provider;
    const bits = [translateNow(ROLE_KEY[agent.role]), cli, agent.model].filter(Boolean).join(" · ");
    lines.push(`${"  ".repeat(depth)}- **${agent.name}** — ${bits}`);
    if (agent.description) lines.push(`${"  ".repeat(depth + 1)}- ${agent.description}`);
    for (const child of children(agent.id)) write(child, depth + 1);
  };
  for (const root of children(null)) write(root, 0);
  return lines.join("\n") + "\n";
}

/** What this folder is, for whoever finds it in the repository. */
export function readmeMarkdown(project: Project): string {
  return [
    `# ${translateNow("folder.readme.title", { project: project.name })}`,
    "",
    translateNow("folder.readme.body"),
    "",
  ].join("\n");
}

/**
 * Writes the folder for one project. Never throws: a workspace that is gone, read-only or on a
 * disconnected drive is not a reason to stop what the app was doing.
 */
export async function writeProjectFolder(
  project: Project,
  tasks: Task[],
  agents: AgentConfig[],
): Promise<void> {
  if (!project.workspaceDir) return;
  const transport = getTransport();
  const files: Array<[string, string]> = [
    ["BOARD.md", boardMarkdown(project, tasks, agents)],
    ["AGENTS.md", agentsMarkdown(project, agents)],
    ["README.md", readmeMarkdown(project)],
  ];
  for (const [name, content] of files) {
    const path = filePath(project.workspaceDir, name);
    try {
      // Whoever watches this repository — a dev server, a test runner, the agent's own tools —
      // wakes up on a write, even one that changes nothing. So the file is read first and only
      // written when it would come out different.
      if ((await transport.readFileAbs(path)) === content) continue;
      await transport.writeFileAbs(path, content);
    } catch {
      // The folder is a courtesy to the agents, never a step of the run.
    }
  }
}
