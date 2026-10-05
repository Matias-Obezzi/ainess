import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import * as React from 'react'
import { cn } from '@/lib/utils'

type Size = 'sm' | 'default' | 'lg'

const rootSize: Record<Size, string> = {
  sm: 'h-8 text-xs',
  default: 'h-9 text-sm',
  lg: 'h-10 text-sm',
}

const itemSize: Record<Size, string> = {
  sm: 'px-2.5',
  default: 'px-3',
  lg: 'px-4',
}

const SegmentedControlContext = React.createContext<{ size: Size; fullWidth: boolean }>({
  size: 'default',
  fullWidth: false,
})

export interface SegmentedControlProps
  extends Omit<
    React.ComponentProps<typeof RadioGroupPrimitive.Root>,
    'orientation' | 'value' | 'defaultValue' | 'onValueChange'
  > {
  /** The selected segment, when you control it. */
  value?: string
  /** The segment selected at first, when it controls itself. */
  defaultValue?: string
  /** Called with the new value when the user picks a segment. */
  onValueChange?: (value: string) => void
  /** Height and text size. Default `default`. */
  size?: Size
  /** Stretch across the container, segments sharing the width equally. */
  fullWidth?: boolean
}

/**
 * Picks one of a few views, with a thumb that slides to the chosen segment. A radio group
 * underneath: Tab reaches the selected segment, the arrow keys move and select. Name it with
 * `aria-label`.
 */
function SegmentedControl({
  value,
  defaultValue,
  onValueChange,
  size = 'default',
  fullWidth = false,
  className,
  children,
  ...props
}: SegmentedControlProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const current = value ?? uncontrolled
  const root = React.useRef<HTMLDivElement>(null)
  const thumb = React.useRef<HTMLDivElement>(null)
  const [ready, setReady] = React.useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: the value, size and segments move the thumb
  React.useLayoutEffect(() => {
    const el = root.current
    const t = thumb.current
    if (!el || !t) return
    const place = () => {
      const checked = el.querySelector<HTMLElement>(
        '[data-slot=segmented-control-item][data-state=checked]',
      )
      if (!checked) {
        t.style.opacity = '0'
        return
      }
      t.style.opacity = '1'
      t.style.translate = `${checked.offsetLeft}px ${checked.offsetTop}px`
      t.style.width = `${checked.offsetWidth}px`
      t.style.height = `${checked.offsetHeight}px`
      setReady(true)
    }
    place()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(place)
    observer.observe(el)
    return () => observer.disconnect()
  }, [current, size, fullWidth, children])

  const context = React.useMemo(() => ({ size, fullWidth }), [size, fullWidth])

  return (
    <SegmentedControlContext.Provider value={context}>
      <RadioGroupPrimitive.Root
        ref={root}
        data-slot="segmented-control"
        data-ready={ready}
        orientation="horizontal"
        // An empty string selects nothing, and keeps Radix controlled from the first render.
        value={current ?? ''}
        onValueChange={(next) => {
          if (value === undefined) setUncontrolled(next)
          onValueChange?.(next)
        }}
        className={cn(
          'group/segmented-control relative isolate items-center rounded-lg bg-muted p-[3px] text-muted-foreground',
          fullWidth ? 'flex w-full' : 'inline-flex w-fit',
          rootSize[size],
          className,
        )}
        {...props}
      >
        <div
          ref={thumb}
          aria-hidden="true"
          data-slot="segmented-control-thumb"
          className={cn(
            'pointer-events-none absolute top-0 left-0 rounded-md bg-background opacity-0 shadow-sm dark:border dark:border-input dark:bg-input/30',
            ready &&
              'transition-[translate,width,height] duration-(--duration-normal,200ms) ease-(--easing-emphasized,cubic-bezier(0.16,1,0.3,1)) motion-reduce:transition-none',
          )}
        />
        {children}
      </RadioGroupPrimitive.Root>
    </SegmentedControlContext.Provider>
  )
}

/** One segment. Takes a `value`, and text, an icon or both as children. */
function SegmentedControlItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  const { size, fullWidth } = React.useContext(SegmentedControlContext)
  return (
    <RadioGroupPrimitive.Item
      data-slot="segmented-control-item"
      className={cn(
        "relative inline-flex h-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium outline-none transition-[color,box-shadow] duration-(--duration-fast,150ms) hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Until the thumb has measured its place, the selected segment paints its own background.
        'group-data-[ready=false]/segmented-control:data-[state=checked]:bg-background group-data-[ready=false]/segmented-control:data-[state=checked]:shadow-sm',
        itemSize[size],
        fullWidth && 'flex-1',
        className,
      )}
      {...props}
    />
  )
}

export { SegmentedControl, SegmentedControlItem }
