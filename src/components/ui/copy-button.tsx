'use client'

import { CheckIcon, CopyIcon, XIcon } from 'lucide-react'
import * as React from 'react'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type CopyState = 'idle' | 'copied' | 'error'

/**
 * Write text to the clipboard. Falls back to a hidden textarea and `execCommand` where the
 * Clipboard API is missing, which is the case on plain http pages.
 */
async function copyToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  const focused = document.activeElement as HTMLElement | null
  area.select()
  try {
    if (!document.execCommand('copy')) throw new Error('Copy command was refused')
  } finally {
    area.remove()
    focused?.focus()
  }
}

export interface CopyButtonLabels {
  /** Accessible name, and the tooltip text at rest. */
  copy: string
  /** Said and shown after a copy. */
  copied: string
  /** Said and shown when the copy fails. */
  failed: string
}

export const defaultCopyButtonLabels: CopyButtonLabels = {
  copy: 'Copy',
  copied: 'Copied',
  failed: 'Copy failed',
}

export interface CopyButtonProps extends Omit<ButtonProps, 'value' | 'onCopy' | 'onError'> {
  /** What to copy: text, or a function that returns it (or a promise of it) at click time. */
  value: string | (() => string | Promise<string>)
  /** Called with the copied text once it is on the clipboard. */
  onCopy?: (text: string) => void
  /** Called when the clipboard refused the text. The button shows a cross meanwhile. */
  onCopyError?: (error: unknown) => void
  /** Milliseconds the confirmation stays before the button resets. Default 2000. */
  timeout?: number
  /** Show the label in a tooltip on hover and focus, and "Copied" in it after a copy. */
  tooltip?: boolean
  /** Accessible name, and the tooltip text at rest. Default "Copy". */
  label?: string
  /** Said and shown after a copy. Default "Copied". */
  copiedLabel?: string
  /** Said and shown when the copy fails. Default "Copy failed". */
  errorLabel?: string
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<CopyButtonLabels>
}

/**
 * Copies a value and confirms it straight away: the icon turns into a check and screen readers
 * hear "Copied". Children, if any, sit next to the icon.
 */
function CopyButton({
  value,
  onCopy,
  onCopyError,
  timeout = 2000,
  tooltip = false,
  label: labelProp,
  copiedLabel: copiedProp,
  errorLabel: errorProp,
  labels: labelsProp,
  variant = 'ghost',
  size,
  className,
  children,
  onClick,
  ...props
}: CopyButtonProps) {
  const labels = useLabels('copy-button', defaultCopyButtonLabels, labelsProp)
  const label = labelProp ?? labels.copy
  const copiedLabel = copiedProp ?? labels.copied
  const errorLabel = errorProp ?? labels.failed
  const [state, setState] = React.useState<CopyState>('idle')
  const [hovered, setHovered] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)

  React.useEffect(() => () => clearTimeout(timer.current), [])

  const settle = (next: CopyState) => {
    setState(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), timeout)
  }

  const copy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    try {
      const text = typeof value === 'function' ? await value() : value
      await copyToClipboard(text)
      settle('copied')
      onCopy?.(text)
    } catch (error) {
      settle('error')
      onCopyError?.(error)
    }
  }

  const message = state === 'copied' ? copiedLabel : state === 'error' ? errorLabel : label

  const button = (
    <Button
      data-slot="copy-button"
      data-state={state}
      variant={variant}
      size={size ?? (children ? 'default' : 'icon')}
      aria-label={children ? undefined : label}
      className={cn('group/copy', className)}
      onClick={copy}
      {...props}
    >
      {/* Three icons in one cell, so the swap is a cross fade with no shift in width. */}
      <span aria-hidden="true" className="grid place-items-center *:col-start-1 *:row-start-1">
        <CopyIcon className="transition-[opacity,scale,filter] duration-(--duration-normal,200ms) ease-(--easing-emphasized,cubic-bezier(0.16,1,0.3,1)) group-data-[state=copied]/copy:scale-50 group-data-[state=error]/copy:scale-50 group-data-[state=copied]/copy:opacity-0 group-data-[state=error]/copy:opacity-0 group-data-[state=copied]/copy:blur-[2px] group-data-[state=error]/copy:blur-[2px] motion-reduce:transition-none" />
        <CheckIcon className="scale-50 opacity-0 blur-[2px] transition-[opacity,scale,filter] duration-(--duration-normal,200ms) ease-(--easing-emphasized,cubic-bezier(0.16,1,0.3,1)) group-data-[state=copied]/copy:scale-100 group-data-[state=copied]/copy:opacity-100 group-data-[state=copied]/copy:blur-[0px] motion-reduce:transition-none" />
        <XIcon className="scale-50 text-destructive opacity-0 blur-[2px] transition-[opacity,scale,filter] duration-(--duration-normal,200ms) ease-(--easing-emphasized,cubic-bezier(0.16,1,0.3,1)) group-data-[state=error]/copy:scale-100 group-data-[state=error]/copy:opacity-100 group-data-[state=error]/copy:blur-[0px] motion-reduce:transition-none" />
      </span>
      {children}
    </Button>
  )

  const status = (
    <span role="status" className="sr-only">
      {state === 'idle' ? '' : message}
    </span>
  )

  if (!tooltip) {
    return (
      <>
        {button}
        {status}
      </>
    )
  }

  return (
    <>
      {/* Stays open through the confirmation, so a copy with the pointer already gone still
          shows "Copied". */}
      <Tooltip open={hovered || state !== 'idle'} onOpenChange={setHovered}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{message}</TooltipContent>
      </Tooltip>
      {status}
    </>
  )
}

export { CopyButton, copyToClipboard }
