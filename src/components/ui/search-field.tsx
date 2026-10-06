'use client'

import { SearchIcon, XIcon } from 'lucide-react'
import * as React from 'react'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

export interface SearchFieldProps
  extends Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'defaultValue'> {
  /** Controlled value. */
  value?: string
  /** Starting value when uncontrolled. */
  defaultValue?: string
  /** Called with the new text on every change, and with "" when cleared. */
  onValueChange?: (value: string) => void
  /** Called with the text when Enter is pressed. */
  onSearch?: (value: string) => void
  /** Called after the clear button or Escape empties the field. */
  onClear?: () => void
  /** Swap the search icon for a spinner and mark the field busy. */
  loading?: boolean
  /** A key that focuses the field from anywhere on the page: "/" or "mod+k" (cmd on Mac, ctrl elsewhere). */
  shortcut?: '/' | 'mod+k'
  /** Show the shortcut as a hint inside the empty field. Default true when `shortcut` is set. */
  showShortcut?: boolean
  /** Start as an icon button that grows into the field, and fold back when it loses focus empty. */
  expanding?: boolean
  /** Width of the open field when `expanding`. Default "16rem". */
  expandedWidth?: string
  /** Accessible name of the clear button. Default "Clear search". */
  clearLabel?: string
  /** Classes for the input itself. `className` goes on the outer box. */
  inputClassName?: string
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<SearchFieldLabels>
}

export interface SearchFieldLabels {
  /** Placeholder, and without the ellipsis the name of the folded button. */
  placeholder: string
  /** Name of the clear button. */
  clear: string
}

export const defaultSearchFieldLabels: SearchFieldLabels = {
  placeholder: 'Search…',
  clear: 'Clear search',
}

const subscribe = () => () => {}
const isMac = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

function isEditable(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
}

/**
 * A search input with an icon, a clear button and an optional shortcut that focuses it from
 * anywhere. With `expanding` it starts as an icon button and grows into the field.
 */
function SearchField({
  value: valueProp,
  defaultValue = '',
  onValueChange,
  onSearch,
  onClear,
  loading = false,
  shortcut,
  showShortcut = true,
  expanding = false,
  expandedWidth = '16rem',
  clearLabel: clearProp,
  placeholder: placeholderProp,
  labels: labelsProp,
  className,
  inputClassName,
  id,
  disabled,
  ref,
  onChange,
  onKeyDown,
  onBlur,
  style,
  ...props
}: SearchFieldProps) {
  const labels = useLabels('search-field', defaultSearchFieldLabels, labelsProp)
  const clearLabel = clearProp ?? labels.clear
  const placeholder = placeholderProp ?? labels.placeholder
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const value = valueProp ?? uncontrolled
  const [open, setOpen] = React.useState(false)
  const expanded = !expanding || open || value !== ''

  const autoId = React.useId()
  const inputId = id ?? autoId
  const rootRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

  const mac = React.useSyncExternalStore(subscribe, isMac, () => false)

  const setValue = (next: string) => {
    if (valueProp === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }

  const focusInput = React.useCallback(() => {
    setOpen(true)
    // The input is always mounted, only hidden while folded, so it can take focus right away.
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const clear = () => {
    setValue('')
    onClear?.()
    inputRef.current?.focus()
  }

  // Hand focus back to the icon button after folding with Escape, once it is on screen again.
  const [refocus, setRefocus] = React.useState(false)
  React.useEffect(() => {
    if (!refocus || expanded) return
    buttonRef.current?.focus()
    setRefocus(false)
  }, [refocus, expanded])

  React.useEffect(() => {
    if (!shortcut || disabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (shortcut === '/') {
        if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return
      } else if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return
      e.preventDefault()
      focusInput()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shortcut, disabled, focusInput])

  const hint = shortcut && showShortcut ? (shortcut === '/' ? '/' : mac ? '⌘K' : 'Ctrl K') : null
  const keyshortcuts = shortcut === '/' ? '/' : shortcut ? 'Control+K Meta+K' : undefined

  return (
    <div
      ref={rootRef}
      data-slot="search-field"
      data-expanded={expanded ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      style={expanding ? { width: expanded ? expandedWidth : '2.25rem', ...style } : style}
      className={cn(
        'relative flex h-9 min-w-0 items-center rounded-lg border border-input bg-transparent shadow-xs dark:bg-input/30',
        'transition-[width,color,box-shadow] duration-(--duration-normal,200ms) ease-(--easing-emphasized,cubic-bezier(0.16,1,0.3,1)) motion-reduce:transition-none',
        'has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50',
        'has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-destructive/20',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        !expanding && 'w-full',
        !expanded && 'overflow-hidden hover:bg-accent',
        className,
      )}
    >
      {/* Sits where the icon sits in the open field, so nothing jumps as it grows. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[9px] flex size-4 items-center justify-center text-muted-foreground [&_svg]:size-4"
      >
        {loading ? <Spinner aria-hidden /> : <SearchIcon />}
      </span>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        data-slot="search-field-input"
        autoComplete="off"
        enterKeyHint="search"
        placeholder={placeholder}
        aria-busy={loading || undefined}
        aria-keyshortcuts={keyshortcuts}
        tabIndex={expanded ? undefined : -1}
        aria-hidden={expanded ? undefined : true}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange?.(e)
          setValue(e.target.value)
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (e.defaultPrevented) return
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            onSearch?.(value)
          } else if (e.key === 'Escape') {
            if (value) {
              e.preventDefault()
              setValue('')
              onClear?.()
            } else if (expanding) {
              e.preventDefault()
              setOpen(false)
              setRefocus(true)
            }
          }
        }}
        onBlur={(e) => {
          onBlur?.(e)
          if (!expanding || rootRef.current?.contains(e.relatedTarget as Node | null)) return
          // Read the live value: a clear a moment ago may not have rendered yet.
          if (!e.currentTarget.value) setOpen(false)
        }}
        className={cn(
          'peer h-full w-full min-w-0 bg-transparent pl-8 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm',
          '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
          value || hint ? 'pr-9' : 'pr-3',
          hint && !value && shortcut === 'mod+k' && 'pr-14',
          !expanded && 'pointer-events-none opacity-0',
          inputClassName,
        )}
        {...props}
      />
      {value && expanded && (
        <button
          type="button"
          data-slot="search-field-clear"
          aria-label={clearLabel}
          aria-controls={inputId}
          disabled={disabled}
          onClick={clear}
          className="absolute right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:animate-in [&_svg]:size-3.5"
        >
          <XIcon aria-hidden />
        </button>
      )}
      {hint && !value && expanded && (
        <kbd
          aria-hidden
          data-slot="search-field-shortcut"
          className="pointer-events-none absolute right-2 rounded border bg-muted px-1.5 font-mono font-medium text-[11px] text-muted-foreground leading-5 transition-opacity peer-focus:opacity-0"
        >
          {hint}
        </kbd>
      )}
      {!expanded && (
        <button
          ref={buttonRef}
          type="button"
          data-slot="search-field-trigger"
          aria-label={props['aria-label'] ?? placeholder.replace(/…$/, '')}
          aria-expanded={false}
          aria-controls={inputId}
          aria-keyshortcuts={keyshortcuts}
          disabled={disabled}
          onClick={focusInput}
          className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      )}
    </div>
  )
}

export { SearchField }
