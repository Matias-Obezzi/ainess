'use client'

import { CheckIcon, ChevronsUpDownIcon, MinusIcon, XIcon } from 'lucide-react'
import * as React from 'react'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'

export interface MultiSelectLabels {
  /** Shown in the trigger while nothing is picked. */
  placeholder: string
  /** Placeholder of the search field. */
  search: string
  /** Shown when nothing matches the search. */
  empty: string
  selectAll: string
  clear: string
  /** Name of a tag's remove button. */
  remove: (label: string) => string
  /** What the trigger reads as when nothing is picked. */
  noneSelected: string
  /** What the trigger reads as, with the picked labels joined. */
  selected: (count: number, labels: string) => string
}

export const defaultMultiSelectLabels: MultiSelectLabels = {
  placeholder: 'Select…',
  search: 'Search…',
  empty: 'No results.',
  selectAll: 'Select all',
  clear: 'Clear selection',
  remove: (label) => `Remove ${label}`,
  noneSelected: 'None selected',
  selected: (count, labels) => `${count} selected: ${labels}`,
}

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface MultiSelectOption {
  value: string
  label: string
  /** Extra words the option is matched by. */
  keywords?: string[]
  disabled?: boolean
  /** Options with the same group render under a heading. */
  group?: string
  /** Shown before the label in the list and in the tag. */
  icon?: React.ReactNode
}

export interface MultiSelectProps {
  options: MultiSelectOption[]
  /** Controlled selection. */
  value?: string[]
  /** Starting selection when uncontrolled. */
  defaultValue?: string[]
  /** Called with the new selection, in the order the options are listed. */
  onValueChange?: (value: string[]) => void
  /** Shown in the trigger while nothing is picked. */
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /** Tags shown in the trigger before the rest fold into "+N". Default 3. */
  maxShown?: number
  /** Show "Select all" at the top of the list. Default true. */
  selectAll?: boolean
  /** Label of the select all row. Default "Select all". */
  selectAllLabel?: string
  /** Label of the clear row. Default "Clear selection". */
  clearLabel?: string
  /** Accessible name of a tag's remove button. Default "Remove {label}". */
  removeLabel?: (label: string) => string
  disabled?: boolean
  /** Classes for the trigger box. */
  className?: string
  /** Classes for the popover panel. */
  contentClassName?: string
  align?: 'start' | 'center' | 'end'
  /** Controlled open state of the list. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Renders one hidden input per selected value, for native form posts. */
  name?: string
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<MultiSelectLabels>
}

/**
 * Pick several options from a searchable list. The picks show as tags in the trigger, the
 * extra ones folded into a count, and each tag can be removed on its own. Backspace on the
 * trigger removes the last one.
 */
function MultiSelect({
  options,
  value: valueProp,
  defaultValue,
  onValueChange,
  placeholder: placeholderProp,
  searchPlaceholder: searchProp,
  emptyText: emptyProp,
  maxShown = 3,
  selectAll = true,
  selectAllLabel: selectAllProp,
  clearLabel: clearProp,
  removeLabel: removeProp,
  labels: labelsProp,
  disabled,
  className,
  contentClassName,
  align = 'start',
  open: openProp,
  onOpenChange,
  name,
  id,
  ...aria
}: MultiSelectProps) {
  const labels = useLabels('multi-select', defaultMultiSelectLabels, labelsProp)
  const placeholder = placeholderProp ?? labels.placeholder
  const searchPlaceholder = searchProp ?? labels.search
  const emptyText = emptyProp ?? labels.empty
  const selectAllLabel = selectAllProp ?? labels.selectAll
  const clearLabel = clearProp ?? labels.clear
  const removeLabel = removeProp ?? labels.remove
  const [uncontrolled, setUncontrolled] = React.useState<string[]>(defaultValue ?? [])
  const selected = valueProp ?? uncontrolled
  const [openState, setOpenState] = React.useState(false)
  const open = openProp ?? openState
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next)
    onOpenChange?.(next)
  }

  const summaryId = React.useId()
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  // Keep the order of the options, not the order of the clicks, so the tags never reshuffle.
  const commit = (next: Set<string>) => {
    const ordered = options.filter((o) => next.has(o.value)).map((o) => o.value)
    // Values with no option yet (loaded later) are kept at the end.
    for (const v of next) if (!ordered.includes(v)) ordered.push(v)
    if (valueProp === undefined) setUncontrolled(ordered)
    onValueChange?.(ordered)
  }

  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    commit(next)
  }

  const enabled = options.filter((o) => !o.disabled)
  const allSelected = enabled.length > 0 && enabled.every((o) => selected.includes(o.value))
  const someSelected = !allSelected && enabled.some((o) => selected.includes(o.value))

  const toggleAll = () => {
    const next = new Set(selected)
    for (const o of enabled) {
      if (allSelected) next.delete(o.value)
      else next.add(o.value)
    }
    commit(next)
  }

  const selectedOptions: MultiSelectOption[] = selected.map(
    (v) => options.find((o) => o.value === v) ?? { value: v, label: v },
  )
  const shown = selectedOptions.slice(0, maxShown)
  const hidden = selectedOptions.length - shown.length

  const groups = React.useMemo(() => {
    const map = new Map<string | undefined, MultiSelectOption[]>()
    for (const option of options) {
      const list = map.get(option.group) ?? []
      list.push(option)
      map.set(option.group, list)
    }
    return Array.from(map.entries())
  }, [options])

  const ariaLabel = aria['aria-label'] ?? (aria['aria-labelledby'] ? undefined : placeholder)
  const summary =
    selectedOptions.length === 0
      ? labels.noneSelected
      : labels.selected(selectedOptions.length, selectedOptions.map((o) => o.label).join(', '))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          data-slot="multi-select"
          data-disabled={disabled ? '' : undefined}
          className={cn(
            'relative flex min-h-9 w-72 min-w-0 items-center gap-1 rounded-lg border border-input bg-transparent py-1 pr-9 pl-1.5 text-sm shadow-xs transition-[color,box-shadow] dark:bg-input/30',
            'hover:bg-accent/50 has-[[data-slot=multi-select-trigger]:focus-visible]:border-ring has-[[data-slot=multi-select-trigger]:focus-visible]:ring-[3px] has-[[data-slot=multi-select-trigger]:focus-visible]:ring-ring/50',
            'has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-destructive/20 dark:has-[[aria-invalid=true]]:ring-destructive/40',
            'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
            className,
          )}
        >
          {/* The trigger fills the box behind the tags, so a click anywhere opens the list
              while the tags' own buttons stay separate controls, not nested in a button. */}
          <PopoverTrigger asChild>
            <button
              ref={triggerRef}
              id={id}
              type="button"
              role="combobox"
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-label={ariaLabel}
              aria-labelledby={aria['aria-labelledby']}
              aria-describedby={[summaryId, aria['aria-describedby']].filter(Boolean).join(' ')}
              aria-invalid={aria['aria-invalid']}
              disabled={disabled}
              data-slot="multi-select-trigger"
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && selected.length > 0) {
                  e.preventDefault()
                  const last = selected[selected.length - 1]
                  if (last !== undefined) toggle(last)
                }
              }}
              className="absolute inset-0 rounded-[inherit] outline-none"
            />
          </PopoverTrigger>
          <span id={summaryId} className="sr-only">
            {summary}
          </span>
          <span className="pointer-events-none relative flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {selectedOptions.length === 0 ? (
              <span className="truncate px-1.5 text-muted-foreground">{placeholder}</span>
            ) : (
              <>
                {shown.map((option) => (
                  <span
                    key={option.value}
                    data-slot="multi-select-tag"
                    className="inline-flex h-6 max-w-full items-center gap-1 rounded-md bg-secondary pr-0.5 pl-2 font-medium text-secondary-foreground text-xs motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:animate-in [&>svg]:size-3"
                  >
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={removeLabel(option.label)}
                      disabled={disabled}
                      onClick={(e) => {
                        // The trigger underneath would open the list too.
                        e.stopPropagation()
                        toggle(option.value)
                        triggerRef.current?.focus()
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="pointer-events-auto flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-foreground/10 hover:text-foreground [&_svg]:size-3"
                    >
                      <XIcon aria-hidden />
                    </button>
                  </span>
                ))}
                {hidden > 0 && (
                  <span
                    data-slot="multi-select-more"
                    aria-hidden
                    className="inline-flex h-6 items-center rounded-md border border-dashed px-1.5 font-medium text-muted-foreground text-xs tabular-nums"
                  >
                    +{hidden}
                  </span>
                )}
              </>
            )}
          </span>
          <ChevronsUpDownIcon
            aria-hidden
            className="pointer-events-none absolute right-3 size-4 text-muted-foreground opacity-70"
          />
          {name && selected.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align={align}
        data-slot="multi-select-content"
        className={cn('w-(--radix-popover-trigger-width) min-w-56 p-0', contentClassName)}
      >
        <Command label={ariaLabel ?? placeholder}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList aria-multiselectable>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {selectAll && enabled.length > 1 && (
              <CommandGroup>
                <CommandItem
                  value={selectAllLabel}
                  keywords={['all']}
                  onSelect={toggleAll}
                  aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
                  data-slot="multi-select-all"
                >
                  <Check state={allSelected ? 'on' : someSelected ? 'mixed' : 'off'} />
                  {selectAllLabel}
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map(([group, items]) => (
              <CommandGroup key={group ?? ''} heading={group}>
                {items.map((option) => {
                  const isSelected = selected.includes(option.value)
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      keywords={[option.value, ...(option.keywords ?? [])]}
                      disabled={option.disabled}
                      onSelect={() => toggle(option.value)}
                      aria-checked={isSelected}
                      data-checked={isSelected ? '' : undefined}
                    >
                      <Check state={isSelected ? 'on' : 'off'} />
                      {option.icon}
                      <span className="truncate">{option.label}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={clearLabel}
                    keywords={['clear', 'none']}
                    onSelect={() => commit(new Set())}
                    data-slot="multi-select-clear"
                    className="justify-center text-muted-foreground"
                  >
                    {clearLabel}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** The square box before each option. */
function Check({ state }: { state: 'on' | 'off' | 'mixed' }) {
  return (
    <span
      aria-hidden
      data-state={state}
      className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input text-primary-foreground shadow-xs transition-colors duration-(--duration-fast,150ms) data-[state=mixed]:border-primary data-[state=on]:border-primary data-[state=mixed]:bg-primary data-[state=on]:bg-primary motion-reduce:transition-none [&_svg]:size-3 [&_svg]:text-current!"
    >
      {state === 'on' && <CheckIcon strokeWidth={3} />}
      {state === 'mixed' && <MinusIcon strokeWidth={3} />}
    </span>
  )
}

export { MultiSelect }
