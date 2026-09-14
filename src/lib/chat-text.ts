// An agent's answer, as it reads in a chat that cannot draw it.
//
// The app draws a ```delegate block as a card and hides a ```ask block behind the question it
// asks. A Telegram chat gets the text, and Telegram drew the block as a box of JSON with a "copy"
// button — the machine's half of the answer, handed to the person. This puts the meaning of each
// block in its place, in words, and leaves the rest of the answer as it was.
import { parseDelegations, parseQuestions } from "@/lib/providers";
import { translateNow } from "@/i18n/useT";

const ASK_BLOCK = /```ask[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*(?=\n|$)/g;
const DELEGATE_BLOCK = /```delegate[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*(?=\n|$)/g;

/** The first line of a task, for the one-line summary a chat has room for. */
function firstLine(text: string): string {
  return text.split("\n").map(l => l.trim()).find(l => l.length > 0) ?? "";
}

/**
 * `text` with every `ask` block replaced by its question and numbered options, and every
 * `delegate` block by one line per task — who got it, and the first line of what.
 */
export function forChat(text: string): string {
  const out = text
    .replace(ASK_BLOCK, block => {
      const questions = parseQuestions("```ask\n" + block.replace(/^```ask[ \t]*\n/, "").replace(/\n[ \t]*```[ \t]*$/, "") + "\n```");
      if (questions.length === 0) return "";
      return questions
        .map(q => [
          translateNow("chatText.question", { question: q.question }),
          ...q.options.map((option, i) => `${i + 1}. ${option}`),
          ...(q.multiple ? [translateNow("chatText.several")] : []),
        ].join("\n"))
        .join("\n\n");
    })
    .replace(DELEGATE_BLOCK, block => {
      const tasks = parseDelegations(block);
      if (tasks.length === 0) return "";
      return tasks.map(t => translateNow("chatText.delegated", { agent: t.agent, task: firstLine(t.task) })).join("\n");
    });
  // Blocks that went leave blank lines behind: at most one between paragraphs.
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
