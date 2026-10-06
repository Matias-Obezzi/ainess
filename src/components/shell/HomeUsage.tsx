// How much work went through the app lately, and what it cost in tokens.
//
// Across every project, unlike the per-project figures in `UsageDialog`: from the home screen the
// question is "what has this thing been doing", and the answer is not one project's.
//
// Nothing here is estimated. A CLI that reports no usage contributes runs and no tokens, and when
// none of them report the strip says so rather than drawing a flat line that reads as no work.
import { useMemo } from "react";
import { useAppStore } from "@/store";
import { formatCompact, formatCost, totalTokens, totalsByDay, totalsSince } from "@/lib/usage";
import { workSince } from "@/lib/recent-work";
import { useT, useLocale } from "@/i18n/useT";
import { plural } from "@/i18n";
import { MetricCard } from "@/components/ui/metric-card";
import { Sparkline } from "@/components/ui/sparkline";

/** The window every number on this panel is about. Two weeks: long enough to have a shape. */
const DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A tile whose figure counts up to each new value; compact, to sit three to a row. */
function Stat({ label, value, format, hint }: { label: string; value: number | string; format?: Intl.NumberFormatOptions; hint?: string }) {
  return (
    <MetricCard
      label={label}
      value={value}
      format={format}
      comparison={hint}
      className="flex-1 gap-0.5 rounded-lg px-3 py-2 shadow-none [&_[data-slot=metric-card-label]]:text-[11px] [&_[data-slot=metric-card-value]]:text-lg"
    />
  );
}

const COMPACT: Intl.NumberFormatOptions = { notation: "compact", maximumFractionDigits: 1 };
const USD: Intl.NumberFormatOptions = { style: "currency", currency: "USD", maximumFractionDigits: 2 };

export function HomeUsage() {
  const t = useT();
  const locale = useLocale();
  const runs = useAppStore(state => state.runs);
  const projects = useAppStore(state => state.config.projects);

  const { totals, days, work, since } = useMemo(() => {
    const now = Date.now();
    const since = now - (DAYS - 1) * DAY_MS;
    const alive = new Set(projects.map(p => p.id));
    const list = Object.values(runs).filter(r => alive.has(r.projectId));
    return {
      totals: totalsSince(list, since),
      days: totalsByDay(list, DAYS, now),
      work: workSince(runs, projects, since),
      since,
    };
  }, [runs, projects]);

  // Nothing has run in the window: a panel of zeros says less than no panel.
  if (work.tasks === 0 && totals.runs === 0) return null;

  const tokens = totalTokens(totals);
  const perDay = days.map(d => totalTokens(d.totals));
  const peak = Math.max(...perDay, 0);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">{t("home.usage.title", { days: DAYS })}</h3>

      <div className="flex flex-wrap gap-2">
        <Stat
          label={t("home.usage.tasks")}
          value={work.tasks}
          hint={work.failed > 0
            ? t("home.usage.failed", { n: work.failed })
            : plural(work.projects, t("home.usage.projects.one", { n: work.projects }), t("home.usage.projects.other", { n: work.projects }))}
        />
        <Stat
          label={t("home.usage.tokens")}
          value={tokens > 0 ? tokens : "—"}
          format={COMPACT}
          hint={totals.unreported > 0 ? t("home.usage.unreported", { n: totals.unreported }) : undefined}
        />
        {totals.costUsd > 0 && (
          <Stat
            label={t("home.usage.cost")}
            // Under a cent the tile would read $0.00: the exact figure stays as text.
            value={totals.costUsd < 0.01 ? formatCost(totals.costUsd, locale) : totals.costUsd}
            format={USD}
          />
        )}
      </div>

      {/* One bar per day, oldest on the left. Deliberately unlabelled: it is a shape, not a chart,
          and the numbers it would be read off are in the tiles above it. */}
      {peak > 0 ? (
        <Sparkline
          variant="bar"
          data={perDay}
          labels={days.map(d => d.day)}
          format={value => formatCompact(value, locale)}
          tooltip
          height={40}
          min={0}
          color="var(--primary)"
        />
      ) : (
        <p className="text-xs text-muted-foreground">{t("home.usage.noneReported")}</p>
      )}

      <span className="sr-only">{t("home.usage.since", { date: new Date(since).toLocaleDateString(locale) })}</span>
    </div>
  );
}
