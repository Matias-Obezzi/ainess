import * as React from 'react'

/**
 * The words of one component: strings, or functions for the ones that take a number or a name.
 * Every component exports its own shape (`PaginationLabels`) and its English defaults
 * (`defaultPaginationLabels`).
 */
export type LabelSet = object

/**
 * Labels for many components, keyed by the registry name of each one (`'pagination'`,
 * `'date-range-picker'`). Loosely typed on purpose: a pack can name components that are not
 * installed in your project and still compile. Type one entry with `satisfies`:
 *
 * ```ts
 * const labels = {
 *   pagination: { previous: 'Anterior' } satisfies Partial<PaginationLabels>,
 * } satisfies LabelsPack
 * ```
 */
export type LabelsPack = { readonly [component: string]: LabelSet | undefined }

interface LabelsContextValue {
  labels: LabelsPack
  locale?: string
}

const LabelsContext = React.createContext<LabelsContextValue | null>(null)

/** Shallow merge that skips `undefined`, so `{ next: undefined }` keeps the default. */
function merge<T extends object>(base: T, ...layers: (object | undefined)[]): T {
  let out: T | undefined
  for (const layer of layers) {
    if (!layer) continue
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue
      out ??= { ...base }
      ;(out as Record<string, unknown>)[key] = value
    }
  }
  return out ?? base
}

export interface LabelsProviderProps {
  /** Labels by component name. Merged over the ones of a provider above, component by component. */
  labels?: LabelsPack
  /** BCP 47 tag the components with a `locale` prop use when it is not set, like `'es-AR'`. */
  locale?: string
  children?: React.ReactNode
}

/** Translates every component below it at once. Nest one to change a few words for a part of the app. */
function LabelsProvider({ labels, locale, children }: LabelsProviderProps) {
  const parent = React.useContext(LabelsContext)
  const value = React.useMemo<LabelsContextValue>(() => {
    const merged: Record<string, LabelSet | undefined> = { ...parent?.labels }
    for (const [component, set] of Object.entries(labels ?? {})) {
      merged[component] = merge({ ...merged[component] }, set)
    }
    return { labels: merged, locale: locale ?? parent?.locale }
  }, [parent, labels, locale])
  return <LabelsContext.Provider value={value}>{children}</LabelsContext.Provider>
}

/**
 * The labels of a component: its `defaults`, then what the nearest `LabelsProvider` has under
 * `component`, then `override` (the component's `labels` prop). Without a provider or an override
 * it returns `defaults` as is.
 */
function useLabels<T extends object>(component: string, defaults: T, override?: Partial<T>): T {
  const fromProvider = React.useContext(LabelsContext)?.labels[component]
  return React.useMemo(
    () => merge(defaults, fromProvider, override),
    [defaults, fromProvider, override],
  )
}

/** The `locale` prop when set, else the provider's, else `undefined` (the browser's). */
function useLocale(locale?: string): string | undefined {
  const fromProvider = React.useContext(LabelsContext)?.locale
  return locale ?? fromProvider
}

export { LabelsProvider, useLabels, useLocale }
