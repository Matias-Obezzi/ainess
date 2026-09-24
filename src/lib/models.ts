// Pure helper that computes the list of model choices offered to the user in pickers.
// Priority:
// 1. Dynamic models reported by the CLI (e.g. `agy models`, `opencode models`, `ollama list`).
// 2. Static models from PROVIDERS[provider].models as a fallback when the CLI returned nothing.
// 3. User-typed models (remembered from custom input), appended most-recent-first and deduped,
//    so custom models can be re-picked without having to type them each time.

import { ModelInfo, ProviderId } from "@/types";
import { PROVIDERS } from "@/lib/providers";

/**
 * Returns the effective model choices for a given provider:
 * dynamic list if non-empty, otherwise static fallback; then any remembered custom model ids
 * not already present in that base list are appended in the order provided (most recent first), deduped.
 */
export function modelChoices(
  provider: ProviderId,
  dynamic: ModelInfo[] | undefined,
  remembered: string[],
): ModelInfo[] {
  const base = dynamic && dynamic.length > 0
    ? dynamic
    : (PROVIDERS[provider]?.models ?? []);

  const seen = new Set<string>(base.map(m => m.id));
  const appended: ModelInfo[] = [];

  for (const rawId of remembered) {
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    appended.push({ id, label: id });
  }

  return [...base, ...appended];
}
