// Prefills the "open a pull request" dialog from whatever the board already knows about the
// change: the task card, and the run that carried it out.
import { truncate } from "@/lib/format";
import { parseResult } from "@/lib/providers";
import type { Run, Task } from "@/types";

const TITLE_LIMIT = 72;

function section(heading: string, items: string[]): string {
  return `${heading}\n${items.map(item => `- ${item}`).join("\n")}`;
}

/** Title and body for a new pull request, built from a task card and/or the run behind it. */
export function prDraft(input: { task?: Task; run?: Run }): { title: string; body: string } {
  const { task, run } = input;
  if (!task && !run) return { title: "", body: "" };

  const titleSource = task ? task.title : (run?.prompt.split("\n")[0] ?? "");
  const title = truncate(titleSource, TITLE_LIMIT);

  const base = (task ? task.detail : run?.prompt) ?? "";
  const sections: string[] = [];
  if (base.trim()) sections.push(base.trim());

  const result = run ? parseResult(run.output) : null;
  if (result) {
    if (result.files.length) sections.push(section("## Files", result.files));
    if (result.verified.length) sections.push(section("## Verified", result.verified));
    if (result.blocked.length) sections.push(section("## Blocked", result.blocked));
  }

  return { title, body: sections.join("\n\n") };
}
