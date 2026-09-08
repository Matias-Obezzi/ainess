'use client'

import * as React from 'react'
import { useInView } from '@/hooks/use-in-view'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

export interface NumberTickerProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  /** The number to land on. */
  value: number
  /** Where the count starts. Default 0. */
  from?: number
  /** Milliseconds for the whole count. Default 1500. */
  duration?: number
  /** Milliseconds before it starts. Default 0. */
  delay?: number
  /** Digits after the decimal point. Default 0. */
  decimals?: number
  /** Formatting locale, defaults to the browser's. */
  locale?: string
  /** Extra Intl.NumberFormat options, for currency or units. */
  format?: Intl.NumberFormatOptions
  /** Wait for the element to scroll into view. Default true. */
  whenVisible?: boolean
}

const easeOut = (t: number) => 1 - (1 - t) ** 3

/**
 * A number that counts up, or down, to its value when it scrolls into view.
 * Renders the final value for screen readers and with reduced motion.
 */
function NumberTicker({
  value,
  from = 0,
  duration = 1500,
  delay = 0,
  decimals = 0,
  locale,
  format,
  whenVisible = true,
  className,
  ...props
}: NumberTickerProps) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref)
  const reduced = useReducedMotion()
  const play = !whenVisible || inView
  const [current, setCurrent] = React.useState(from)

  React.useEffect(() => {
    if (!play) return
    if (reduced) {
      setCurrent(value)
      return
    }
    let frame = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const t = Math.min((now - start) / duration, 1)
      setCurrent(from + (value - from) * easeOut(t))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(tick)
    }, delay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [play, reduced, value, from, duration, delay])

  const formatter = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        ...format,
      }),
    [locale, decimals, format],
  )

  return (
    <span
      ref={ref}
      data-slot="number-ticker"
      className={cn('inline-block tabular-nums', className)}
      {...props}
    >
      <span className="sr-only">{formatter.format(value)}</span>
      <span aria-hidden>{formatter.format(current)}</span>
    </span>
  )
}

export { NumberTicker }
