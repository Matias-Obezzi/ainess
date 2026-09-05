'use client'

import { type ToasterProps, Toaster as ToasterRoot } from '@uiness/toast'
import type * as React from 'react'

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
function Toaster({ style, ...props }: ToasterProps) {
  return (
    <ToasterRoot
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
