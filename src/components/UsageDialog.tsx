// What this project has spent, as its CLIs reported it: the whole total, today, this month, a
// table per agent and a bar per day for the last two weeks. Nothing here is estimated — a run
// that reported nothing is counted apart (see src/lib/usage.ts).
import { useMemo, useState } from "react";
import { useAppStore, selectProjectAgents } from "@/store";
import { AgentAvatar } from "@/components/ProviderLogo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import {
  formatCompact,
  formatCost,
  formatUsage,
  totalsByAgent,
  totalsByDay,
  totalsOf,
  totalTokens,
  dayKey,
  type UsageTotals,
} from "@/lib/usage";
import { useT, useLocale, type TFunction } from "@/i18n/useT";
import { plural } from "@/i18n";
import type { Run } from "@/types";
import { Coins } from "lucide-react";

/** Days of the bar chart. */
const CHART_DAYS = 14;

/** Which figure the chart draws: the only one this project actually has. */
type Metric = "cost" | "tokens" | "premium";

function metricOf(totals: UsageTotals): Metric | null {
  if (totals.costUsd > 0) return "cost";
  if (totalTokens(totals) > 0) return "tokens";
  if (totals.premiumRequests > 0) return "premium";
  return null;
}

function valueOf(totals: UsageTotals, metric: Metric): number {
  if (metric === "cost") return totals.costUsd;
  if (metric === "tokens") return totalTokens(totals);
  return totals.premiumRequests;
}

function formatMetric(value: number, metric: Metric, locale: string, t: TFunction): string {
  if (metric === "cost") return formatCost(value, locale);
  if (metric === "tokens") return `${formatCompact(value, locale)} ${t("usage.tokens")}`;
  return `${formatCompact(value, locale)} ${t("usage.premiumRequests")}`;
}

/** `2026-09-06` as a local Date (never through `new Date(string)`, which reads it as UTC). */
function dayDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The header button that opens the panel, next to the branch one. */
export function UsageButton({ projectId }: { projectId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs font-normal"
        title={t("usage.open")}
        onClick={() => setOpen(true)}
      >
        <Coins className="h-3.5 w-3.5" />
        {t("usage.title")}
      </Button>
      <UsageDialog projectId={projectId} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function UsageDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const allRuns = useAppStore(state => state.runs);
  const agents = useAppStore(state => selectProjectAgents(state, projectId));

  const runs = useMemo(() => Object.values(allRuns).filter(r => r.projectId === projectId), [allRuns, projectId]);
  const now = Date.now();

  const total = useMemo(() => totalsOf(runs), [runs]);
  const today = useMemo(() => {
    const key = dayKey(now);
    return totalsOf(runs.filter(r => dayKey(r.startedAt) === key));
  }, [runs, now]);
  const month = useMemo(() => {
    const start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return totalsOf(runs.filter(r => r.startedAt >= start.getTime()));
  }, [runs, now]);
  const byAgent = useMemo(() => totalsByAgent(runs), [runs]);
  const days = useMemo(() => totalsByDay(runs, CHART_DAYS, now), [runs, now]);

  const metric = metricOf(total);
  const labels = { tokens: t("usage.tokens"), premiumRequests: t("usage.premiumRequests") };
  const agentName = (id: string) => agents.find(a => a.id === id)?.name ?? id;
  const agentRows = Object.entries(byAgent).sort((a, b) => valueOfRow(b[1]) - valueOfRow(a[1]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("usage.title")}</DialogTitle>
          <DialogDescription>{t("usage.subtitle")}</DialogDescription>
        </DialogHeader>

        {!metric ? (
          <EmptyState icon={Coins} title={t("usage.empty.title")} description={t("usage.empty.body")} />
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-2 sm:grid-cols-3">
              <TotalsCard label={t("usage.total")} totals={total} locale={locale} labels={labels} t={t} />
              <TotalsCard label={t("usage.today")} totals={today} locale={locale} labels={labels} t={t} />
              <TotalsCard label={t("usage.month")} totals={month} locale={locale} labels={labels} t={t} />
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold">
                  {metric === "cost" ? t("usage.chartCost") : metric === "tokens" ? t("usage.chartTokens") : t("usage.chartPremium")}
                </h4>
                <span className="text-[11px] text-muted-foreground">{t("usage.byDay", { n: CHART_DAYS })}</span>
              </div>
              <DayChart days={days} metric={metric} locale={locale} t={t} />
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t("usage.byAgent")}</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">{t("usage.agent")}</th>
                      <th className="py-1 pr-2 text-right font-medium">{t("usage.runsColumn")}</th>
                      <th className="py-1 pr-2 text-right font-medium">{t("usage.cost")}</th>
                      <th className="py-1 pr-2 text-right font-medium">{t("usage.tokensColumn")}</th>
                      <th className="py-1 text-right font-medium">{t("usage.premiumColumn")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentRows.map(([agentId, totals]) => {
                      const agent = agents.find(a => a.id === agentId);
                      return (
                        <tr key={agentId} className="border-t border-border">
                          <td className="py-1.5 pr-2">
                            <span className="flex items-center gap-1.5">
                              {agent && <AgentAvatar provider={agent.provider} color={agent.color} size={18} />}
                              <span className="truncate">{agentName(agentId)}</span>
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{totals.runs}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {totals.costUsd > 0 ? formatCost(totals.costUsd, locale) : "—"}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {totalTokens(totals) > 0 ? formatCompact(totalTokens(totals), locale) : "—"}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {totals.premiumRequests > 0 ? formatCompact(totals.premiumRequests, locale) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Orders the table: money first, then tokens, then premium requests. */
function valueOfRow(totals: UsageTotals): number {
  return totals.costUsd * 1e9 + totalTokens(totals) * 1e3 + totals.premiumRequests;
}

function TotalsCard({
  label,
  totals,
  locale,
  labels,
  t,
}: {
  label: string;
  totals: UsageTotals;
  locale: string;
  labels: { tokens: string; premiumRequests: string };
  t: TFunction;
}) {
  const line = formatUsage(totals, locale, labels);
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{line || t("usage.none")}</p>
      <p className="text-[11px] text-muted-foreground">
        {plural(totals.runs, t("usage.runs.one", { n: totals.runs }), t("usage.runs.other", { n: totals.runs }))}
        {totals.unreported > 0 ? ` · ${t("usage.unreported", { n: totals.unreported })}` : ""}
      </p>
    </div>
  );
}

/** One bar per day, drawn by hand: no chart library for fourteen rectangles. */
function DayChart({
  days,
  metric,
  locale,
  t,
}: {
  days: Array<{ day: string; totals: UsageTotals }>;
  metric: Metric;
  locale: string;
  t: TFunction;
}) {
  const width = 340;
  const height = 90;
  const gap = 4;
  const barWidth = (width - gap * (days.length - 1)) / days.length;
  const values = days.map(d => valueOf(d.totals, metric));
  const max = Math.max(...values);
  const dayLabel = (key: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(dayDate(key));

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full text-primary" role="img" aria-label={t("usage.byDay", { n: days.length })}>
        {days.map((entry, i) => {
          const value = values[i];
          // Every day keeps a sliver of a bar, so an empty day still reads as a day.
          const barHeight = max > 0 && value > 0 ? Math.max(2, (value / max) * (height - 4)) : 2;
          return (
            <rect
              key={entry.day}
              x={i * (barWidth + gap)}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx={2}
              fill="currentColor"
              opacity={value > 0 ? 0.85 : 0.2}
            >
              <title>{`${dayLabel(entry.day)} · ${value > 0 ? formatMetric(value, metric, locale, t) : t("usage.none")}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{dayLabel(days[0].day)}</span>
        <span>{dayLabel(days[days.length - 1].day)}</span>
      </div>
    </div>
  );
}

/** One short line for a single run, empty when its CLI reported nothing. */
export function runUsageText(run: Run | undefined, locale: string, t: TFunction): string {
  if (!run?.usage) return "";
  return formatUsage(totalsOf([run]), locale, { tokens: t("usage.tokens"), premiumRequests: t("usage.premiumRequests") });
}
