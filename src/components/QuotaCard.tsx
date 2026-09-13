// The line under a run that died of quota: what ran out, when it is back, and the two ways to go
// on — wait for it, or try another agent or model. Once the work has been tried again, all of
// that is history and the line says only that. See `lib/quota-card.ts`.
import { Hourglass, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store";
import { useT, useLocale } from "@/i18n/useT";
import { PROVIDERS } from "@/lib/providers";
import { explainError } from "@/lib/errors";
import { quotaResetsAt } from "@/lib/quota-card";
import { retryWhenQuotaReturns } from "@/lib/orchestrator";
import { formatClock } from "@/lib/format";
import type { AgentConfig, Run } from "@/types";

export function QuotaCard({ run, agent, retried, onRetryWith }: {
  run: Run;
  agent: AgentConfig | undefined;
  /** The same work was started again after this run: nothing left to offer. */
  retried: boolean;
  onRetryWith(): void;
}) {
  const t = useT();
  const locale = useLocale();
  const waiting = useAppStore(state => !!state.quotaWaiting[run.id]);
  const quota = useAppStore(state => (agent ? state.quota[agent.provider] : undefined));
  const dropQuotaWaiting = useAppStore(state => state.dropQuotaWaiting);

  const provider = agent ? PROVIDERS[agent.provider]?.label ?? agent.provider : "";
  const resetsAt = quotaResetsAt(quota, run.model ?? agent?.model);
  const wait = explainError(run.output).values?.wait;
  const when = resetsAt
    ? t("quota.card.resets", { time: formatClock(resetsAt, locale) })
    : wait
      ? t("quota.card.wait", { wait })
      : "";

  if (retried) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <Hourglass className="h-3 w-3 shrink-0" />
        <span>{t("quota.card.retried", { provider })}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
      <Hourglass className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>
        {t("quota.card.title", { provider })}
        {when && <span className="text-muted-foreground"> · {when}</span>}
      </span>
      <span className="ml-auto flex items-center gap-1">
        {waiting ? (
          <>
            <span className="text-muted-foreground">{t("quota.card.waiting")}</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => dropQuotaWaiting(run.id)} title={t("quota.card.cancelWait")}>
              <X className="h-3 w-3" />
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => retryWhenQuotaReturns(run.id)}>
            {t("quota.card.retryWhenBack")}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onRetryWith}>
          <Sparkles className="h-3 w-3" /> {t("retry.action")}
        </Button>
      </span>
    </div>
  );
}
