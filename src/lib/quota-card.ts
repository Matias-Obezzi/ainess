// A run that died of quota, drawn as what it is rather than as an answer.
//
// The CLI's "usage limit reached" arrived as the run's final output, so it was shown as the last
// thing the agent said — a paragraph of provider boilerplate in the middle of the conversation,
// with the way to try again two clicks away. These are the facts the card needs: when the quota
// is back, and whether the work has since been tried again.
import type { ProviderQuota, Run } from "@/types";

/**
 * When the spent quota comes back, from what the provider reports: the earliest reset among the
 * items that are used up, or among all of them when none says it is. Undefined when nothing does.
 */
export function quotaResetsAt(quota: ProviderQuota | undefined, model?: string): number | undefined {
  if (!quota || quota.status !== "ok") return undefined;
  const applies = quota.items.filter(item => !item.model || !model || model.startsWith(item.model) || item.model.startsWith(model));
  const spent = applies.filter(item => item.exhausted || item.remaining === 0 || item.percentRemaining === 0 || item.usedPercent === 100);
  const pool = (spent.length > 0 ? spent : applies).map(item => item.resetsAt).filter((t): t is number => typeof t === "number");
  return pool.length > 0 ? Math.min(...pool) : undefined;
}

/**
 * Whether the same work was started again after this run: same project, same agent, same prompt,
 * later. That is what a retry is, by hand or by the quota watcher, and once there is one the card
 * under the dead run has nothing left to offer.
 */
export function retriedLater(runs: Record<string, Run>, run: Pick<Run, "id" | "projectId" | "agentId" | "prompt" | "startedAt">): boolean {
  return Object.values(runs).some(other =>
    other.id !== run.id
    && other.parentRunId === null
    && other.projectId === run.projectId
    && other.agentId === run.agentId
    && other.prompt === run.prompt
    && other.startedAt > run.startedAt,
  );
}
