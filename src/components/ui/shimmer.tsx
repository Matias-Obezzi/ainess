import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export interface ShimmerProps extends React.ComponentProps<'span'> {
  asChild?: boolean
  /** Seconds for one sweep. Default 3. */
  duration?: number
  /** Color of the sweep. Default the foreground color. */
  highlight?: string
  /** Base color of the text. Default the foreground at 55%. */
  color?: string
  /** Width of the sweep as a percentage of the text. Default 30. */
  width?: number
}

/**
 * Text with a highlight that sweeps across it. Wrap a heading, or use `asChild` on a
 * button label. Inherits the font, so it fits anywhere.
 */
function Shimmer({
  asChild,
  duration = 3,
  highlight = 'var(--foreground)',
  color = 'color-mix(in oklab, var(--foreground) 55%, transparent)',
  width = 30,
  className,
  style,
  ...props
}: ShimmerProps) {
  const Comp = asChild ? Slot.Root : 'span'
  return (
    <Comp
      data-slot="shimmer"
      className={cn(
        'inline-block bg-clip-text text-transparent motion-reduce:animate-none motion-reduce:text-current',
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(110deg, ${color} ${50 - width / 2}%, ${highlight} 50%, ${color} ${50 + width / 2}%)`,
        backgroundSize: '200% auto',
        animation: `shimmer ${duration}s linear infinite`,
        ...style,
      }}
      {...props}
    />
  )
}

export { Shimmer }
