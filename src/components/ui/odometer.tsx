'use client'

import * as React from 'react'
import { useLocale } from '@/lib/labels'
import { cn } from '@/lib/utils'

export interface OdometerProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  /** The number to show. Every change rolls the digits to it. */
  value: number
  /** Digits after the decimal point. Default 0. */
  decimals?: number
  /** Formatting locale, defaults to the browser's. */
  locale?: string
  /** Extra Intl.NumberFormat options, for currency, percent or compact notation. */
  format?: Intl.NumberFormatOptions
  /** Milliseconds a digit takes to roll. Default 900. */
  duration?: number
  /** Milliseconds between neighbouring digits, starting from the right. Default 60. */
  stagger?: number
}

interface Cell {
  key: string
  char: string
  /** Position among the digits counted from the right, for the stagger. Only on digits. */
  order?: number
}

/**
 * Split the formatted number into cells keyed by their place, not their index: the units
 * stay the units when the number grows a digit, so only the new column appears.
 */
function cellsFor(parts: Intl.NumberFormatPart[]): Cell[] {
  const integerDigits = parts
    .filter((p) => p.type === 'integer')
    .reduce((n, p) => n + p.value.length, 0)
  let integer = integerDigits
  let fraction = 0
  let other = 0
  const cells: Cell[] = []
  for (const part of parts) {
    for (const char of part.value) {
      if (part.type === 'integer') {
        integer--
        cells.push({ key: `i${integer}`, char })
      } else if (part.type === 'fraction') {
        cells.push({ key: `f${fraction++}`, char })
      } else if (part.type === 'group') {
        cells.push({ key: `g${integer}`, char })
      } else {
        cells.push({ key: `${part.type}${other++}`, char })
      }
    }
  }
  let order = 0
  for (let i = cells.length - 1; i >= 0; i--) {
    const cell = cells[i]
    if (cell && /\d/.test(cell.char)) cell.order = order++
  }
  return cells
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

function OdometerDigit({
  digit,
  rollIn,
  duration,
  delay,
}: {
  digit: number
  rollIn: boolean
  duration: number
  delay: number
}) {
  // A column that appears after the first render rolls up from zero like the others.
  const [shown, setShown] = React.useState(rollIn ? 0 : digit)

  React.useEffect(() => {
    // One frame at the old position first, or there is nothing to transition from.
    const frame = requestAnimationFrame(() => setShown(digit))
    return () => cancelAnimationFrame(frame)
  }, [digit])

  return (
    // The strip holds all ten digits. The clip path hides them but still lets them count as
    // overflow, so a scrolling parent would scroll to them; clipping the y axis stops that.
    <span
      data-slot="odometer-digit"
      className="relative inline-block overflow-y-clip [clip-path:inset(0_-0.5em)]"
    >
      <span className="invisible">{DIGITS[digit]}</span>
      <span
        data-slot="odometer-strip"
        className="absolute inset-x-0 top-0 flex flex-col items-center transition-transform motion-reduce:transition-none"
        style={{
          transform: `translateY(-${shown * 10}%)`,
          transitionDuration: `${duration}ms`,
          transitionDelay: `${delay}ms`,
          transitionTimingFunction: 'var(--easing-emphasized, cubic-bezier(0.16, 1, 0.3, 1))',
        }}
      >
        {DIGITS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    </span>
  )
}

/**
 * A number whose digits roll to their new value like an odometer. Separators, signs and
 * symbols come from Intl.NumberFormat and stay put; only the digits move. Screen readers get
 * the plain value, and reduced motion swaps it without the roll.
 */
function Odometer({
  value,
  decimals = 0,
  locale: localeProp,
  format,
  duration = 900,
  stagger = 60,
  className,
  ...props
}: OdometerProps) {
  const locale = useLocale(localeProp)
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => setReady(true), [])

  const formatter = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        ...format,
      }),
    [locale, decimals, format],
  )
  const cells = cellsFor(formatter.formatToParts(value))

  return (
    <span data-slot="odometer" className={cn('inline-flex tabular-nums', className)} {...props}>
      <span className="sr-only">{formatter.format(value)}</span>
      <span aria-hidden className="inline-flex">
        {cells.map((cell) =>
          cell.order === undefined ? (
            <span key={cell.key} data-slot="odometer-symbol" className="whitespace-pre">
              {cell.char}
            </span>
          ) : (
            <OdometerDigit
              key={cell.key}
              digit={Number(cell.char)}
              rollIn={ready}
              duration={duration}
              delay={cell.order * stagger}
            />
          ),
        )}
      </span>
    </span>
  )
}

export { Odometer }
