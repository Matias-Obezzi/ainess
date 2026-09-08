import type { AgentQuestion, Run } from "@/types";

/**
 * Returns the oldest pending question that belongs in the current composer context,
 * along with the total count of pending questions for that context.
 */
export function questionForComposer(
  questions: Record<string, AgentQuestion>,
  runs: Record<string, Run>,
  opts: { projectId: string | null; chatId: string | null; chatAgentIds: string[] }
): { question: AgentQuestion; pending: number } | null {
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

  return {
    question: validQuestions[0],
    pending: validQuestions.length,
  };
}
