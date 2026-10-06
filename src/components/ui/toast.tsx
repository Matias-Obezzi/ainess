'use client'

import { type ToasterProps, Toaster as ToasterRoot } from '@uiness/toast'
import type * as React from 'react'
import { useLabels } from '@/lib/labels'

export interface ToastLabels {
  /** Name of the region that holds the toasts. */
  region: string
  /** Name of the close button. */
  close: string
}

export const defaultToastLabels: ToastLabels = {
  region: 'Notifications',
  close: 'Close',
}

export type {
  PromiseOptions,
  Toast,
  ToastAction,
  ToastOptions,
  ToastPosition,
  ToastType,
} from '@uiness/toast'
export { createToast, createToastStore, toast, toastStore } from '@uiness/toast'

/**
 * `<Toaster />` wired to the theme tokens. Mount it once, then call `toast()`.
 */
function Toaster({
  style,
  labels: labelsProp,
  ...props
}: ToasterProps & {
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<ToastLabels>
}) {
  const labels = useLabels('toast', defaultToastLabels, labelsProp)
  return (
    <ToasterRoot
      label={labels.region}
      closeLabel={labels.close}
      style={
        {
          '--toast-bg': 'var(--popover)',
          '--toast-color': 'var(--popover-foreground)',
          '--toast-border': 'var(--border)',
          '--toast-radius': 'var(--radius)',
          '--toast-font': 'inherit',
          '--toast-action-bg': 'var(--primary)',
          '--toast-action-color': 'var(--primary-foreground)',
          '--toast-shadow': '0 8px 30px rgb(0 0 0 / 0.12)',
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
