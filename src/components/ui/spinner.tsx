import { LoaderCircleIcon } from 'lucide-react'
import type * as React from 'react'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'

export interface SpinnerLabels {
  /** What it is announced as when no `aria-label` is given. */
  loading: string
}

export const defaultSpinnerLabels: SpinnerLabels = {
  loading: 'Loading',
}

/**
 * A loading indicator in the current text color. Announced as "Loading" by default; pass
 * `aria-label` to say what is loading, or `aria-hidden` when something else already says it.
 */
function Spinner({
  className,
  labels: labelsProp,
  ...props
}: React.ComponentProps<'svg'> & {
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<SpinnerLabels>
}) {
  const labels = useLabels('spinner', defaultSpinnerLabels, labelsProp)
  return (
    <LoaderCircleIcon
      role="status"
      aria-label={labels.loading}
      data-slot="spinner"
      // Slower rather than still with reduced motion: a frozen spinner reads as a stuck one.
      // If a global reset zeroes animation durations the icon stays, it just stops turning.
      className={cn(
        'size-4 shrink-0 animate-spin motion-reduce:animate-[spin_1.5s_linear_infinite]',
        className,
      )}
      {...props}
    />
  )
}

export { Spinner }
