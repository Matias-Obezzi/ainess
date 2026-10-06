'use client'

import { SearchIcon } from 'lucide-react'
import * as React from 'react'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'

export interface CommandLabels {
  /** Name of the menu, and title of `CommandDialog`. */
  title: string
  /** Description of `CommandDialog`, read by screen readers. */
  description: string
}

export const defaultCommandLabels: CommandLabels = {
  title: 'Command menu',
  description: 'Search for a command or a page',
}

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

/* -------------------------------------------------------------------------------------------------
 * Matching
 * -----------------------------------------------------------------------------------------------*/

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

/**
 * Score how well `search` matches `value` or any keyword, from 0 (no match) to 1 (exact).
 * Prefix and substring matches rank above scattered ones, and word starts count more.
 */
function commandScore(value: string, search: string, keywords?: string[]): number {
  const q = normalize(search)
  if (!q) return 1
  let best = 0
  for (const raw of [value, ...(keywords ?? [])]) {
    const t = normalize(raw)
    if (!t) continue
    if (t === q) return 1
    if (t.startsWith(q)) best = Math.max(best, 0.9)
    else {
      const at = t.indexOf(q)
      if (at !== -1) {
        const wordStart = at === 0 || /[\s\-_/.]/.test(t[at - 1] ?? '')
        best = Math.max(best, wordStart ? 0.8 : 0.6)
        continue
      }
    }
    // Scattered characters in order, rewarding runs and word starts.
    let ti = 0
    let score = 0
    let run = 0
    let ok = true
    for (const ch of q) {
      const next = t.indexOf(ch, ti)
      if (next === -1) {
        ok = false
        break
      }
      const consecutive = next === ti && ti > 0
      const wordStart = next === 0 || /[\s\-_/.]/.test(t[next - 1] ?? '')
      run = consecutive ? run + 1 : 0
      score += 1 + run * 0.5 + (wordStart ? 1 : 0)
      ti = next + 1
    }
    if (ok) best = Math.max(best, Math.min(0.5, (score / (q.length * 3)) * 0.5))
  }
  return best
}

/* -------------------------------------------------------------------------------------------------
 * Context
 * -----------------------------------------------------------------------------------------------*/

interface ItemRecord {
  id: string
  value: string
  keywords?: string[]
  group?: string
  disabled?: boolean
  onSelect?: (value: string) => void
}

interface CommandContextValue {
  search: string
  setSearch: (search: string) => void
  register: (item: ItemRecord) => () => void
  visible: ReadonlySet<string>
  groupCounts: ReadonlyMap<string, number>
  count: number
  active: string | null
  setActive: (id: string | null) => void
  select: (id: string) => void
  listId: string
  listRef: React.RefObject<HTMLDivElement | null>
  labelId: string
}

const CommandContext = React.createContext<CommandContextValue | null>(null)

function useCommand() {
  const ctx = React.useContext(CommandContext)
  if (!ctx) throw new Error('Command parts must be rendered inside <Command>')
  return ctx
}

const GroupContext = React.createContext<string | undefined>(undefined)

const ITEM_SELECTOR = '[data-slot="command-item"]:not([data-disabled]):not([hidden])'

/* -------------------------------------------------------------------------------------------------
 * Command
 * -----------------------------------------------------------------------------------------------*/

export interface CommandProps extends Omit<React.ComponentProps<'div'>, 'onSelect'> {
  /** Controlled search text. */
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Turn off the built in filter, when you fetch results yourself. Default true. */
  shouldFilter?: boolean
  /** Custom scoring, return 0 to hide an item. */
  filter?: (value: string, search: string, keywords?: string[]) => number
  /** Move to the first item again when the results change. Default true. */
  loop?: boolean
  /** Accessible name when there is no visible label. */
  label?: string
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<CommandLabels>
}

function Command({
  value: valueProp,
  defaultValue = '',
  onValueChange,
  shouldFilter = true,
  filter = commandScore,
  loop = true,
  label: labelProp,
  labels: labelsProp,
  className,
  onKeyDown,
  children,
  ...props
}: CommandProps) {
  const labels = useLabels('command', defaultCommandLabels, labelsProp)
  const label = labelProp ?? labels.title
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const search = valueProp ?? uncontrolled
  const setSearch = React.useCallback(
    (next: string) => {
      if (valueProp === undefined) setUncontrolled(next)
      onValueChange?.(next)
    },
    [valueProp, onValueChange],
  )

  const items = React.useRef(new Map<string, ItemRecord>())
  const [version, bump] = React.useReducer((v: number) => v + 1, 0)
  const register = React.useCallback((item: ItemRecord) => {
    items.current.set(item.id, item)
    bump()
    return () => {
      items.current.delete(item.id)
      bump()
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: version tracks the item registry
  const { visible, groupCounts } = React.useMemo(() => {
    const visible = new Set<string>()
    const groupCounts = new Map<string, number>()
    for (const item of items.current.values()) {
      const score = shouldFilter ? filter(item.value, search, item.keywords) : 1
      if (score <= 0) continue
      visible.add(item.id)
      if (item.group) groupCounts.set(item.group, (groupCounts.get(item.group) ?? 0) + 1)
    }
    return { visible, groupCounts }
  }, [search, version, shouldFilter, filter])

  const [active, setActive] = React.useState<string | null>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()
  const labelId = React.useId()

  const visibleElements = React.useCallback(
    () => Array.from(listRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []),
    [],
  )

  // Keep the active item valid: first visible one whenever the current one disappears.
  React.useLayoutEffect(() => {
    if (active && visible.has(active) && !items.current.get(active)?.disabled) return
    setActive(visibleElements()[0]?.id ?? null)
  }, [visible, active, visibleElements])

  // Reset to the first item when the search changes.
  const lastSearch = React.useRef(search)
  React.useLayoutEffect(() => {
    if (lastSearch.current === search) return
    lastSearch.current = search
    setActive(visibleElements()[0]?.id ?? null)
  }, [search, visibleElements])

  // Keep the active item in view inside the list only. scrollIntoView would also scroll the
  // page, which jumps to a command menu further down as soon as it mounts.
  React.useEffect(() => {
    const list = listRef.current
    if (!active || !list) return
    const el = list.querySelector<HTMLElement>(`[id="${active}"]`)
    if (!el) return
    const pad = Number.parseFloat(getComputedStyle(list).scrollPaddingTop) || 0
    const box = list.getBoundingClientRect()
    const item = el.getBoundingClientRect()
    if (item.top < box.top + pad) list.scrollTop -= box.top + pad - item.top
    else if (item.bottom > box.bottom - pad) list.scrollTop += item.bottom - (box.bottom - pad)
  }, [active])

  const select = React.useCallback((id: string) => {
    const item = items.current.get(id)
    if (!item || item.disabled) return
    item.onSelect?.(item.value)
  }, [])

  const move = (delta: number, to?: 'first' | 'last') => {
    const els = visibleElements()
    if (els.length === 0) return
    if (to === 'first') return setActive(els[0]?.id ?? null)
    if (to === 'last') return setActive(els[els.length - 1]?.id ?? null)
    const index = els.findIndex((el) => el.id === active)
    let next = index + delta
    if (loop) next = (next + els.length) % els.length
    else next = Math.max(0, Math.min(els.length - 1, next))
    setActive(els[next]?.id ?? null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (e.metaKey) move(0, 'last')
        else move(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (e.metaKey) move(0, 'first')
        else move(-1)
        break
      case 'Home':
        e.preventDefault()
        move(0, 'first')
        break
      case 'End':
        e.preventDefault()
        move(0, 'last')
        break
      case 'Enter':
        if (e.nativeEvent.isComposing) return
        e.preventDefault()
        if (active) select(active)
        break
    }
  }

  const ctx = React.useMemo<CommandContextValue>(
    () => ({
      search,
      setSearch,
      register,
      visible,
      groupCounts,
      count: visible.size,
      active,
      setActive,
      select,
      listId,
      listRef,
      labelId,
    }),
    [search, setSearch, register, visible, groupCounts, active, select, listId, labelId],
  )

  return (
    <CommandContext.Provider value={ctx}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: keyboard handling for the combobox pattern lives here */}
      <div
        data-slot="command"
        onKeyDown={handleKeyDown}
        className={cn(
          'flex size-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground',
          className,
        )}
        {...props}
      >
        <span id={labelId} className="sr-only">
          {label}
        </span>
        {children}
      </div>
    </CommandContext.Provider>
  )
}

/* -------------------------------------------------------------------------------------------------
 * Input
 * -----------------------------------------------------------------------------------------------*/

export interface CommandInputProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  /** Replace the search icon. Pass `null` for none. */
  icon?: React.ReactNode
}

function CommandInput({ className, icon = <SearchIcon />, ...props }: CommandInputProps) {
  const { search, setSearch, listId, active, labelId } = useCommand()
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-11 items-center gap-2 border-b px-3 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
    >
      {icon}
      <input
        data-slot="command-input"
        role="combobox"
        aria-expanded
        aria-autocomplete="list"
        aria-controls={listId}
        aria-labelledby={labelId}
        aria-activedescendant={active ?? undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={cn(
          'h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------------------------------
 * List, empty, group, separator
 * -----------------------------------------------------------------------------------------------*/

function CommandList({ className, ...props }: React.ComponentProps<'div'>) {
  const { listId, listRef, labelId } = useCommand()
  return (
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      aria-labelledby={labelId}
      data-slot="command-list"
      className={cn('max-h-80 scroll-py-1 overflow-y-auto overflow-x-hidden p-1', className)}
      {...props}
    />
  )
}

function CommandEmpty({ className, ...props }: React.ComponentProps<'div'>) {
  const { count } = useCommand()
  if (count > 0) return null
  return (
    <div
      role="presentation"
      data-slot="command-empty"
      className={cn('py-6 text-center text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export interface CommandGroupProps extends React.ComponentProps<'div'> {
  heading?: React.ReactNode
}

function CommandGroup({ heading, className, children, ...props }: CommandGroupProps) {
  const id = React.useId()
  const headingId = React.useId()
  const { groupCounts } = useCommand()
  const empty = (groupCounts.get(id) ?? 0) === 0
  return (
    <GroupContext.Provider value={id}>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own box model */}
      <div
        role="group"
        aria-labelledby={heading ? headingId : undefined}
        data-slot="command-group"
        hidden={empty}
        className={cn('overflow-hidden p-1 text-foreground', className)}
        {...props}
      >
        {heading && (
          <div
            id={headingId}
            data-slot="command-group-heading"
            className="px-2 py-1.5 font-medium text-muted-foreground text-xs"
          >
            {heading}
          </div>
        )}
        {children}
      </div>
    </GroupContext.Provider>
  )
}

function CommandSeparator({ className, ...props }: React.ComponentProps<'hr'>) {
  const { search } = useCommand()
  if (search) return null
  return (
    <hr
      data-slot="command-separator"
      className={cn('-mx-1 my-1 border-border border-t', className)}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------------------------------
 * Item
 * -----------------------------------------------------------------------------------------------*/

export interface CommandItemProps extends Omit<React.ComponentProps<'div'>, 'onSelect'> {
  /** What the item is matched by. Defaults to its text content. */
  value?: string
  /** Extra words the item is matched by. */
  keywords?: string[]
  disabled?: boolean
  onSelect?: (value: string) => void
}

function CommandItem({
  value,
  keywords,
  disabled,
  onSelect,
  className,
  children,
  onPointerMove,
  onClick,
  ...props
}: CommandItemProps) {
  const id = React.useId()
  const group = React.useContext(GroupContext)
  const { register, visible, active, setActive, select } = useCommand()
  const ref = React.useRef<HTMLDivElement>(null)
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect

  const [text, setText] = React.useState(value ?? '')
  React.useLayoutEffect(() => {
    if (value === undefined) setText(ref.current?.textContent?.trim() ?? '')
  }, [value])
  const resolved = value ?? text
  const keywordsKey = keywords?.join(' ')

  React.useLayoutEffect(() => {
    return register({
      id,
      value: resolved,
      keywords: keywordsKey ? keywordsKey.split(' ') : undefined,
      group,
      disabled,
      onSelect: (v) => onSelectRef.current?.(v),
    })
  }, [register, id, resolved, keywordsKey, group, disabled])

  const isVisible = visible.has(id)
  const selected = active === id

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled by the Command root
    <div
      ref={ref}
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      data-slot="command-item"
      data-selected={selected ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      hidden={!isVisible}
      onPointerMove={(e) => {
        onPointerMove?.(e)
        if (!disabled && active !== id) setActive(id)
      }}
      onClick={(e) => {
        onClick?.(e)
        if (!disabled) select(id)
      }}
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden data-[selected]:bg-accent data-[selected]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn('ml-auto text-muted-foreground text-xs tracking-widest', className)}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------------------------------
 * Dialog
 * -----------------------------------------------------------------------------------------------*/

export interface CommandDialogProps extends CommandProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Accessible title. Default "Command menu". */
  title?: string
  description?: string
  /** Classes for the dialog panel. */
  contentClassName?: string
}

function CommandDialog({
  open,
  onOpenChange,
  title: titleProp,
  description: descriptionProp,
  contentClassName,
  children,
  ...props
}: CommandDialogProps) {
  const labels = useLabels('command', defaultCommandLabels, props.labels)
  const title = titleProp ?? labels.title
  const description = descriptionProp ?? labels.description
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn('top-[15%] translate-y-0 overflow-hidden p-0 sm:max-w-lg', contentClassName)}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <Command label={title} {...props}>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Run `handler` on cmd+key (ctrl+key elsewhere). Default key "k".
 * Ignores presses inside inputs unless `inInputs` is true.
 */
function useCommandShortcut(
  handler: (event: KeyboardEvent) => void,
  { key = 'k', inInputs = true }: { key?: string; inInputs?: boolean } = {},
) {
  const ref = React.useRef(handler)
  ref.current = handler
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== key.toLowerCase()) return
      if (!inInputs) {
        const target = e.target as HTMLElement | null
        if (target?.closest('input, textarea, [contenteditable]')) return
      }
      e.preventDefault()
      ref.current(e)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [key, inInputs])
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  commandScore,
  useCommandShortcut,
}
