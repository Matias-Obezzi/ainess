'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'

export interface ContextSource {
  /** What takes the room: the system prompt, files, the conversation, tool results. */
  label: string
  tokens: number
  /** Any CSS color. Defaults run through the chart colors. */
  color?: string
}

export interface ContextMeterLabels {
  /** The ring, read out with how full it is. */
  trigger: (percent: number) => string
  title: string
  /** Under the title: used of the limit. */
  usage: (used: string, limit: string) => string
  compact: string
  /** Shown once it passes `warnAt`. */
  nearlyFull: string
}

export const defaultContextMeterLabels: ContextMeterLabels = {
  trigger: (percent) => `Context window ${percent}% full`,
  title: 'Context window',
  usage: (used, limit) => `${used} of ${limit} tokens`,
  compact: 'Compact',
  nearlyFull: 'Nearly full. Compacting summarizes older turns to make room.',
}

const palette = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

export interface ContextMeterProps extends Omit<React.ComponentProps<'button'>, 'children'> {
  /** What each part of the context takes. Their sum is how full it is. */
  sources: ContextSource[]
  /** The model's context window, in tokens. */
  limit: number
  /** Share of the limit from which the ring turns to a warning and offers to compact. Default 0.8. */
  warnAt?: number
  /** Offers a Compact button in the breakdown. */
  onCompact?: () => void
  locale?: string
  labels?: Partial<ContextMeterLabels>
}

/**
 * How full a model's context window is, as a small ring for a prompt's footer. It opens a
 * breakdown by source, and past `warnAt` turns to a warning and offers to compact.
 */
function ContextMeter({
  sources,
  limit,
  warnAt = 0.8,
  onCompact,
  locale,
  labels: labelsProp,
  className,
  ...props
}: ContextMeterProps) {
  const labels = useLabels('context-meter', defaultContextMeterLabels, labelsProp)
  const used = sources.reduce((sum, s) => sum + s.tokens, 0)
  const share = limit > 0 ? Math.min(1, used / limit) : 0
  const percent = Math.round(share * 100)
  const warn = share >= warnAt
  const format = React.useMemo(
    () => new Intl.NumberFormat(locale, { notation: 'compact' }),
    [locale],
  )
  // The ring: r 7 on a 20px box.
  const length = 2 * Math.PI * 7

  return (
    <Popover>
      <PopoverTrigger
        data-slot="context-meter"
        data-warn={warn || undefined}
        aria-label={labels.trigger(percent)}
        className={cn(
          'relative flex size-8 items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5',
          className,
        )}
        {...props}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 -rotate-90">
          <circle cx="10" cy="10" r="7" fill="none" strokeWidth="2.5" className="stroke-muted" />
          <circle
            cx="10"
            cy="10"
            r="7"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - share)}
            className={cn(
              'transition-[stroke-dashoffset] duration-(--duration-slow,300ms) motion-reduce:transition-none',
              warn ? 'stroke-amber-500' : 'stroke-foreground/70',
            )}
          />
        </svg>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-medium text-sm">{labels.title}</p>
          <p
            className={cn(
              'font-medium text-sm tabular-nums',
              warn && 'text-amber-600 dark:text-amber-400',
            )}
          >
            {percent}%
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          {labels.usage(format.format(used), format.format(limit))}
        </p>
        {/* One bar split by source, then the sources one by one. */}
        <div aria-hidden="true" className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
          {sources.map((s, i) => (
            <span
              key={s.label}
              style={{
                width: `${(s.tokens / limit) * 100}%`,
                background: s.color ?? palette[i % palette.length],
              }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm">
          {sources.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: s.color ?? palette[i % palette.length] }}
              />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="text-muted-foreground tabular-nums">{format.format(s.tokens)}</span>
            </li>
          ))}
        </ul>
        {warn && (
          <div className="mt-3 flex flex-col gap-2 border-t pt-3">
            <p className="text-muted-foreground text-xs">{labels.nearlyFull}</p>
            {onCompact && (
              <Button size="sm" variant="outline" onClick={onCompact}>
                {labels.compact}
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export { ContextMeter }
