// The quota button that sits at the end of the composer's select row: the ring of the agent you
// are talking to, and, on click, the breakdown for every agent.
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { AgentConfig, ProviderId } from "@/types";
import { useAppStore, selectProjectAgents } from "@/store";
import { AgentAvatar } from "@/components/ProviderLogo";
import { QuotaRing, useAgentQuota } from "@/components/QuotaRing";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/useT";

/** One agent's quota inside the popover. */
function QuotaRow({ agent }: { agent: AgentConfig }) {
  const quota = useAgentQuota(agent);
  return (
    <div className="flex items-start gap-2">
      <AgentAvatar provider={agent.provider} color={agent.color} size={24} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium">{agent.name}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <QuotaRing remaining={quota.fraction} label={quota.label} size={14} />
            {quota.fraction !== null && (
              <span className="text-[10px] text-muted-foreground tabular-nums">{quota.label}</span>
            )}
          </span>
        </div>
        {/* With a ring, its line is enough; without one the lines are the whole answer (an
            opencode agent has one per linked account). */}
        {(quota.fraction === null ? quota.details : [quota.detail]).map((line, i) => (
          <p key={i} className="text-[10px] leading-snug text-muted-foreground">{line}</p>
        ))}
      </div>
    </div>
  );
}

/** Trigger + breakdown. `agent` is who the composer is talking to right now. */
export function QuotaIndicator({ agent, className }: { agent: AgentConfig; className?: string }) {
  const t = useT();
  const agents = useAppStore(state => selectProjectAgents(state, state.currentProjectId));
  const autoModel = useAppStore(state => state.config.autoModel);
  const refreshQuota = useAppStore(state => state.refreshQuota);
  const quota = useAgentQuota(agent);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    const providers = [...new Set(agents.map(a => a.provider))] as ProviderId[];
    try {
      await Promise.all(providers.map(provider => refreshQuota(provider, { force: true })));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-8 gap-1.5 px-2 text-xs", className)}
          aria-label={t("quota.ofAgent", { name: agent.name, detail: quota.detail })}
          title={t("quota.ofAgent", { name: agent.name, detail: quota.detail })}
        >
          <QuotaRing remaining={quota.fraction} label={quota.label} size={16} />
          {quota.fraction !== null && (
            <span className="text-muted-foreground tabular-nums">{quota.label}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">{t("quota.perAgent")}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1.5 px-2 text-xs"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            {t("git.refresh")}
          </Button>
        </div>
        {autoModel && (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            {t("quota.autoModelHint")}
          </p>
        )}
        <div className="mt-3 flex flex-col gap-3">
          {agents.map(a => (
            <QuotaRow key={a.id} agent={a} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
