'use client'

import { CircleAlertIcon, TriangleAlertIcon } from 'lucide-react'
import * as React from 'react'
import { useLabels, useLocale } from '@/lib/labels'
import { cn } from '@/lib/utils'

export interface UsageMeterLabels {
  /** Shown near the limit. */
  warning: string
  /** Shown past the limit, with the formatted overage. */
  over: (overage: string) => string
  /** The total next to the label. The used amount is drawn bolder. */
  amount: (used: string, limit: string) => string
  /** What the meter reads as. */
  valueText: (used: string, limit: string) => string
  /** Added to it near the limit. */
  almostFull: string
  /** Added to it past the limit. */
  overLimit: (overage: string) => string
  /** The legend entry for what is left. */
  free: string
}

export const defaultUsageMeterLabels: UsageMeterLabels = {
  warning: 'Almost full',
  over: (overage) => `Over by ${overage}`,
  amount: (used, limit) => `${used} of ${limit}`,
  valueText: (used, limit) => `${used} of ${limit} used`,
  almostFull: 'almost full',
  overLimit: (overage) => `over the limit by ${overage}`,
  free: 'Free',
}

/** Stands in for the used amount, so it can be drawn as its own element inside the sentence. */
const SLOT = '\u0000'

export interface UsageMeterSegment {
  /** Stable identity, kept while the value changes so the segment resizes instead of being replaced. */
  key: string
  /** Name in the legend, like "Images". */
  label: string
  /** Amount used, in the same unit as `limit`. */
  value: number
  /** Any CSS color. Defaults to `var(--chart-1)` to `var(--chart-5)`, in order. */
  color?: string
}

export interface UsageMeterProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  /** What is measured, like "Storage". Also names the meter. */
  label: React.ReactNode
  /** What uses the allowance, in display order. Up to five read clearly. */
  segments: UsageMeterSegment[]
  /** The allowance, in the same unit as the segments. */
  limit: number
  /** Formats amounts, like `(n) => \`${n} GB\``. Defaults to the locale's number format. */
  format?: (value: number) => string
  /** Locale of the default format. Defaults to the browser's. */
  locale?: string
  /** Share of the limit, 0 to 1, from which the meter warns. Default 0.8. */
  warnAt?: number
  /** Legend with each segment's amount under the bar. Default true. */
  showLegend?: boolean
  /** Text for the warning state. Default "Almost full". */
  warningLabel?: React.ReactNode
  /** Text for the over limit state. Receives the formatted overage. Default "Over by …". */
  overLabel?: (overage: string) => React.ReactNode
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<UsageMeterLabels>
}

/** The color of the segment at `index` when it brings none. */
const segmentColor = (index: number) => `var(--chart-${(index % 5) + 1})`

/**
 * What fills an allowance, as one stacked bar with a legend: storage by file type, seats by role,
 * credits by project. Warns near the limit and shows the overage past it, with an icon and words
 * as well as color. Read as a `meter` by screen readers.
 */
function UsageMeter({
  label,
  segments,
  limit,
  format,
  locale: localeProp,
  warnAt = 0.8,
  showLegend = true,
  warningLabel,
  overLabel,
  labels: labelsProp,
  className,
  ...props
}: UsageMeterProps) {
  const labels = useLabels('usage-meter', defaultUsageMeterLabels, labelsProp)
  const locale = useLocale(localeProp)
  const labelId = React.useId()
  const numberFormat = React.useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    [locale],
  )
  const fmt = format ?? ((v: number) => numberFormat.format(v))

  // Grow from empty on mount; later changes animate from the current widths.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const used = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  const share = limit > 0 ? used / limit : used > 0 ? Number.POSITIVE_INFINITY : 0
  const state = share > 1 ? 'over' : share >= warnAt ? 'warning' : 'ok'
  // Past the limit the bar spans the total, and a mark shows where the limit falls.
  const scale = Math.max(limit, used) || 1
  const limitAt = Math.min(100, (limit / scale) * 100)
  const usedText = labels.valueText(fmt(used), fmt(limit))
  const [beforeUsed = '', afterUsed = ''] = labels.amount(SLOT, fmt(limit)).split(SLOT)

  return (
    <div
      data-slot="usage-meter"
      data-state={state}
      className={cn('grid w-full min-w-0 gap-3', className)}
      {...props}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div id={labelId} className="font-medium text-sm">
          {label}
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          {state === 'warning' && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
              <TriangleAlertIcon aria-hidden className="size-3.5" />
              {warningLabel ?? labels.warning}
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
            </span>
          )}
          {state === 'over' && (
            <span className="inline-flex items-center gap-1 font-medium text-destructive">
              <CircleAlertIcon aria-hidden className="size-3.5" />
              {(overLabel ?? labels.over)(fmt(used - limit))}
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
            </span>
          )}
          <span className="text-muted-foreground tabular-nums">
            {beforeUsed}
            <span className="font-medium text-foreground">{fmt(used)}</span>
            {afterUsed}
          </span>
        </div>
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: a native meter draws its own bar and cannot hold this one */}
      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={
          state === 'over'
            ? `${usedText}, ${labels.overLimit(fmt(used - limit))}`
            : state === 'warning'
              ? `${usedText}, ${labels.almostFull}`
              : usedText
        }
        data-slot="usage-meter-bar"
        className="relative h-2.5 w-full rounded-full bg-muted"
      >
        {/* Each segment leaves two pixels of track before the next, so neighbours read apart. */}
        <div className="flex size-full gap-0.5 overflow-hidden rounded-full">
          {segments.map((segment, i) => {
            const width = mounted ? (Math.max(0, segment.value) / scale) * 100 : 0
            return (
              <div
                key={segment.key}
                data-slot="usage-meter-segment"
                title={`${segment.label}: ${fmt(segment.value)}`}
                className="h-full shrink-0 transition-[width] duration-(--duration-slower,500ms) ease-(--easing-emphasized,cubic-bezier(0.16,1,0.3,1)) motion-reduce:transition-none"
                style={{
                  width: `calc(${width}% - ${i < segments.length - 1 ? 2 : 0}px)`,
                  background: segment.color ?? segmentColor(i),
                  display: segment.value > 0 ? undefined : 'none',
                }}
              />
            )
          })}
        </div>
        {state === 'over' && (
          <div
            aria-hidden
            data-slot="usage-meter-limit"
            className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground"
            style={{ left: `calc(${limitAt}% - 1px)` }}
          />
        )}
      </div>

      {showLegend && (
        <ul
          data-slot="usage-meter-legend"
          className="flex flex-wrap gap-x-4 gap-y-1.5 text-muted-foreground text-xs"
        >
          {segments.map((segment, i) => (
            <li key={segment.key} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: segment.color ?? segmentColor(i) }}
              />
              {segment.label}
              <span className="font-medium text-foreground tabular-nums">{fmt(segment.value)}</span>
            </li>
          ))}
          {state !== 'over' && (
            <li className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[3px] bg-muted ring-1 ring-border ring-inset"
              />
              {labels.free}
              <span className="font-medium text-foreground tabular-nums">
                {fmt(Math.max(0, limit - used))}
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export { UsageMeter }
