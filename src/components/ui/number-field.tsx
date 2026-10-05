'use client'

import { MinusIcon, PlusIcon } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface NumberFieldProps
  extends Omit<
    React.ComponentProps<'input'>,
    'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step' | 'size'
  > {
  /** Controlled value. `null` means empty. */
  value?: number | null
  /** Starting value when uncontrolled. */
  defaultValue?: number | null
  /** Called with the new number, or `null` when the field is cleared. */
  onValueChange?: (value: number | null) => void
  /** Smallest allowed value. Home jumps to it. */
  min?: number
  /** Largest allowed value. End jumps to it. */
  max?: number
  /** How much the buttons and arrow keys add or take away. Default 1. */
  step?: number
  /** How much PageUp and PageDown move. Default ten steps. */
  largeStep?: number
  /** How the number is shown: percent, currency, units, fraction digits. */
  formatOptions?: Intl.NumberFormatOptions
  /** Locale for formatting and parsing. Defaults to the browser's. */
  locale?: string
  /** Step with the mouse wheel while the field has focus. Off by default so scrolling the page never changes a value. */
  allowWheel?: boolean
  /** Accessible name of the minus button. Default "Decrease". */
  decrementLabel?: string
  /** Accessible name of the plus button. Default "Increase". */
  incrementLabel?: string
  /** Classes for the input itself. `className` goes on the outer box. */
  inputClassName?: string
}

/** Delay before a held button starts repeating, then the pace of the repeat. */
const REPEAT_DELAY = 400
const REPEAT_INTERVAL = 60

function decimalsOf(n: number) {
  if (!Number.isFinite(n)) return 0
  const [, fraction = ''] = String(n).split('.')
  const exp = /e-(\d+)/.exec(String(n))
  return Math.max(fraction.length, exp ? Number(exp[1]) : 0)
}

function clamp(n: number, min?: number, max?: number) {
  if (min !== undefined && n < min) return min
  if (max !== undefined && n > max) return max
  return n
}

/**
 * Reads back what the formatter wrote, and what people type by hand: "1,234.5", "$12",
 * "45%", "12 km". Only digits, the locale's decimal mark and a minus sign carry meaning.
 */
function createParser(formatter: Intl.NumberFormat, percent: boolean) {
  const parts = formatter.formatToParts(-12345.6)
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.'
  const group = parts.find((p) => p.type === 'group')?.value ?? ','
  return (text: string): number | null => {
    const trimmed = text.trim()
    if (!trimmed) return null
    let digits = ''
    for (const ch of trimmed) {
      if (ch >= '0' && ch <= '9') digits += ch
      // Accept a dot as the decimal mark too, unless this locale groups thousands with it.
      else if (ch === decimal || (ch === '.' && group !== '.')) {
        if (!digits.includes('.')) digits += '.'
      }
    }
    if (!digits || digits === '.') return null
    const negative = /^[-−]|[-−]$|^\(.*\)$/.test(trimmed)
    let n = Number.parseFloat(digits)
    if (Number.isNaN(n)) return null
    if (negative) n = -n
    if (percent) n /= 100
    return Number.parseFloat(n.toPrecision(15))
  }
}

/**
 * A number entry with minus and plus buttons. Arrow keys step, PageUp and PageDown take big
 * steps, Home and End jump to the bounds, and holding a button keeps stepping. What is typed
 * is read back on blur or Enter and kept inside `min` and `max`.
 */
function NumberField({
  value: valueProp,
  defaultValue = null,
  onValueChange,
  min,
  max,
  step = 1,
  largeStep,
  formatOptions,
  locale,
  allowWheel = false,
  decrementLabel = 'Decrease',
  incrementLabel = 'Increase',
  className,
  inputClassName,
  id,
  name,
  disabled,
  readOnly,
  ref,
  onKeyDown,
  onBlur,
  onFocus,
  ...props
}: NumberFieldProps) {
  const [uncontrolled, setUncontrolled] = React.useState<number | null>(defaultValue)
  const controlled = valueProp !== undefined
  const value = controlled ? valueProp : uncontrolled
  // What is being typed, before it is read back. `null` shows the formatted value.
  const [draft, setDraft] = React.useState<string | null>(null)

  const optionsKey = JSON.stringify(formatOptions ?? {})
  // biome-ignore lint/correctness/useExhaustiveDependencies: optionsKey stands in for the object
  const formatter = React.useMemo(
    () => new Intl.NumberFormat(locale, formatOptions),
    [locale, optionsKey],
  )
  const parse = React.useMemo(
    () => createParser(formatter, formatOptions?.style === 'percent'),
    [formatter, formatOptions?.style],
  )
  const format = React.useCallback(
    (n: number | null) => (n === null ? '' : formatter.format(n)),
    [formatter],
  )

  const autoId = React.useId()
  const inputId = id ?? autoId
  const inputRef = React.useRef<HTMLInputElement>(null)
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

  // The repeat timer reads these, so it always steps from the latest value.
  const latest = React.useRef({ value, draft })
  latest.current = { value, draft }

  const commit = (next: number | null) => {
    const clamped = next === null ? null : clamp(next, min, max)
    latest.current = { value: clamped, draft: null }
    setDraft(null)
    if (!controlled) setUncontrolled(clamped)
    if (clamped !== value) onValueChange?.(clamped)
  }

  const current = () => {
    const { value, draft } = latest.current
    return draft === null ? value : (parse(draft) ?? value)
  }

  /** Move by `delta` steps, landing on the step grid. Returns false at a bound. */
  const stepBy = (delta: number) => {
    const base = current()
    const origin = min ?? 0
    let next: number
    if (base === null) {
      next = clamp(min !== undefined && min > 0 ? min : 0, min, max)
    } else {
      let q = (base - origin) / step
      if (Math.abs(q - Math.round(q)) < 1e-9) q = Math.round(q)
      // Off the grid, a step lands on the nearest line in that direction rather than skipping it.
      const moved = (delta > 0 ? Math.floor(q) : Math.ceil(q)) + delta
      const precision = Math.max(decimalsOf(step), decimalsOf(origin))
      next = clamp(Number((origin + moved * step).toFixed(precision)), min, max)
    }
    if (next === base) {
      if (latest.current.draft !== null) commit(next)
      return false
    }
    commit(next)
    return true
  }

  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const stopRepeat = React.useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
  }, [])
  React.useEffect(() => stopRepeat, [stopRepeat])

  const startRepeat = (delta: number) => {
    stopRepeat()
    if (!stepBy(delta)) return
    const tick = () => {
      if (stepBy(delta)) timer.current = setTimeout(tick, REPEAT_INTERVAL)
      else stopRepeat()
    }
    timer.current = setTimeout(tick, REPEAT_DELAY)
  }

  // React attaches wheel listeners as passive, and a passive one cannot stop the page scrolling.
  const stepRef = React.useRef(stepBy)
  stepRef.current = stepBy
  React.useEffect(() => {
    const input = inputRef.current
    if (!allowWheel || !input || disabled || readOnly) return
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== input || e.deltaY === 0) return
      e.preventDefault()
      stepRef.current(e.deltaY < 0 ? 1 : -1)
    }
    input.addEventListener('wheel', onWheel, { passive: false })
    return () => input.removeEventListener('wheel', onWheel)
  }, [allowWheel, disabled, readOnly])

  const interactive = !disabled && !readOnly
  const big = largeStep ?? step * 10

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented || !interactive) return
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        stepBy(1)
        break
      case 'ArrowDown':
        e.preventDefault()
        stepBy(-1)
        break
      case 'PageUp':
        e.preventDefault()
        stepBy(big / step)
        break
      case 'PageDown':
        e.preventDefault()
        stepBy(-big / step)
        break
      case 'Home':
        if (min === undefined) return
        e.preventDefault()
        commit(min)
        break
      case 'End':
        if (max === undefined) return
        e.preventDefault()
        commit(max)
        break
      case 'Enter':
        if (draft !== null) commit(parse(draft))
        break
      case 'Escape':
        if (draft === null) return
        // Only swallow Escape when it undid something, so a dialog around still closes.
        e.preventDefault()
        setDraft(null)
        break
    }
  }

  // A pointer press steps on pointerdown and repeats while held, so the click that follows
  // is ignored. Assistive tech and the keyboard only send a click (detail 0), which steps once.
  const buttonProps = (delta: number) => ({
    type: 'button' as const,
    tabIndex: -1,
    'aria-controls': inputId,
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      // Keeps focus, and the caret, where it was.
      e.preventDefault()
      startRepeat(delta)
    },
    onPointerUp: stopRepeat,
    onPointerLeave: stopRepeat,
    onPointerCancel: stopRepeat,
    // A long press on a phone would otherwise open the context menu mid repeat.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) stepBy(delta)
    },
  })

  const shown = current()
  const atMin = min !== undefined && value !== null && value <= min
  const atMax = max !== undefined && value !== null && value >= max
  const integer = Number.isInteger(step) && (formatOptions?.maximumFractionDigits ?? 0) === 0
  const negativeAllowed = min === undefined || min < 0
  const inputMode = negativeAllowed ? 'text' : integer ? 'numeric' : 'decimal'

  return (
    <div
      data-slot="number-field"
      data-disabled={disabled ? '' : undefined}
      className={cn(
        'flex h-9 w-40 min-w-0 items-stretch overflow-hidden rounded-lg border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30',
        'has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50',
        'has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-destructive/20 dark:has-[input[aria-invalid=true]]:ring-destructive/40',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
    >
      <button
        {...buttonProps(-1)}
        data-slot="number-field-decrement"
        aria-label={decrementLabel}
        disabled={!interactive || atMin}
        className={cn(stepperClass, 'border-input border-r')}
      >
        <MinusIcon aria-hidden />
      </button>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="spinbutton"
        inputMode={inputMode}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-slot="number-field-input"
        aria-valuenow={shown ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={shown === null ? undefined : format(shown)}
        disabled={disabled}
        readOnly={readOnly}
        value={draft ?? format(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={onFocus}
        onBlur={(e) => {
          onBlur?.(e)
          stopRepeat()
          if (draft !== null) commit(parse(draft))
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full min-w-0 flex-1 bg-transparent px-2 text-center text-base tabular-nums outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm',
          inputClassName,
        )}
        {...props}
      />
      <button
        {...buttonProps(1)}
        data-slot="number-field-increment"
        aria-label={incrementLabel}
        disabled={!interactive || atMax}
        className={cn(stepperClass, 'border-input border-l')}
      >
        <PlusIcon aria-hidden />
      </button>
      {name && (
        // What is typed counts straight away, so pressing Enter submits the number on screen.
        <input
          type="hidden"
          name={name}
          value={shown === null ? '' : String(clamp(shown, min, max))}
        />
      )}
    </div>
  )
}

const stepperClass =
  'flex w-9 shrink-0 select-none items-center justify-center text-muted-foreground touch-manipulation outline-none transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:transition-transform [&_svg]:duration-(--duration-instant,100ms) active:[&_svg]:scale-85 motion-reduce:[&_svg]:transition-none'

export { NumberField }
