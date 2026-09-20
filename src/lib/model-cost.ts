// Model resolution and observed cost-per-million calculations. Pure functions over runs:
// nothing here touches the store, React, or the transport.
//
// We derive costs from the user's real runs rather than maintaining a hardcoded pricing table,
// which easily goes stale and misrepresents quota-based subscription plans.
//
// Warning: the CLI reports `costBasis: "list"` (list prices). Under a subscription or quota plan,
// the actual marginal cost may be zero, so this figure is an observed reference and not an invoice.

import type { Run } from "@/types";

/**
 * Resolves which model the agent actually used, based on its most recent run that reported `byModel`.
 *
 * When a run touches multiple models, the dominant model (the one with the most total tokens:
 * input + output + cached) wins. Returns undefined if there is no data.
 */
export function resolvedModel(runs: Run[] | Record<string, Run>, agentId: string): string | undefined {
  const runList = Array.isArray(runs) ? runs : Object.values(runs);
  let latest: Run | undefined;

  for (const run of runList) {
    if (run.agentId !== agentId) continue;
    const byModel = run.usage?.byModel;
    if (!byModel || Object.keys(byModel).length === 0) continue;
    if (!latest || run.startedAt >= latest.startedAt) {
      latest = run;
    }
  }

  if (!latest?.usage?.byModel) return undefined;

  let dominantModel: string | undefined;
  let maxTokens = -1;

  for (const [modelId, usage] of Object.entries(latest.usage.byModel)) {
    const tokens =
      (usage.inputTokens ?? 0) +
      (usage.outputTokens ?? 0) +
      (usage.cachedInputTokens ?? 0);
    if (tokens > maxTokens) {
      maxTokens = tokens;
      dominantModel = modelId;
    }
  }

  return dominantModel;
}

/**
 * Calculates the observed cost per million tokens for a given model, summing `costUsd`
 * across all runs and dividing by the total tokens (input + output + cached) for that model.
 *
 * Derived from the user's real runs so it stays accurate to their usage without hardcoding
 * stale pricing tables.
 *
 * Returns undefined when there are no tokens or no cost reported.
 */
export function costPerMillion(runs: Run[] | Record<string, Run>, modelId: string): number | undefined {
  const runList = Array.isArray(runs) ? runs : Object.values(runs);
  let totalCostUsd = 0;
  let totalTokens = 0;
  let hasCost = false;

  for (const run of runList) {
    const modelUsage = run.usage?.byModel?.[modelId];
    if (!modelUsage) continue;

    const tokens =
      (modelUsage.inputTokens ?? 0) +
      (modelUsage.outputTokens ?? 0) +
      (modelUsage.cachedInputTokens ?? 0);

    if (typeof modelUsage.costUsd === "number" && !Number.isNaN(modelUsage.costUsd) && modelUsage.costUsd > 0) {
      totalCostUsd += modelUsage.costUsd;
      hasCost = true;
    }

    totalTokens += tokens;
  }

  if (!hasCost || totalTokens <= 0 || totalCostUsd <= 0) {
    return undefined;
  }

  return (totalCostUsd / totalTokens) * 1_000_000;
}
