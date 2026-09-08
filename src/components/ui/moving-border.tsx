import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export interface MovingBorderProps extends React.ComponentProps<'div'> {
  asChild?: boolean
  /** Seconds for one lap. Default 4. */
  duration?: number
  /** Color of the moving light. Default the primary color. */
  color?: string
  /** Border width in pixels. Default 2. */
  borderWidth?: number
  /** Border radius, any CSS length. Default 0.75rem. */
  radius?: string
  /** Classes for the inner surface. */
  innerClassName?: string
}

/**
 * A border with a light running around it. Wraps anything: a card, an avatar, or with
 * `asChild` your own button becomes the inner surface, which takes the background color.
 */
function MovingBorder({
  asChild,
  duration = 4,
  color = 'var(--primary)',
  borderWidth = 2,
  radius = '0.75rem',
  innerClassName,
  className,
  style,
  children,
  ...props
}: MovingBorderProps) {
  const Inner = asChild ? Slot.Root : 'span'
  return (
    <div
      data-slot="moving-border"
      className={cn(
        'relative inline-flex overflow-hidden bg-border p-(--border-width) [border-radius:var(--radius)]',
        className,
      )}
      style={
        {
          '--border-width': `${borderWidth}px`,
          '--radius': radius,
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      <span
        aria-hidden
        data-slot="moving-border-light"
        className="absolute inset-[-100%] motion-reduce:hidden"
        style={{
          background: `conic-gradient(from 0deg, transparent 0 70%, ${color} 90%, transparent 100%)`,
          animation: `moving-border ${duration}s linear infinite`,
        }}
      />
      <Inner
        data-slot="moving-border-inner"
        className={cn(
          'relative inline-flex size-full items-center justify-center bg-background [border-radius:calc(var(--radius)-var(--border-width))]',
          innerClassName,
        )}
      >
        {children}
      </Inner>
    </div>
  )
}

export { MovingBorder }
