import type { AgentQuestion, Run } from "@/types";

/**
 * The questions to put in front of the user right now, and how many are waiting in all.
 *
 * A turn that asked three things comes back as three questions, and they are answered together:
 * the agent asked once and gets one reply, and answering them one at a time started one run per
 * answer — three tasks on the board off a single turn. So the group is every pending question of
 * the same run as the oldest one, in the order they were asked.
 *
 * `pending` still counts the whole context, which is what "N questions waiting on you" means: the
 * other runs' questions are next, not part of this group.
 */
export function questionsForComposer(
  questions: Record<string, AgentQuestion>,
  runs: Record<string, Run>,
  opts: { projectId: string | null; chatId: string | null; chatAgentIds: string[] }
): { group: AgentQuestion[]; pending: number } | null {
  if (!opts.projectId) return null;

  const validQuestions = Object.values(questions).filter((q) => {
    if (q.status !== "pending") return false;
    if (q.projectId !== opts.projectId) return false;

    const run = runs[q.runId];
    const isChatRun = run?.kind === "chat";

    if (opts.chatId) {
      // Inside a saved chat
      if (!isChatRun) return false;
      if (!opts.chatAgentIds.includes(q.agentId)) return false;
    } else {
      // Outside a saved chat (orchestrator thread)
      if (isChatRun) return false;
    }

    return true;
  });

  if (validQuestions.length === 0) return null;

  validQuestions.sort((a, b) => a.createdAt - b.createdAt);

  const oldest = validQuestions[0];
  return {
    group: validQuestions.filter(q => q.runId === oldest.runId),
    pending: validQuestions.length,
  };
}
