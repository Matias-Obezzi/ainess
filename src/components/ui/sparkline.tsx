import * as React from 'react'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useLabels, useLocale } from '@/lib/labels'
import { cn } from '@/lib/utils'

/**
 * Set through a `LabelsProvider` under `sparkline`. The `labels` prop of this component names
 * the points, so it keeps that meaning; `aria-label` replaces the whole summary.
 */
export interface SparklineLabels {
  /** The summary screen readers get. The values come formatted. */
  summary: (trend: {
    count: number
    first?: string
    last?: string
    low: string
    high: string
  }) => string
  /** The summary when there are no values. */
  empty: string
}

export const defaultSparklineLabels: SparklineLabels = {
  summary: ({ count, first, last, low, high }) =>
    `Trend of ${count} values${first !== undefined && last !== undefined ? `, from ${first} to ${last}` : ''}, low ${low}, high ${high}`,
  empty: 'No data',
}

export type SparklineMarker = 'first' | 'last' | 'min' | 'max'

export interface SparklineProps extends Omit<React.ComponentProps<'span'>, 'children' | 'color'> {
  /** The values, oldest first. `null` leaves a gap in a line and an empty slot in bars. */
  data: ReadonlyArray<number | null>
  /** `line`, `area` (a line over a light wash) or `bar`. Default `line`. */
  variant?: 'line' | 'area' | 'bar'
  /** Any CSS color. Default `var(--chart-1)`. */
  color?: string
  /** Width in pixels. Leave it out to fill the width of the container. */
  width?: number
  /** Height in pixels. Default 32. */
  height?: number
  /** Points that get a dot. The last is drawn in the series color, min and max in muted ink. Default `['last']`. Ignored by bars. */
  markers?: SparklineMarker[]
  /** Lowest value of the scale. Defaults to the lowest value, or 0 for bars. */
  min?: number
  /** Highest value of the scale. Defaults to the highest value. */
  max?: number
  /** Show the value under the pointer, or under the arrow keys once focused. Default false. */
  tooltip?: boolean
  /** A name per point for the tooltip and the summary, like the date of each value. */
  labels?: ReadonlyArray<string>
  /** Formats values in the tooltip and the summary. Defaults to the locale's number format. */
  format?: (value: number) => string
  /** Locale of the default format. Defaults to the browser's. */
  locale?: string
  /** Draw the line or grow the bars on mount. Default true; off with reduced motion. */
  animate?: boolean
}

// Room around the plot so dots and their ring are not clipped at the edges.
const PAD = 4

/** The x and y of every value, with `null` kept where a value is missing. */
function layout(
  data: ReadonlyArray<number | null>,
  width: number,
  height: number,
  lo: number,
  hi: number,
  bars: boolean,
) {
  const n = data.length
  const span = hi - lo || 1
  const y = (v: number) =>
    hi === lo ? height / 2 : PAD + (1 - (v - lo) / span) * (height - PAD * 2)
  if (bars) {
    const slot = width / Math.max(1, n)
    return { y, x: (i: number) => slot * i + slot / 2, slot }
  }
  const step = n > 1 ? (width - PAD * 2) / (n - 1) : 0
  return { y, x: (i: number) => (n > 1 ? PAD + step * i : width / 2), slot: step }
}

/** Runs of consecutive values, so a missing value breaks the line instead of bridging it. */
function runs(data: ReadonlyArray<number | null>) {
  const out: number[][] = []
  let current: number[] = []
  data.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (current.length) out.push(current)
      current = []
    } else current.push(i)
  })
  if (current.length) out.push(current)
  return out
}

/**
 * A word sized trend: a line, an area or bars in a small inline SVG, with dots on the last, lowest
 * and highest values. Screen readers get a one line summary; the tooltip is optional.
 */
function Sparkline({
  data,
  variant = 'line',
  color = 'var(--chart-1)',
  width,
  height = 32,
  markers = ['last'],
  min,
  max,
  tooltip = false,
  labels,
  format,
  locale: localeProp,
  animate = true,
  className,
  style,
  'aria-label': ariaLabel,
  ...props
}: SparklineProps) {
  const words = useLabels('sparkline', defaultSparklineLabels)
  const locale = useLocale(localeProp)
  const rootRef = React.useRef<HTMLSpanElement>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)
  const reduced = useReducedMotion()
  const [measured, setMeasured] = React.useState(120)
  const [active, setActive] = React.useState<number | null>(null)
  const w = width ?? measured
  const bars = variant === 'bar'

  React.useLayoutEffect(() => {
    if (width !== undefined) return
    const el = rootRef.current
    if (!el) return
    const read = () => {
      const next = el.getBoundingClientRect().width
      if (next > 0) setMeasured(next)
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [width])

  const numberFormat = React.useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  )
  const fmt = format ?? ((v: number) => numberFormat.format(v))

  const points = data
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v))
  const values = points.map((p) => p.v)
  const dataMin = values.length ? Math.min(...values) : 0
  const dataMax = values.length ? Math.max(...values) : 1
  // A bar's length is its value, so bars keep zero in the scale.
  const lo = min ?? (bars ? Math.min(0, dataMin) : dataMin)
  const hi = max ?? (bars ? Math.max(0, dataMax) : dataMax)
  const geo = layout(data, w, height, lo, hi, bars)

  const lines = runs(data).map((run) =>
    run
      .map(
        (i, k) => `${k ? 'L' : 'M'}${geo.x(i).toFixed(2)},${geo.y(data[i] as number).toFixed(2)}`,
      )
      .join(''),
  )
  const base = geo.y(Math.min(Math.max(0, lo), hi))
  const areas = runs(data).map((run) => {
    const first = run[0] ?? 0
    const last = run[run.length - 1] ?? 0
    const top = run
      .map(
        (i, k) => `${k ? 'L' : 'M'}${geo.x(i).toFixed(2)},${geo.y(data[i] as number).toFixed(2)}`,
      )
      .join('')
    const bottom = `L${geo.x(last).toFixed(2)},${height}L${geo.x(first).toFixed(2)},${height}Z`
    return top + bottom
  })

  const lastPoint = points[points.length - 1]
  const firstPoint = points[0]
  const minPoint = points.reduce<(typeof points)[number] | undefined>(
    (a, p) => (!a || p.v < a.v ? p : a),
    undefined,
  )
  const maxPoint = points.reduce<(typeof points)[number] | undefined>(
    (a, p) => (!a || p.v > a.v ? p : a),
    undefined,
  )
  const dots = bars
    ? []
    : [
        markers.includes('min') && minPoint && { ...minPoint, tone: 'muted' as const },
        markers.includes('max') && maxPoint && { ...maxPoint, tone: 'muted' as const },
        markers.includes('first') && firstPoint && { ...firstPoint, tone: 'muted' as const },
        markers.includes('last') && lastPoint && { ...lastPoint, tone: 'series' as const },
      ].filter((d): d is { v: number; i: number; tone: 'muted' | 'series' } => Boolean(d))

  const name = (i: number) => labels?.[i]
  const summary =
    ariaLabel ??
    (points.length
      ? words.summary({
          count: points.length,
          first: firstPoint && lastPoint ? fmt(firstPoint.v) : undefined,
          last: firstPoint && lastPoint ? fmt(lastPoint.v) : undefined,
          low: fmt(dataMin),
          high: fmt(dataMax),
        })
      : words.empty)

  // Draw-in on mount only: later updates swap in place, which reads as a live value changing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on mount only, see above
  React.useEffect(() => {
    const svg = svgRef.current
    if (!svg || !animate || reduced || typeof svg.animate !== 'function') return
    const easing = 'cubic-bezier(0.16, 1, 0.3, 1)'
    for (const path of svg.querySelectorAll<SVGPathElement>('[data-sparkline="line"]')) {
      path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, easing })
    }
    for (const el of svg.querySelectorAll<SVGElement>(
      '[data-sparkline="area"], [data-sparkline="dot"]',
    )) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 500,
        delay: 300,
        easing,
        fill: 'backwards',
      })
    }
    svg.querySelectorAll<SVGRectElement>('[data-sparkline="bar"]').forEach((bar, i) => {
      bar.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
        duration: 500,
        delay: Math.min(i * 15, 300),
        easing,
        fill: 'backwards',
      })
    })
  }, [])

  const nearest = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || !points.length) return null
    const x = ((clientX - rect.left) / (rect.width || w)) * w
    let best = points[0]?.i ?? 0
    let dist = Number.POSITIVE_INFINITY
    for (const p of points) {
      const d = Math.abs(geo.x(p.i) - x)
      if (d < dist) {
        dist = d
        best = p.i
      }
    }
    return best
  }

  const step = (from: number | null, by: number) => {
    if (!points.length) return null
    const at = from === null ? points.length - 1 : points.findIndex((p) => p.i === from)
    const next = Math.min(points.length - 1, Math.max(0, at + by))
    return points[next]?.i ?? null
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, () => number | null> = {
      ArrowLeft: () => step(active, -1),
      ArrowRight: () => step(active, 1),
      Home: () => points[0]?.i ?? null,
      End: () => points[points.length - 1]?.i ?? null,
    }
    const go = keys[e.key]
    if (!go) return
    e.preventDefault()
    setActive(go())
  }

  const activeValue = active === null ? null : data[active]
  const activeX = active === null ? 0 : geo.x(active)
  const barWidth = Math.max(1, geo.slot - Math.min(2, geo.slot * 0.25))
  const surface = 'var(--chart-surface, var(--background))'

  return (
    <span
      ref={rootRef}
      data-slot="sparkline"
      className={cn(
        'relative align-middle',
        width === undefined ? 'block w-full min-w-0' : 'inline-block',
        className,
      )}
      style={{ width, height, ...style }}
      {...props}
    >
      <svg
        ref={svgRef}
        role="img"
        aria-label={summary}
        // Filling the container, the SVG takes the box's width instead of setting it, so a
        // flex or grid parent can still shrink it; the next measure redraws to fit.
        width={width === undefined ? '100%' : w}
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        tabIndex={tooltip ? 0 : undefined}
        className={cn(
          'block overflow-visible',
          tooltip && 'rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
        onPointerMove={tooltip ? (e) => setActive(nearest(e.clientX)) : undefined}
        onPointerLeave={tooltip ? () => setActive(null) : undefined}
        onFocus={tooltip ? () => setActive(points[points.length - 1]?.i ?? null) : undefined}
        onBlur={tooltip ? () => setActive(null) : undefined}
        onKeyDown={tooltip ? onKeyDown : undefined}
      >
        {bars ? (
          data.map((v, i) => {
            if (v === null || !Number.isFinite(v)) return null
            const top = Math.min(geo.y(v), base)
            const h = Math.max(1, Math.abs(geo.y(v) - base))
            const isLast = i === lastPoint?.i
            return (
              <rect
                // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional
                key={i}
                data-sparkline="bar"
                x={geo.x(i) - barWidth / 2}
                y={top}
                width={barWidth}
                height={h}
                rx={Math.min(2, barWidth / 2)}
                fill={color}
                style={{ transformBox: 'fill-box', transformOrigin: v >= 0 ? 'bottom' : 'top' }}
                opacity={active === null ? (isLast ? 1 : 0.45) : active === i ? 1 : 0.3}
              />
            )
          })
        ) : (
          <>
            {variant === 'area' &&
              areas.map((d) => (
                <path
                  key={`a${d}`}
                  data-sparkline="area"
                  d={d}
                  fill={color}
                  fillOpacity={0.12}
                  stroke="none"
                />
              ))}
            {lines.map((d) => (
              <path
                key={`l${d}`}
                data-sparkline="line"
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray="1 1"
              />
            ))}
            {active !== null && activeValue != null && (
              <line
                x1={activeX}
                x2={activeX}
                y1={0}
                y2={height}
                stroke="currentColor"
                strokeOpacity={0.25}
                strokeWidth={1}
                className="text-muted-foreground"
              />
            )}
            {dots.map((d) => (
              <circle
                key={`${d.tone}${d.i}`}
                data-sparkline="dot"
                cx={geo.x(d.i)}
                cy={geo.y(d.v)}
                r={d.tone === 'series' ? 2.75 : 2.5}
                fill={d.tone === 'series' ? color : 'var(--muted-foreground)'}
                stroke={surface}
                strokeWidth={1.5}
              />
            ))}
            {active !== null && activeValue != null && (
              <circle
                cx={activeX}
                cy={geo.y(activeValue)}
                r={3}
                fill={color}
                stroke={surface}
                strokeWidth={2}
              />
            )}
          </>
        )}
      </svg>
      {tooltip && active !== null && activeValue != null && (
        <span
          data-slot="sparkline-tooltip"
          role="status"
          className="pointer-events-none absolute bottom-full z-(--z-tooltip,80) mb-1.5 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md"
          style={{
            left: activeX,
            transform:
              activeX < 40
                ? 'translateX(-8px)'
                : activeX > w - 40
                  ? 'translateX(calc(-100% + 8px))'
                  : 'translateX(-50%)',
          }}
        >
          <span className="font-semibold tabular-nums">{fmt(activeValue)}</span>
          {name(active) && <span className="ml-1.5 text-muted-foreground">{name(active)}</span>}
        </span>
      )}
    </span>
  )
}

export { Sparkline }
