import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

const holdVariants = cva(
  'relative isolate inline-flex shrink-0 touch-manipulation select-none items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border font-medium text-sm outline-none transition-[scale,box-shadow] duration-(--duration-fast,150ms) [-webkit-touch-callout:none] focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 data-[state=holding]:scale-[0.98] motion-reduce:data-[state=holding]:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        destructive:
          'border-destructive/40 bg-destructive/10 text-destructive focus-visible:ring-destructive/30 dark:bg-destructive/15',
        default: 'border-input bg-background text-foreground shadow-xs focus-visible:ring-ring/50',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        default: 'h-9 px-4',
        lg: 'h-10 px-6',
      },
    },
    defaultVariants: { variant: 'destructive', size: 'default' },
  },
)

const fillVariants = {
  destructive: 'bg-destructive text-white',
  default: 'bg-primary text-primary-foreground',
}

type HoldState = 'idle' | 'holding' | 'pending' | 'confirmed'

export interface HoldToConfirmLabels {
  /** How to use it, read by screen readers. */
  hint: string
  /** Announced once the hold completes, when there is no `confirmedLabel`. */
  confirmed: string
}

export const defaultHoldToConfirmLabels: HoldToConfirmLabels = {
  hint: 'Press and hold to confirm.',
  confirmed: 'Confirmed',
}

export interface HoldToConfirmProps
  extends Omit<React.ComponentProps<'button'>, 'onClick'>,
    VariantProps<typeof holdVariants> {
  /** Runs once the hold completes. Return a promise to show a spinner until it settles. */
  onConfirm: () => unknown
  /** Milliseconds the button has to be held. Default 1200. */
  duration?: number
  /** Shown in place of the label once confirmed, and announced. */
  confirmedLabel?: React.ReactNode
  /** Milliseconds before a confirmed button resets, or `false` to stay confirmed. Default 2000. */
  resetAfter?: number | false
  /** How to use it, read by screen readers. Default "Press and hold to confirm." */
  hint?: string
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<HoldToConfirmLabels>
}

/**
 * A button that only acts once it has been held down, for actions a stray click should never
 * trigger. A fill sweeps across while held; letting go early rewinds it. Space and Enter hold
 * it from the keyboard.
 */
function HoldToConfirm({
  onConfirm,
  duration = 1200,
  confirmedLabel,
  resetAfter = 2000,
  hint: hintProp,
  labels: labelsProp,
  variant = 'destructive',
  size,
  disabled,
  className,
  children,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  onBlur,
  onContextMenu,
  ...props
}: HoldToConfirmProps) {
  const reduced = useReducedMotion()
  const [state, setState] = React.useState<HoldState>('idle')
  const stateRef = React.useRef<HoldState>('idle')
  const fill = React.useRef<HTMLSpanElement>(null)
  const progress = React.useRef(0)
  const frame = React.useRef(0)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const labels = useLabels('hold-to-confirm', defaultHoldToConfirmLabels, labelsProp)
  const hint = hintProp ?? labels.hint
  const hintId = React.useId()

  const go = React.useCallback((next: HoldState) => {
    stateRef.current = next
    setState(next)
  }, [])

  // Progress is drawn straight onto the fill, frame by frame, rather than through a CSS
  // transition: it keeps showing under reduced motion, where transitions are switched off.
  const draw = React.useCallback((p: number) => {
    progress.current = p
    if (fill.current) fill.current.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`
  }, [])

  React.useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      clearTimeout(timer.current)
    },
    [],
  )

  const rewind = React.useCallback(() => {
    cancelAnimationFrame(frame.current)
    const from = progress.current
    if (reduced || from === 0) return draw(0)
    // Faster back than forwards, so letting go feels like letting go.
    const length = Math.max(120, from * duration * 0.35)
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / length)
      draw(from * (1 - t) ** 2)
      if (t < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }, [draw, duration, reduced])

  const complete = React.useCallback(async () => {
    draw(1)
    try {
      const result = onConfirm()
      if (result instanceof Promise) {
        go('pending')
        await result
      }
    } catch {
      // A failed action leaves nothing confirmed: rewind so it can be held again.
      go('idle')
      rewind()
      return
    }
    go('confirmed')
    if (resetAfter === false) return
    timer.current = setTimeout(() => {
      go('idle')
      rewind()
    }, resetAfter)
  }, [draw, go, onConfirm, resetAfter, rewind])

  const start = () => {
    if (disabled || stateRef.current !== 'idle') return
    go('holding')
    cancelAnimationFrame(frame.current)
    // Pick up from wherever a rewind got to, so a quick re-press does not start over.
    const begin = performance.now() - progress.current * duration
    const step = (now: number) => {
      const p = Math.min(1, (now - begin) / duration)
      draw(p)
      if (p < 1) frame.current = requestAnimationFrame(step)
      else void complete()
    }
    frame.current = requestAnimationFrame(step)
  }

  const cancel = () => {
    if (stateRef.current !== 'holding') return
    go('idle')
    rewind()
  }

  const isHoldKey = (e: React.KeyboardEvent) => e.key === ' ' || e.key === 'Enter'

  return (
    <>
      <button
        type="button"
        data-slot="hold-to-confirm"
        data-state={state}
        aria-describedby={hintId}
        aria-busy={state === 'pending' || undefined}
        disabled={disabled}
        className={cn(holdVariants({ variant, size }), className)}
        onPointerDown={(e) => {
          onPointerDown?.(e)
          if (e.button === 0) start()
        }}
        onPointerUp={(e) => {
          onPointerUp?.(e)
          cancel()
        }}
        onPointerLeave={(e) => {
          onPointerLeave?.(e)
          cancel()
        }}
        onPointerCancel={(e) => {
          onPointerCancel?.(e)
          cancel()
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (!isHoldKey(e)) return
          // The browser would turn these keys into a click; the hold is the only way to act.
          e.preventDefault()
          if (!e.repeat) start()
        }}
        onKeyUp={(e) => {
          onKeyUp?.(e)
          if (!isHoldKey(e)) return
          e.preventDefault()
          cancel()
        }}
        onBlur={(e) => {
          onBlur?.(e)
          cancel()
        }}
        onContextMenu={(e) => {
          onContextMenu?.(e)
          // A long press on touch screens opens the context menu otherwise.
          if (stateRef.current !== 'idle') e.preventDefault()
        }}
        {...props}
      >
        <span className="inline-flex items-center gap-[inherit]">{children}</span>
        <span
          ref={fill}
          aria-hidden="true"
          data-slot="hold-to-confirm-fill"
          className={cn(
            'pointer-events-none absolute inset-0 flex items-center justify-center gap-[inherit] [clip-path:inset(0_100%_0_0)]',
            fillVariants[variant ?? 'destructive'],
          )}
        >
          {state === 'pending' ? (
            <Spinner aria-hidden="true" />
          ) : state === 'confirmed' && confirmedLabel ? (
            confirmedLabel
          ) : (
            children
          )}
        </span>
      </button>
      {/* Outside the button, so neither joins its accessible name. */}
      <span id={hintId} className="sr-only">
        {hint}
      </span>
      <span role="status" className="sr-only">
        {state === 'confirmed' ? (confirmedLabel ?? labels.confirmed) : ''}
      </span>
    </>
  )
}

export { HoldToConfirm, holdVariants }
