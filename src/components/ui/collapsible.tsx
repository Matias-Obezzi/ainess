'use client'

import { Collapsible as CollapsiblePrimitive } from 'radix-ui'
import * as React from 'react'
import { useUntilFound } from '@/hooks/use-until-found'
import { cn } from '@/lib/utils'

interface CollapsibleContextValue {
  open: boolean
  disabled?: boolean
  contentId: string
  setOpen: (open: boolean) => void
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null)

function useCollapsible(component: string) {
  const context = React.useContext(CollapsibleContext)
  if (!context) throw new Error(`${component} must be used within <Collapsible>`)
  return context
}

/**
 * Radix keeps the state when you let it, but the content here is ours (Radix drops the
 * children of a closed panel), so the state lives here and Radix follows it.
 */
function Collapsible({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen)
  const open = openProp ?? uncontrolled
  const contentId = React.useId()

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolled(next)
      if (next !== open) onOpenChange?.(next)
    },
    [openProp, open, onOpenChange],
  )

  const value = React.useMemo(
    () => ({ open, disabled, contentId, setOpen }),
    [open, disabled, contentId, setOpen],
  )

  return (
    <CollapsibleContext.Provider value={value}>
      <CollapsiblePrimitive.Root
        data-slot="collapsible"
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
        {...props}
      />
    </CollapsibleContext.Provider>
  )
}

function CollapsibleTrigger(props: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  const { contentId } = useCollapsible('CollapsibleTrigger')
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      // The content is always in the page, so the trigger can always point at it.
      aria-controls={contentId}
      {...props}
    />
  )
}

interface CollapsibleContentProps extends React.ComponentProps<'div'> {
  /**
   * Styles the inner box that holds the children. The outer element only animates the height,
   * so padding and layout belong here, where they are clipped while the panel is closed.
   */
  className?: string
}

/**
 * Closed content stays in the page with `hidden="until-found"`: search engines read it and the
 * browser's find in page opens it on a match. Disabled content is plainly hidden instead.
 */
function CollapsibleContent({ className, children, ref, ...props }: CollapsibleContentProps) {
  const { open, disabled, contentId, setOpen } = useCollapsible('CollapsibleContent')
  const panelRef = useUntilFound(open, disabled ? undefined : () => setOpen(true), ref)

  return (
    <div
      data-slot="collapsible-content"
      data-state={open ? 'open' : 'closed'}
      data-disabled={disabled ? '' : undefined}
      id={contentId}
      hidden={!open}
      className={panelClassName}
      {...props}
      ref={panelRef}
    >
      <div className={cn('min-h-0 overflow-hidden', className)}>{children}</div>
    </div>
  )
}

/**
 * Height animation without measuring: the single grid row goes from 0fr to 1fr. Closed, the
 * browser hides the box with `content-visibility` (or `display` where `until-found` is
 * unknown); listing them as discrete transitions keeps the content painted while it shrinks.
 */
const panelClassName =
  'grid transition-[grid-template-rows,content-visibility,display] transition-discrete duration-(--duration-normal,200ms) ease-(--easing-standard,cubic-bezier(0.2,0,0,1)) data-[state=closed]:grid-rows-[0fr] data-[state=open]:grid-rows-[1fr] motion-reduce:transition-none'

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
