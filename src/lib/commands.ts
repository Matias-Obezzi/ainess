// What you can type into the box that is an order to the app rather than a message to an agent.
//
// A command starts the box with `/` and is the whole of it: `/compact` is a command, "mirá el
// /compact de Claude" is a message. That rule is the reason nothing here needs escaping — anything
// with a space, a second line or a word before the slash goes to the agent untouched.
import { useAppStore, selectProjectAgents } from "@/store";
import { startRun } from "@/lib/orchestrator";
import { hasHistoryFile, HISTORY_DIR, historyFileName } from "@/lib/agent-history";
import { FOLDER } from "@/lib/project-folder";
import { translateNow } from "@/i18n/useT";

export type CommandId = "compact" | "cost" | "tasks" | "chat" | "diff" | "stop" | "clear";

export interface ChatCommand {
  id: CommandId;
  /** What is typed after the slash. */
  name: string;
  /** i18n key of the one line the menu shows next to the name. */
  descriptionKey: string;
}

export const COMMANDS: ChatCommand[] = [
  { id: "compact", name: "compact", descriptionKey: "command.compact" },
  { id: "cost", name: "cost", descriptionKey: "command.cost" },
  { id: "tasks", name: "tasks", descriptionKey: "command.tasks" },
  { id: "chat", name: "chat", descriptionKey: "command.chat" },
  { id: "diff", name: "diff", descriptionKey: "command.diff" },
  { id: "stop", name: "stop", descriptionKey: "command.stop" },
  { id: "clear", name: "clear", descriptionKey: "command.clear" },
];

/**
 * What is being typed, when what is in the box is a command and nothing else. `null` for a message
 * — which includes an empty box, so the menu does not open on every focus.
 */
export function activeCommandQuery(text: string): string | null {
  const match = /^\/([a-zA-Z]*)$/.exec(text);
  return match ? match[1].toLowerCase() : null;
}

/** The commands whose name starts with what has been typed, in the order they are declared. */
export function matchCommands(query: string): ChatCommand[] {
  return COMMANDS.filter(c => c.name.startsWith(query));
}

/** The command the box holds, if it holds one that exists. */
export function parseCommand(text: string): ChatCommand | undefined {
  const query = activeCommandQuery(text.trim());
  return query === null ? undefined : COMMANDS.find(c => c.name === query);
}

/**
 * Every agent of the project summarises its own history file and then forgets its session.
 *
 * The order is the whole point. The agent is asked to compact `.ainess/history/<agent>.md` while
 * its session is still open — it remembers the work and can write the summary for almost nothing —
 * and only when that run ends is the session dropped (in `onRunFinished`, where a compaction run
 * is also kept off the board, out of the history it just rewrote and out of the user's results).
 * The other way round the agent would have to read the whole file back just to shorten it.
 *
 * An agent with no file yet has nothing to summarise, so its session goes right away, which is all
 * `/compact` ever did. Same for a run that could not be started at all: letting go of the session
 * is the floor of this command, never the part that gets skipped.
 *
 * Returns how many agents were *asked* to compact — the work is asynchronous from here on.
 */
export function compactProject(projectId: string): number {
  const store = useAppStore.getState();
  const agents = selectProjectAgents(store, projectId);
  let asked = 0;
  for (const agent of agents) {
    if (!hasHistoryFile(store.runs, projectId, agent.id)) {
      store.resetSession(agent.id, projectId);
      continue;
    }
    // `resume: true`: the session it is about to lose is exactly what makes this turn cheap.
    // A busy agent queues it like any other run (see `startRun`).
    const runId = startRun({
      agentId: agent.id,
      projectId,
      prompt: translateNow("prompt.compact", { file: `${FOLDER}/${HISTORY_DIR}/${historyFileName(agent)}` }),
      parentRunId: null,
      round: 0,
      resume: true,
      kind: "compact",
    });
    if (runId) asked++;
    else store.resetSession(agent.id, projectId);
  }
  return asked;
}
