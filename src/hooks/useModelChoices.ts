// Returns the model choices available for a provider (dynamic > static > remembered custom models),
// and triggers ensureModels to fetch fresh lists from CLIs when stale or not yet loaded.

import { useEffect, useMemo } from "react";
import { ModelInfo, ProviderId } from "@/types";
import { useAppStore } from "@/store";
import { modelChoices } from "@/lib/models";

/**
 * Hook providing the unified list of model choices for a given provider.
 * Reads dynamic models reported by CLI and hand-typed remembered models from store,
 * memoising the resulting ModelInfo[] list and triggering background ensureModels
 * when the provider is set or changes.
 */
export function useModelChoices(provider: ProviderId | undefined): ModelInfo[] {
  const dynamic = useAppStore(state => (provider ? state.models[provider] : undefined));
  const remembered = useAppStore(state => (provider ? state.config.rememberedModels?.[provider] : undefined));
  const ensureModels = useAppStore(state => state.ensureModels);

  useEffect(() => {
    if (provider) {
      void ensureModels(provider);
    }
  }, [provider, ensureModels]);

  return useMemo(() => {
    if (!provider) return [];
    return modelChoices(provider, dynamic, remembered ?? []);
  }, [provider, dynamic, remembered]);
}
