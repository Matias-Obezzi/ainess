'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface HighlightContextValue {
  move: (el: HTMLElement) => void
  clear: () => void
}

const HighlightContext = React.createContext<HighlightContextValue | null>(null)

export interface HoverHighlightProps extends React.ComponentProps<'div'> {
  /** Milliseconds the highlight takes to slide. Default 250. */
  duration?: number
  /** Classes for the sliding highlight. Default a muted rounded block. */
  highlightClassName?: string
  /** Keep the highlight on the last item after the pointer leaves. Default false. */
  sticky?: boolean
}

/**
 * A grid or list where one highlight slides between items as you hover them, instead
 * of each item lighting up on its own. Wrap the items in `HoverHighlightItem`.
 */
function HoverHighlight({
  duration = 250,
  highlightClassName,
  sticky = false,
  className,
  children,
  onPointerLeave,
  ...props
}: HoverHighlightProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  const highlight = React.useRef<HTMLDivElement>(null)
  const shown = React.useRef(false)

  const move = React.useCallback(
    (el: HTMLElement) => {
      const root = ref.current
      const h = highlight.current
      if (!root || !h) return
      const a = root.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      // Jump to the first item instead of sliding from nowhere.
      h.style.transitionDuration = shown.current ? `${duration}ms` : '0ms'
      h.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px)`
      h.style.width = `${b.width}px`
      h.style.height = `${b.height}px`
      h.style.opacity = '1'
      shown.current = true
    },
    [duration],
  )

  const clear = React.useCallback(() => {
    if (sticky) return
    const h = highlight.current
    if (!h) return
    h.style.opacity = '0'
    shown.current = false
  }, [sticky])

  const value = React.useMemo(() => ({ move, clear }), [move, clear])

  return (
    <HighlightContext.Provider value={value}>
      <div
        ref={ref}
        data-slot="hover-highlight"
        className={cn('relative', className)}
        onPointerLeave={(e) => {
          onPointerLeave?.(e)
          clear()
        }}
        {...props}
      >
        <div
          ref={highlight}
          aria-hidden
          data-slot="hover-highlight-block"
          className={cn(
            'pointer-events-none absolute top-0 left-0 rounded-xl bg-muted opacity-0 transition-[transform,width,height,opacity] ease-out motion-reduce:transition-none',
            highlightClassName,
          )}
          style={{ transitionDuration: `${duration}ms` }}
        />
        {children}
      </div>
    </HighlightContext.Provider>
  )
}

function HoverHighlightItem({
  className,
  onPointerEnter,
  onFocus,
  ...props
}: React.ComponentProps<'div'>) {
  const ctx = React.useContext(HighlightContext)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer enter only moves a decoration, the item's own content stays interactive
    <div
      data-slot="hover-highlight-item"
      className={cn('relative', className)}
      onPointerEnter={(e) => {
        onPointerEnter?.(e)
        ctx?.move(e.currentTarget)
      }}
      onFocus={(e) => {
        onFocus?.(e)
        ctx?.move(e.currentTarget)
      }}
      {...props}
    />
  )
}

export { HoverHighlight, HoverHighlightItem }
