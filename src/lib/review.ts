export type ReviewVerdict = "approved" | "changes";

/**
 * Parses the review output to extract the final verdict.
 * It looks for the LAST occurrence of "VEREDICTO: APROBADO/CAMBIOS" or "VERDICT: APPROVED/CHANGES" (case-insensitive).
 * If no verdict is found, it defaults to "changes".
 */
export function parseReviewVerdict(output: string): ReviewVerdict {
  const matches = [...output.matchAll(/(?:VEREDICTO|VERDICT)\s*:\s*(APROBADO|CAMBIOS|APPROVED|CHANGES)/gi)];
  if (matches.length === 0) {
    return "changes";
  }
  
  const lastMatch = matches[matches.length - 1][1].toLowerCase();
  if (lastMatch === "aprobado" || lastMatch === "approved") {
    return "approved";
  } else {
    return "changes";
  }
}

/**
 * Picks the first agent with the role "reviewer" excluding the specified agent ID.
 */
export function pickReviewer<T extends { id: string; role: string }>(agents: T[], excludeAgentId: string): T | undefined {
  return agents.find(a => a.role === "reviewer" && a.id !== excludeAgentId);
}
