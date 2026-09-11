// Buttons under a bridge message, and what pressing one means.
//
// Everything the bridge could do had to be typed, and the two things that actually wait on you —
// a delegation held for approval and a question an agent asked — had to be typed *with an id*:
// `/approve 3f2a1b2c`, copied out of the message above. On a phone that is the difference between
// answering and not answering.
//
// The press has to survive three platforms with three different size limits, so what travels is a
// token and not the answer: Telegram allows 64 bytes of callback data, and an option's text is not
// bounded by anything. `a:3f2a1b2c` is ten. The token names the thing and the choice, and the
// runner looks the text up on this side, where it already has it.
//
// Pure module: no platform, no store. `parseActionToken` is the one that has to be careful, because
// what it parses arrives from outside.
import type { AgentQuestion } from "@/types";

/** One button as the providers want it: a label to show and a token to send back. */
export interface BridgeButton {
  token: string;
  label: string;
  /** Telegram has no styles; the other two do, and a destructive answer should not look ordinary. */
  style?: "primary" | "danger";
}

/** What a press turns out to mean. */
export type BridgeAction =
  | { kind: "approve"; id: string }
  | { kind: "reject"; id: string }
  | { kind: "answer"; id: string; option: number };

/**
 * How many options get a button.
 *
 * Discord fits twenty-five (five rows of five) and Slack twenty-five in one actions block, but a
 * question with eleven answers is not a question anyone wants to read as a wall of buttons on a
 * phone. Past this it stays typed, which still works.
 */
export const MAX_OPTION_BUTTONS = 10;

/** Discord cuts a label at 80 and Slack at 75; this is under both, and under a phone's width. */
const MAX_LABEL = 60;

/** The short form of an id, the same one the text commands take. */
export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

function label(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_LABEL ? `${flat.slice(0, MAX_LABEL - 1)}…` : flat;
}

export function actionToken(action: BridgeAction): string {
  if (action.kind === "answer") return `q:${shortId(action.id)}:${action.option}`;
  return `${action.kind === "approve" ? "a" : "r"}:${shortId(action.id)}`;
}

/**
 * What a press means, or null.
 *
 * Null for anything that does not fit exactly, because this string came off the network: a token
 * the app did not mint is not a command, and the ids it carries are looked up rather than trusted.
 */
export function parseActionToken(token: string): BridgeAction | null {
  const parts = token.split(":");
  const id = parts[1];
  if (!id || !/^[0-9a-f]{1,32}$/i.test(id)) return null;

  if (parts[0] === "a" && parts.length === 2) return { kind: "approve", id };
  if (parts[0] === "r" && parts.length === 2) return { kind: "reject", id };
  if (parts[0] === "q" && parts.length === 3) {
    const option = Number(parts[2]);
    if (!Number.isInteger(option) || option < 0 || option >= MAX_OPTION_BUTTONS) return null;
    return { kind: "answer", id, option };
  }
  return null;
}

/** Yes and no under a delegation waiting to be let through. */
export function approvalButtons(approvalId: string, labels: { approve: string; reject: string }): BridgeButton[] {
  return [
    { token: actionToken({ kind: "approve", id: approvalId }), label: label(labels.approve), style: "primary" },
    { token: actionToken({ kind: "reject", id: approvalId }), label: label(labels.reject), style: "danger" },
  ];
}

/**
 * One button per option of a question.
 *
 * Nothing for a question that takes several answers: a button is one press and one press would
 * resume the run with a single option, which is a different answer from the one being asked for.
 * Those stay typed, and the message says so.
 */
export function questionButtons(question: Pick<AgentQuestion, "id" | "options" | "multiple">): BridgeButton[] {
  if (question.multiple) return [];
  return question.options
    .slice(0, MAX_OPTION_BUTTONS)
    .map((option, i) => ({ token: actionToken({ kind: "answer", id: question.id, option: i }), label: label(option) }));
}
