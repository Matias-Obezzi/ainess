// The little circle that says how much of an agent's quota has gone, plus the hook that computes it.
import { useMemo } from "react";
import type { AgentConfig } from "@/types";
import { useAppStore } from "@/store";
import { PROVIDERS } from "@/lib/providers";
import { summarizeAgentQuota, type QuotaSummary } from "@/lib/quota-summary";
import { cn } from "@/lib/utils";
import { translateNow } from "@/i18n/useT";

/** Green while there is room, amber when it gets tight, red when it is about to run out. */
function ringColor(remaining: number | null): string {
  if (remaining === null) return "text-muted-foreground/40";
  if (remaining > 0.5) return "text-emerald-500";
  if (remaining >= 0.2) return "text-amber-500";
  return "text-destructive";
}

/**
 * A donut that fills as the quota is spent. Too small for text inside: the number goes next to it
 * or in the tooltip.
 *
 * The arc and the colour read opposite ways, and both are deliberate. The arc grows with what has
 * been used, the way every meter of a thing being consumed does — an empty ring is an untouched
 * quota. The colour follows what is left, so a ring that is nearly full is also red: the two say
 * "you are running out" together rather than one of them saying it late.
 */
export function QuotaRing({
  remaining,
  size = 18,
  label,
  className
}: {
  /** Share still available, 0..1, or null when the provider does not report enough to know. */
  remaining: number | null;
  size?: number;
  label?: string;
  className?: string;
}) {
  const stroke = Math.max(2, Math.round(size / 9));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const left = remaining === null ? 0 : Math.max(0, Math.min(1, remaining));
  const filled = remaining === null ? 0 : 1 - left;
  const percent = remaining === null ? null : Math.round(filled * 100);
  const text = label ?? (percent === null ? translateNow("quota.noData") : `${percent}%`);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={translateNow("quota.used", { value: text })}
      className={cn("shrink-0", ringColor(remaining), className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="opacity-20"
      />
      {remaining !== null && filled > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * filled} ${circumference}`}
          // Start the arc at 12 o'clock and run clockwise.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}

/** Every model an agent could end up using: what the provider reported, else its default list. */
export function useProviderModels(provider: AgentConfig["provider"]): string[] {
  const known = useAppStore(state => state.models[provider]);
  return useMemo(() => {
    if (known && known.length > 0) return known.map(m => m.id);
    return PROVIDERS[provider]?.defaultModels || [];
  }, [known, provider]);
}

/**
 * Quota left for one agent, from what the store already knows. Never fetches: the popover's
 * "Actualizar" button is the only thing that hits the providers.
 */
export function useAgentQuota(agent: AgentConfig): QuotaSummary {
  const quota = useAppStore(state => state.quota[agent.provider]);
  const autoModel = useAppStore(state => state.config.autoModel);
  const allModels = useProviderModels(agent.provider);
  return useMemo(
    () =>
      autoModel
        ? summarizeAgentQuota(quota, { allModels })
        : summarizeAgentQuota(quota, { model: agent.model }),
    [quota, autoModel, allModels, agent.model]
  );
}
