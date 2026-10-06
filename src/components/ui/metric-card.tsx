'use client'

import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from 'lucide-react'
import * as React from 'react'
import { useLabels, useLocale } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { NumberTicker } from '@/components/ui/number-ticker'
import { Skeleton } from '@/components/ui/skeleton'

export interface MetricCardLabels {
  /** Read while `loading`. */
  loading: string
  /** Read before the delta, for the direction its arrow shows. */
  up: string
  down: string
  noChange: string
}

export const defaultMetricCardLabels: MetricCardLabels = {
  loading: 'Loading',
  up: 'Up',
  down: 'Down',
  noChange: 'No change',
}

export interface MetricCardProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** What is measured, like "Revenue". Sentence case, no colon. */
  label: React.ReactNode
  /** The figure. A number counts up when it comes into view and from the old value when it changes; anything else is shown as it is. */
  value: number | React.ReactNode
  /** Extra Intl.NumberFormat options for a number value, for currency, percent or compact notation. */
  format?: Intl.NumberFormatOptions
  /** Digits after the decimal point of a number value. Default 0. */
  decimals?: number
  /** Locale of the value and delta formats. Defaults to the browser's. */
  locale?: string
  /** The change as a fraction: `0.124` reads +12.4%. Its sign picks the arrow. */
  delta?: number
  /** Intl.NumberFormat options for the delta. Default a signed percent with one decimal. */
  deltaFormat?: Intl.NumberFormatOptions
  /** Down is the good direction, as for costs, churn or response time. Default false. */
  inverse?: boolean
  /** What the delta compares against, like "vs last month". */
  comparison?: React.ReactNode
  /** A small chart under the value, usually a `<Sparkline />`. */
  sparkline?: React.ReactNode
  /** An icon or action in the top right corner. */
  action?: React.ReactNode
  /** Shows placeholders in place of the value, delta and sparkline. Default false. */
  loading?: boolean
  /** Milliseconds the value takes to count. Default 1200. */
  duration?: number
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<MetricCardLabels>
}

const DEFAULT_DELTA: Intl.NumberFormatOptions = {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
}

/**
 * A compact KPI: label, value, the change against a period with its direction, and an optional
 * sparkline. The delta is green when it moves the good way, which `inverse` flips for metrics
 * where down is better, and always carries an arrow and words, never color alone.
 */
function MetricCard({
  label,
  value,
  format,
  decimals = 0,
  locale: localeProp,
  delta,
  deltaFormat = DEFAULT_DELTA,
  inverse = false,
  comparison,
  sparkline,
  action,
  loading = false,
  duration = 1200,
  labels: labelsProp,
  className,
  ...props
}: MetricCardProps) {
  const labels = useLabels('metric-card', defaultMetricCardLabels, labelsProp)
  const locale = useLocale(localeProp)
  const labelId = React.useId()
  // Count from the value on screen, not from zero, when a new value comes in.
  const numeric = typeof value === 'number' ? value : null
  const [range, setRange] = React.useState({ from: 0, to: numeric ?? 0 })
  if (numeric !== null && numeric !== range.to) setRange({ from: range.to, to: numeric })

  const direction = delta === undefined || delta === 0 ? 0 : delta > 0 ? 1 : -1
  const good = direction === 0 ? null : direction > 0 !== inverse
  const deltaText =
    delta === undefined ? '' : new Intl.NumberFormat(locale, deltaFormat).format(delta)
  const Arrow = direction > 0 ? ArrowUpRightIcon : direction < 0 ? ArrowDownRightIcon : MinusIcon

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own box model
    <div
      role="group"
      aria-labelledby={labelId}
      aria-busy={loading || undefined}
      data-slot="metric-card"
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-xs',
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div id={labelId} data-slot="metric-card-label" className="text-muted-foreground text-sm">
          {label}
        </div>
        {action && <div className="-my-1 shrink-0 text-muted-foreground">{action}</div>}
      </div>

      {loading ? (
        <div className="grid gap-2.5">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-40" />
          {sparkline !== undefined && <Skeleton className="mt-1 h-8 w-full" />}
          <span className="sr-only">{labels.loading}</span>
        </div>
      ) : (
        <>
          <div
            data-slot="metric-card-value"
            className="font-semibold text-3xl leading-none tracking-tight"
          >
            {numeric !== null ? (
              <NumberTicker
                value={range.to}
                from={range.from}
                decimals={decimals}
                locale={locale}
                format={format}
                duration={duration}
              />
            ) : (
              value
            )}
          </div>
          {(delta !== undefined || comparison) && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
              {delta !== undefined && (
                <span
                  data-slot="metric-card-delta"
                  data-trend={direction > 0 ? 'up' : direction < 0 ? 'down' : 'flat'}
                  data-good={good === null ? undefined : String(good)}
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular-nums',
                    good === true &&
                      'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400',
                    good === false && 'bg-destructive/10 text-destructive',
                    good === null && 'bg-muted text-muted-foreground',
                  )}
                >
                  <Arrow aria-hidden className="size-3.5" />
                  <span className="sr-only">
                    {direction > 0 ? labels.up : direction < 0 ? labels.down : labels.noChange}
                  </span>
                  {/* The sign repeats the arrow for sighted readers; screen readers get the words. */}
                  <span aria-hidden={direction !== 0}>{deltaText}</span>
                  {direction !== 0 && (
                    <span className="sr-only">
                      {new Intl.NumberFormat(locale, {
                        ...deltaFormat,
                        signDisplay: 'never',
                      }).format(delta ?? 0)}
                    </span>
                  )}
                </span>
              )}
              {comparison && <span className="text-muted-foreground">{comparison}</span>}
            </div>
          )}
          {sparkline !== undefined && (
            <div data-slot="metric-card-sparkline" className="mt-1">
              {sparkline}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export { MetricCard }
