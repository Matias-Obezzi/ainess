'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AnimatedTooltipItem {
  id: string | number
  name: string
  /** Second line, a role or a handle. */
  title?: string
  image: string
  href?: string
}

export interface AnimatedTooltipProps extends React.ComponentProps<'div'> {
  items: AnimatedTooltipItem[]
  /** Avatar size in pixels. Default 48. */
  size?: number
}

const springy = 'linear(0, 0.4 20%, 1.1 50%, 0.96 70%, 1)'

/**
 * A row of overlapping avatars. Hovering one lifts it and pops a card with the name
 * that leans towards where the pointer is on the avatar.
 */
function AnimatedTooltip({ items, size = 48, className, ...props }: AnimatedTooltipProps) {
  const [active, setActive] = React.useState<string | number | null>(null)

  const lean = (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    el.style.setProperty('--lean-x', `${(x * 30).toFixed(1)}px`)
    el.style.setProperty('--lean-r', `${(x * -12).toFixed(1)}deg`)
  }

  return (
    <div
      data-slot="animated-tooltip"
      className={cn('flex items-center', className)}
      style={{ '--size': `${size}px` } as React.CSSProperties}
      {...props}
    >
      {items.map((item) => {
        const open = active === item.id
        const Comp = item.href ? 'a' : 'button'
        return (
          <Comp
            key={item.id}
            type={item.href ? undefined : 'button'}
            href={item.href}
            data-slot="animated-tooltip-item"
            data-state={open ? 'open' : 'closed'}
            aria-label={item.title ? `${item.name}, ${item.title}` : item.name}
            className="group/avatar relative -mr-3 rounded-full outline-none transition-transform duration-300 hover:z-10 hover:scale-110 focus-visible:z-10 focus-visible:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 last:mr-0"
            style={{ transitionTimingFunction: springy }}
            onPointerEnter={() => setActive(item.id)}
            onPointerMove={lean}
            onPointerLeave={() => setActive((a) => (a === item.id ? null : a))}
            onFocus={() => setActive(item.id)}
            onBlur={() => setActive((a) => (a === item.id ? null : a))}
          >
            <img
              src={item.image}
              alt=""
              width={size}
              height={size}
              className="size-(--size) rounded-full border-2 border-background object-cover"
            />
            <span
              role="tooltip"
              aria-hidden={!open}
              data-slot="animated-tooltip-content"
              className={cn(
                'pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-lg bg-foreground px-3 py-1.5 text-background text-xs shadow-md transition-[opacity,transform] duration-300 motion-reduce:transition-none',
                open
                  ? 'translate-y-0 scale-100 opacity-100 [transform:translate(calc(-50%+var(--lean-x,0px)),0)_rotate(var(--lean-r,0deg))]'
                  : 'translate-y-2 scale-75 opacity-0',
              )}
              style={{ transitionTimingFunction: open ? springy : 'ease-in' }}
            >
              <span className="font-semibold">{item.name}</span>
              {item.title && <span className="opacity-70">{item.title}</span>}
              <span className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-foreground" />
            </span>
          </Comp>
        )
      })}
    </div>
  )
}

export { AnimatedTooltip }
