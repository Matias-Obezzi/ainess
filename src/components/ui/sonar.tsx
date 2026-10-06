'use client'

import type * as React from 'react'
import { cn } from '@/lib/utils'

export interface SonarProps extends React.ComponentProps<'div'> {
  /** How many rings are out at once. Default 3. */
  rings?: number
  /** Seconds for one ring to travel out and fade. Default 3. */
  duration?: number
  /** How big a ring gets, as a multiple of the wrapped element. Default 2.5. */
  scale?: number
  /** Any CSS color. Default the current text color. */
  color?: string
  /** `ring` draws outlines, `pulse` draws filled circles like a live dot. Default `ring`. */
  variant?: 'ring' | 'pulse'
  /** Classes for every ring, e.g. `rounded-xl` to match a square avatar. */
  ringClassName?: string
}

/**
 * Rings pulsing out from whatever it wraps: an avatar, a status dot, a button. With no
 * children, give it a size and it works as a background. With reduced motion the rings
 * stand still, spread out around the center.
 */
function Sonar({
  rings = 3,
  duration = 3,
  scale = 2.5,
  color = 'currentColor',
  variant = 'ring',
  ringClassName,
  className,
  style,
  children,
  ...props
}: SonarProps) {
  const count = Math.max(1, Math.round(rings))
  return (
    <div
      data-slot="sonar"
      data-variant={variant}
      className={cn(
        'relative inline-grid shrink-0 place-items-center *:relative *:[grid-area:1/1]',
        className,
      )}
      style={
        {
          '--sonar-duration': `${duration}s`,
          '--sonar-scale': String(scale),
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      <span
        aria-hidden
        data-slot="sonar-rings"
        className="pointer-events-none size-full"
        style={{ color }}
      >
        {Array.from({ length: count }, (_, i) => {
          const step = (i + 1) / count
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: rings are identical apart from their delay
              key={i}
              data-slot="sonar-ring"
              className={cn(
                'absolute inset-0 rounded-full will-change-transform',
                'animate-[sonar_var(--sonar-duration)_cubic-bezier(0,0,0.2,1)_infinite] motion-reduce:animate-none',
                variant === 'pulse' ? 'bg-current' : 'border border-current bg-current/5',
                ringClassName,
              )}
              style={{
                animationDelay: `${(-duration * i) / count}s`,
                // The resting ring when the animation is off.
                transform: `scale(${1 + (scale - 1) * step})`,
                opacity: 0.6 * (1 - step) + 0.1,
              }}
            />
          )
        })}
      </span>
      {children}
    </div>
  )
}

export { Sonar }
