// What you can type into the box that is an order to the app rather than a message to an agent.
//
// A command starts the box with `/` and is the whole of it: `/compact` is a command, "mirá el
// /compact de Claude" is a message. That rule is the reason nothing here needs escaping — anything
// with a space, a second line or a word before the slash goes to the agent untouched.
import { useAppStore, selectProjectAgents } from "@/store";

export type CommandId = "compact" | "cost";

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
 * Every agent of the project forgets its session. What was said is not lost: the app has been
 * writing each turn to `.ainess/history/`, and the next run is told where that file is (see
 * `buildSystemPrompt`), so the agent reads back only what the new work needs instead of dragging
 * the whole transcript into every turn.
 *
 * Returns how many agents were compacted, so the caller can say so.
 */
export function compactProject(projectId: string): number {
  const store = useAppStore.getState();
  const agents = selectProjectAgents(store, projectId);
  for (const agent of agents) store.resetSession(agent.id, projectId);
  return agents.length;
}
