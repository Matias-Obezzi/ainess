// What the bell says, said in the chat as well.
//
// The app already decides what deserves your attention once, in `notify` — this only puts it in
// words that work in a message: which project it came from, and, when the thing is waiting for an
// answer, what to write back. Being told that a delegation needs approving is no use in a chat
// unless you also know it is `/approve 3f2a`.
import { translateNow } from "@/i18n/useT";
import { truncate } from "@/lib/format";
import type { AppNotification } from "@/types";

/** The short form of an id, the same one the chat replies use. */
export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

export function notificationText(n: AppNotification, projectName?: string): string {
  const head = projectName ? `[${projectName}] ${n.title}` : n.title;
  const lines = [head];
  if (n.body && n.body.trim()) lines.push(truncate(n.body.replace(/\s+/g, " ").trim(), 200));

  // Only for the two that are actually waiting for you: everything else is news, not a question.
  if (n.kind === "approval" && n.approvalId) {
    lines.push(translateNow("bridge.notify.howToApprove", { id: shortId(n.approvalId) }));
  } else if (n.kind === "question") {
    lines.push(translateNow("bridge.notify.howToAnswer"));
  }
  return lines.join("\n");
}
