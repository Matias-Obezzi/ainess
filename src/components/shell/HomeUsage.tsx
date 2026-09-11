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
import { cn } from "@/lib/utils";

/** The window every number on this panel is about. Two weeks: long enough to have a shape. */
const DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="truncate text-lg font-semibold tabular-nums">{value}</span>
      {hint && <span className="truncate text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

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
          value={String(work.tasks)}
          hint={work.failed > 0
            ? t("home.usage.failed", { n: work.failed })
            : plural(work.projects, t("home.usage.projects.one", { n: work.projects }), t("home.usage.projects.other", { n: work.projects }))}
        />
        <Stat
          label={t("home.usage.tokens")}
          value={tokens > 0 ? formatCompact(tokens, locale) : "—"}
          hint={totals.unreported > 0 ? t("home.usage.unreported", { n: totals.unreported }) : undefined}
        />
        {totals.costUsd > 0 && <Stat label={t("home.usage.cost")} value={formatCost(totals.costUsd, locale)} />}
      </div>

      {/* One bar per day, oldest on the left. Deliberately unlabelled: it is a shape, not a chart,
          and the numbers it would be read off are in the tiles above it. */}
      {peak > 0 ? (
        <div className="flex h-10 items-end gap-[3px]" aria-hidden>
          {perDay.map((value, i) => (
            <div
              key={days[i].day}
              title={`${days[i].day} · ${formatCompact(value, locale)}`}
              className={cn("min-h-[2px] flex-1 rounded-sm", value > 0 ? "bg-primary/70" : "bg-muted")}
              style={{ height: `${Math.max(4, (value / peak) * 100)}%` }}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("home.usage.noneReported")}</p>
      )}

      <span className="sr-only">{t("home.usage.since", { date: new Date(since).toLocaleDateString(locale) })}</span>
    </div>
  );
}
