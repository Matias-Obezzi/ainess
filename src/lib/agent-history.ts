// What each agent said, written in the project it said it in: `.ainess/history/<agent>.md`.
//
// The app keeps every run in its own storage, where only the app can read it. An agent that comes
// back tomorrow — or a different one, or you with an editor open — has no way in there. One file
// per agent, appended as the turns end, is the way in.
//
// Like the rest of the folder these are a view, never the source of truth, and the app is the only
// one that writes them.
import { getTransport } from "@/lib/transport";
import { translateNow } from "@/i18n/useT";
import { filePath } from "@/lib/project-folder";
import type { AgentConfig, Project } from "@/types";

/** Where the files live inside the folder. */
export const HISTORY_DIR = "history";

/**
 * Kept to this, oldest turns dropped first. Big enough for a long day of work, small enough that
 * an agent told to read it does not spend its context on the file.
 */
export const MAX_HISTORY_CHARS = 120_000;

/** The longest a single answer is written; the whole thing stays in the app. */
const MAX_ENTRY_CHARS = 4_000;

/** A file name from an agent's name: no separators, no surprises, never empty. */
export function historyFileName(agent: { id: string; name: string }): string {
  const clean = agent.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  // Two agents can share a name; the id keeps their files apart.
  return `${clean || "agente"}-${agent.id.slice(0, 8)}.md`;
}

function clip(text: string): string {
  const clean = (text ?? "").trim();
  return clean.length > MAX_ENTRY_CHARS ? `${clean.slice(0, MAX_ENTRY_CHARS)}…` : clean;
}

/** One turn, as it goes into the file. */
export function historyEntry(input: { at: Date; from: string; prompt: string; answer: string }): string {
  const stamp = input.at.toISOString().slice(0, 16).replace("T", " ");
  return [
    `## ${stamp} — ${input.from}`,
    "",
    clip(input.prompt) || "—",
    "",
    `### ${translateNow("folder.history.answer")}`,
    "",
    clip(input.answer) || "—",
    "",
  ].join("\n");
}

/**
 * The file with `entry` at the end, trimmed to the cap by whole turns from the top: half an old
 * answer is worse than not having it.
 */
export function appendEntry(existing: string, header: string, entry: string, max = MAX_HISTORY_CHARS): string {
  const body = (existing.startsWith(header) ? existing.slice(header.length) : existing).trimStart();
  let next = `${body}${body ? "\n" : ""}${entry}`;

  while (header.length + next.length > max) {
    // Turns start with "## "; drop the first one whole.
    const second = next.indexOf("\n## ", 1);
    if (second < 0) break;
    next = next.slice(second + 1);
  }
  return header + next;
}

function headerFor(project: Project, agent: AgentConfig): string {
  return [
    `# ${translateNow("folder.history.title", { agent: agent.name, project: project.name })}`,
    "",
    translateNow("folder.generated"),
    "",
    "",
  ].join("\n");
}

/**
 * Adds one turn to an agent's file. Never throws: a workspace that is gone or read-only is not a
 * reason to stop what the app was doing.
 */
export async function recordTurn(
  project: Project,
  agent: AgentConfig,
  turn: { from: string; prompt: string; answer: string; at?: Date },
): Promise<void> {
  if (!project.workspaceDir) return;
  const transport = getTransport();
  const path = filePath(project.workspaceDir, `${HISTORY_DIR}/${historyFileName(agent)}`);
  const header = headerFor(project, agent);
  const entry = historyEntry({ at: turn.at ?? new Date(), from: turn.from, prompt: turn.prompt, answer: turn.answer });
  try {
    const existing = (await transport.readFileAbs(path)) ?? "";
    await transport.writeFileAbs(path, appendEntry(existing, header, entry));
  } catch {
    // The folder is a courtesy to the agents, never a step of the run.
  }
}
