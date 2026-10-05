'use client'

import type { VariantProps } from 'class-variance-authority'
import { ChevronDownIcon } from 'lucide-react'
import type { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

type SplitVariant = Exclude<VariantProps<typeof buttonVariants>['variant'], 'link' | null>
type SplitSize = Exclude<VariantProps<typeof buttonVariants>['size'], 'icon' | null>

interface SplitButtonContextValue {
  variant: SplitVariant
  size: SplitSize
  disabled: boolean
}

const SplitButtonContext = React.createContext<SplitButtonContextValue>({
  variant: 'default',
  size: 'default',
  disabled: false,
})

export interface SplitButtonProps extends React.ComponentProps<'div'> {
  /** Look of both halves, as on Button. `link` has no surface to split, so it is left out. */
  variant?: SplitVariant
  /** Height of both halves, as on Button. Default `default`. */
  size?: SplitSize
  /** Disable the action and the menu together. */
  disabled?: boolean
}

/**
 * A primary action joined to a chevron that opens related actions. Put a
 * `SplitButtonAction` and a `SplitButtonMenu` inside; they share the variant and size.
 */
function SplitButton({
  variant = 'default',
  size = 'default',
  disabled = false,
  className,
  ...props
}: SplitButtonProps) {
  const value = React.useMemo(() => ({ variant, size, disabled }), [variant, size, disabled])
  return (
    <SplitButtonContext.Provider value={value}>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own box model and legend */}
      <div
        role="group"
        data-slot="split-button"
        data-variant={variant}
        data-size={size}
        className={cn('isolate inline-flex w-fit items-stretch rounded-lg shadow-xs', className)}
        {...props}
      />
    </SplitButtonContext.Provider>
  )
}

/** The main action. Takes every Button prop, including `asChild` and `loading`. */
function SplitButtonAction({
  className,
  disabled,
  ...props
}: Omit<ButtonProps, 'variant' | 'size'>) {
  const ctx = React.useContext(SplitButtonContext)
  return (
    <Button
      data-slot="split-button-action"
      variant={ctx.variant}
      size={ctx.size}
      disabled={ctx.disabled || disabled}
      className={cn(
        'rounded-r-none shadow-none focus-visible:z-(--z-raised,10) active:scale-100',
        className,
      )}
      {...props}
    />
  )
}

const triggerWidth: Record<NonNullable<SplitSize>, string> = {
  sm: 'w-7',
  default: 'w-8',
  lg: 'w-9',
}

export interface SplitButtonMenuProps
  extends React.ComponentProps<typeof DropdownMenuPrimitive.Root> {
  /** Accessible name of the chevron. Default "More options". */
  label?: string
  /** Replace the chevron with another icon. */
  icon?: React.ReactNode
  /** Where the menu lines up with the button. Default `end`, under the chevron's edge. */
  align?: React.ComponentProps<typeof DropdownMenuPrimitive.Content>['align']
  /** Classes for the chevron button. */
  triggerClassName?: string
  /** Classes for the menu. */
  contentClassName?: string
  /** Disable only the menu, keeping the main action. */
  disabled?: boolean
}

/** The chevron and its menu. Children are `DropdownMenuItem`s and friends. */
function SplitButtonMenu({
  label = 'More options',
  icon,
  align = 'end',
  triggerClassName,
  contentClassName,
  disabled,
  children,
  ...props
}: SplitButtonMenuProps) {
  const ctx = React.useContext(SplitButtonContext)
  const size = ctx.size ?? 'default'
  const outline = ctx.variant === 'outline'
  return (
    <DropdownMenu {...props}>
      <DropdownMenuTrigger
        data-slot="split-button-trigger"
        aria-label={label}
        disabled={ctx.disabled || disabled}
        className={cn(
          buttonVariants({ variant: ctx.variant, size }),
          triggerWidth[size],
          'relative rounded-l-none px-0 shadow-none focus-visible:z-(--z-raised,10) active:scale-100 has-[>svg]:px-0',
          // An outlined pair shares one border; a filled pair gets a hairline in its own text color.
          outline
            ? '-ml-px'
            : 'before:pointer-events-none before:absolute before:inset-y-2 before:left-0 before:w-px before:bg-current before:opacity-25',
          '[&[data-state=open]>svg]:rotate-180 [&>svg]:transition-transform [&>svg]:duration-(--duration-normal,200ms) motion-reduce:[&>svg]:transition-none',
          triggerClassName,
        )}
      >
        {icon ?? <ChevronDownIcon aria-hidden="true" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn('min-w-44', contentClassName)}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { SplitButton, SplitButtonAction, SplitButtonMenu }
