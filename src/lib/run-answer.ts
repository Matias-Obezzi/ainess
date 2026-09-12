// What a finished turn should still show of what the agent said.
//
// Two things carry an agent's words, and they are not the same thing. The stream carries everything
// it said as it said it, delta by delta, and is kept as one `text-<runId>` message. `run.output` is
// the provider's *final* answer — for Claude, the `result` line, which is the last message and only
// the last message.
//
// The bubble showed `run.output`. So a turn that explained something, ran three tools and then
// finished with a delegation or a one-line summary lost everything before that line the moment it
// stopped running: while it worked you could read it, and when it ended it was gone. Reported twice,
// from opposite ends — "my answer disappeared when it delegated" and "the partial answers are lost
// when the activity finishes, it only shows the last thing it said".
//
// Nothing was actually lost: the stream is in the feed and inside the activity list. It just stopped
// being where anyone was looking. So the bubble shows the transcript, and adds the final answer only
// when the final answer says something the transcript does not already contain.

export interface RunAnswer {
  /** Everything the agent said during the turn, as it said it. Empty when it streamed nothing. */
  transcript: string;
  /** The provider's final answer, or empty when the transcript already ends with it. */
  final: string;
}

/**
 * Splits a finished run's words into what to show and what would only repeat.
 *
 * The two are compared on their text and not their identity: a provider that streams its answer and
 * then repeats it as the result — which is the common case, a plain reply — would otherwise show up
 * twice, which is what the old dedup in the orchestrator was already working around.
 */
export function runAnswer(transcript: string, output: string): RunAnswer {
  const streamed = transcript.trim();
  const final = output.trim();

  if (!streamed) return { transcript: "", final };
  if (!final) return { transcript: streamed, final: "" };
  // Already said, either as the whole stream or as its closing words.
  if (streamed === final || streamed.includes(final)) return { transcript: streamed, final: "" };
  return { transcript: streamed, final };
}

/**
 * The same decision as one string, for a bubble that holds one `text` rather than two parts.
 *
 * The chat's message is a single field, and it used to be overwritten with `run.output` when the
 * turn ended — the same loss as the thread's, arrived at from the other side.
 */
export function runAnswerText(transcript: string, output: string): string {
  const answer = runAnswer(transcript, output);
  return [answer.transcript, answer.final].filter(Boolean).join("\n\n");
}

/** Everything the run said as it said it: its streamed `text` messages, in order. */
export function transcriptOf(messages: ReadonlyArray<{ runId?: string; kind: string; text: string }>, runId: string): string {
  let text = "";
  for (const m of messages) {
    if (m.runId === runId && m.kind === "text") text = text ? `${text}\n${m.text}` : m.text;
  }
  return text;
}
