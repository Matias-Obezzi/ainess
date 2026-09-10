// What the box offers to write for you, in grey, for Tab to accept.
//
// Two different things wear the same clothes here, and it is worth keeping them apart.
//
// With the box empty, this is not a prediction at all: if the agent's last message ends in a
// yes/no question, the useful answer is yes, and offering it saves the round trip of typing it. An
// agent that uses an `ask` block gets a proper list of options (see InlineQuestion) — this is the
// net for the ones that ask in prose instead.
//
// Once you have started typing, it is a completion over your own past messages in this same
// conversation: what you already wrote here, offered again from its first characters. Nothing is
// invented and nothing leaves the machine; a message from another project never appears in this
// one, the same rule the shared context follows.
//
// Pure module: no store, no React. What it cannot do is understand the conversation — that needs a
// model, and there is none running locally.

export type GhostSource = "reply" | "history";

export interface Ghost {
  /** What to append to what is typed. */
  text: string;
  source: GhostSource;
}

/** Nothing is offered until this much has been typed: below it, everything matches everything. */
const MIN_PREFIX = 3;

/**
 * Words a question opens with when it wants more than a yes.
 *
 * A heuristic, and deliberately one that errs towards silence: a question this does not recognise
 * is treated as open and gets no suggestion, which is the harmless direction. Both the language the
 * user set and the one the agent happened to answer in are in here, because those are often not the
 * same language.
 */
const OPEN_QUESTION_WORDS = new Set([
  // es
  "que", "qué", "cual", "cuál", "cuales", "cuáles", "como", "cómo", "cuando", "cuándo",
  "donde", "dónde", "quien", "quién", "cuanto", "cuánto", "cuanta", "cuánta", "por",
  // en
  "what", "which", "how", "when", "where", "who", "whom", "whose", "why",
  // the rest of the languages the app speaks
  "was", "welche", "welcher", "wie", "wann", "wo", "wer", "warum",
  "quoi", "quel", "quelle", "comment", "quand", "où", "qui", "pourquoi",
  "o", "qual", "quais", "quando", "onde", "quem", "porque", "por que",
  "何", "どの", "どう", "いつ", "どこ", "誰", "なぜ",
  "什么", "哪个", "怎么", "什么时候", "哪里", "谁", "为什么",
]);

/** Leading punctuation and markdown a sentence can start with, including Spanish's opening `¿`. */
const LEADING = /^[\s¿¡"'*_>`\-–—•]+/;

/**
 * The last sentence of `text`, when that sentence is a question.
 *
 * Read off the last non-empty line rather than the whole message: an agent's answer is paragraphs
 * and code, and the question it ends with is the only part being answered.
 */
export function trailingQuestion(text: string): string | null {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return null;
  // A line that is just a fence or a list of ``` is not a question, whatever it ends with.
  if (last.startsWith("```")) return null;
  if (!/[?？]$/.test(last)) return null;

  // Only the final sentence of that line: "Ya está. ¿Lo arreglo?" asks one thing.
  const parts = last.split(/(?<=[.!。！?？])\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? last;
}

/** Whether a question is asking for a yes or a no rather than for a choice. */
export function isClosedQuestion(question: string): boolean {
  const first = question.replace(LEADING, "").split(/[\s,]+/)[0]?.toLowerCase();
  if (!first) return false;
  return !OPEN_QUESTION_WORDS.has(first.replace(/[?？]$/, ""));
}

/**
 * The rest of the most recent message that starts with what has been typed.
 *
 * Newest first on purpose: the last way you phrased something is the way you phrase it now. The
 * match ignores case but the completion keeps the past message's own, so accepting it gives back
 * exactly what you wrote before rather than a case-folded version of it.
 */
export function historyCompletion(prefix: string, past: string[]): string | null {
  if (prefix.length < MIN_PREFIX) return null;
  const needle = prefix.toLowerCase();
  for (const message of past) {
    if (message.length <= prefix.length) continue;
    if (!message.toLowerCase().startsWith(needle)) continue;
    const rest = message.slice(prefix.length);
    if (rest.trim()) return rest;
  }
  return null;
}

/**
 * What to show in grey right now, or nothing.
 *
 * The empty box is the only place the suggested reply appears: once you are writing, you have said
 * what you think of the question and putting a "yes" after your words would be nonsense.
 */
export function ghostFor(opts: {
  /** What is in the box. */
  text: string;
  /** The agent's last message in this conversation, if there is one. */
  lastAgentMessage?: string;
  /** The user's own past messages here, newest first. */
  past: string[];
  /** The affirmative reply, in the user's language. */
  affirmative: string;
}): Ghost | null {
  if (!opts.text.trim()) {
    const question = opts.lastAgentMessage ? trailingQuestion(opts.lastAgentMessage) : null;
    if (question && isClosedQuestion(question)) return { text: opts.affirmative, source: "reply" };
    return null;
  }
  const rest = historyCompletion(opts.text, opts.past);
  return rest ? { text: rest, source: "history" } : null;
}
