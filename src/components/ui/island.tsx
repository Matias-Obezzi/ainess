import { type IslandProps, Island as IslandRoot } from '@uiness/island'
import type * as React from 'react'

export type {
  AlertOptions,
  ConfirmOptions,
  HardwareIsland,
  IslandEntry,
  IslandHandle,
  IslandOptions,
  IslandStore,
} from '@uiness/island'
export {
  AlertContent,
  ConfirmContent,
  createIsland,
  IslandProvider,
  island,
  Spinner,
  useIsland,
  useIslandEntry,
  useIslandStack,
  useStandalone,
} from '@uiness/island'

/**
 * `<Island />` wired to the theme tokens: the island takes the foreground color,
 * confirm buttons use `--primary` and `--destructive`.
 * Mount it once near the root, then call `island.show()` from anywhere.
 */
function Island({ style, ...props }: IslandProps) {
  return (
    <IslandRoot
      style={
        {
          '--island-bg': 'var(--foreground)',
          '--island-color': 'var(--background)',
          '--island-accent': 'var(--primary)',
          '--island-danger': 'var(--destructive)',
          '--island-muted': 'color-mix(in oklab, var(--background) 18%, transparent)',
          '--island-font': 'inherit',
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Island }
