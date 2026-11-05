'use client'

import { CheckIcon } from 'lucide-react'
import * as React from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'

export interface InlineEditProps
  extends Omit<
    React.ComponentProps<'input'>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'size'
  > {
  /** Controlled saved value. */
  value?: string
  /** Starting value when uncontrolled. */
  defaultValue?: string
  /**
   * Store the new value. Return a promise to show a spinner until it settles; a rejection
   * keeps the field open with the error's message.
   */
  onSave?: (value: string) => unknown
  /** Called when an edit is thrown away with Escape. */
  onCancel?: () => void
  /** Return a message to refuse the draft and keep the field open. */
  validate?: (value: string) => string | null | undefined | false
  /** Controlled editing state. */
  editing?: boolean
  /** Called when the text turns into a field or back. */
  onEditingChange?: (editing: boolean) => void
  /** Shown, muted, when the value is empty. */
  placeholder?: string
  /** Select the whole text when the field opens. Default true. */
  selectOnEdit?: boolean
  /** Message used when `onSave` rejects with something that has none. */
  saveErrorMessage?: string
  /** Classes for the text and the field, which share them so nothing moves. */
  textClassName?: string
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<InlineEditLabels>
}

export interface InlineEditLabels {
  /** Shown, muted, when the value is empty. */
  placeholder: string
  /** Shown when `onSave` rejects with no message of its own. */
  saveError: string
  /** Announced while saving. */
  saving: string
  /** Announced once saved. */
  saved: string
}

export const defaultInlineEditLabels: InlineEditLabels = {
  placeholder: 'Empty',
  saveError: 'Could not save. Try again.',
  saving: 'Saving…',
  saved: 'Saved',
}

/**
 * Text that turns into a field where it stands. The field takes the font and size of the
 * text around it and the same box, so nothing on the page moves. Enter or leaving the field
 * saves, Escape puts the old text back.
 */
function InlineEdit({
  value: valueProp,
  defaultValue = '',
  onSave,
  onCancel,
  validate,
  editing: editingProp,
  onEditingChange,
  placeholder: placeholderProp,
  selectOnEdit = true,
  saveErrorMessage: saveErrorProp,
  labels: labelsProp,
  className,
  textClassName,
  id,
  name,
  disabled,
  readOnly,
  ref,
  onKeyDown,
  onBlur,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: InlineEditProps) {
  const labels = useLabels('inline-edit', defaultInlineEditLabels, labelsProp)
  const placeholder = placeholderProp ?? labels.placeholder
  const saveErrorMessage = saveErrorProp ?? labels.saveError
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const value = valueProp ?? uncontrolled
  const [editingState, setEditingState] = React.useState(false)
  const editing = editingProp ?? editingState
  const [draft, setDraft] = React.useState(value)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  const autoId = React.useId()
  const controlId = id ?? autoId
  const textId = `${autoId}-text`
  const nameId = `${autoId}-name`
  const errorId = `${autoId}-error`
  const inputRef = React.useRef<HTMLInputElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

  const setEditing = (next: boolean) => {
    if (editingProp === undefined) setEditingState(next)
    onEditingChange?.(next)
  }

  // Where focus goes after the mode flips: into the field, or back to the text.
  const focusNext = React.useRef<'input' | 'button' | null>(null)
  React.useLayoutEffect(() => {
    if (focusNext.current === 'input' && editing) {
      inputRef.current?.focus()
      if (selectOnEdit) inputRef.current?.select()
    } else if (focusNext.current === 'button' && !editing) {
      buttonRef.current?.focus()
    }
    focusNext.current = null
  }, [editing, selectOnEdit])

  // A controlled `editing` that turns on from outside still starts from the saved text.
  const wasEditing = React.useRef(editing)
  React.useEffect(() => {
    if (editing && !wasEditing.current) {
      setDraft(value)
      if (!focusNext.current) {
        inputRef.current?.focus()
        if (selectOnEdit) inputRef.current?.select()
      }
    }
    wasEditing.current = editing
  }, [editing, value, selectOnEdit])

  React.useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 1200)
    return () => clearTimeout(t)
  }, [saved])

  // Set once the edit is settled from a key, so the blur as the field goes away does not save again.
  const settled = React.useRef(false)

  const start = () => {
    if (disabled || readOnly) return
    settled.current = false
    setDraft(value)
    setError(null)
    setSaved(false)
    focusNext.current = 'input'
    setEditing(true)
  }

  const finish = (refocus: boolean) => {
    settled.current = true
    if (refocus) focusNext.current = 'button'
    setEditing(false)
  }

  const cancel = (refocus: boolean) => {
    setDraft(value)
    setError(null)
    onCancel?.()
    finish(refocus)
  }

  const save = async (refocus: boolean) => {
    if (pending) return
    if (draft === value) return finish(refocus)
    const message = validate?.(draft)
    if (message) {
      setError(message)
      return
    }
    setError(null)
    const result = onSave?.(draft)
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setPending(true)
      try {
        await result
      } catch (err) {
        setPending(false)
        setError(err instanceof Error && err.message ? err.message : saveErrorMessage)
        inputRef.current?.focus()
        return
      }
      setPending(false)
      setSaved(true)
    }
    if (valueProp === undefined) setUncontrolled(draft)
    finish(refocus)
  }

  // The text and the field share every metric, so swapping one for the other moves nothing.
  const shared = cn(
    'relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-[min(0px,calc((100%_-_44px)/2))] pointer-coarse:after:inset-y-[min(0px,calc((100%_-_44px)/2))] col-start-1 row-start-1 m-0 min-w-[1ch] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-left text-inherit [font:inherit] [letter-spacing:inherit]',
    textClassName,
  )

  const shown = editing ? draft : value
  const invalid = ariaInvalid ?? (error ? true : undefined)
  const labelled = labelledBy ?? (ariaLabel ? nameId : undefined)

  return (
    <span
      data-slot="inline-edit"
      data-editing={editing ? '' : undefined}
      data-pending={pending ? '' : undefined}
      className={cn('relative -mx-1 inline-grid max-w-full align-baseline', className)}
    >
      {ariaLabel && (
        <span id={nameId} hidden>
          {ariaLabel}
        </span>
      )}
      {/* Sizes the grid cell to the text, so the field is exactly as wide as what it holds. */}
      <span aria-hidden className={cn(shared, 'invisible whitespace-pre')}>
        {shown || placeholder}
        {/* Room for the caret at the end of the line. */}
        {editing && '\u00a0'}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          id={controlId}
          type="text"
          // An input sizes itself to 20 characters by default; the grid cell should decide instead.
          size={1}
          data-slot="inline-edit-input"
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={pending}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-invalid={invalid}
          aria-busy={pending || undefined}
          aria-describedby={
            [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
          }
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            onKeyDown?.(e)
            if (e.defaultPrevented || e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              e.preventDefault()
              void save(true)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel(true)
            }
          }}
          onBlur={(e) => {
            onBlur?.(e)
            if (!pending && !settled.current) void save(false)
          }}
          className={cn(
            shared,
            'w-full min-w-0 border-input bg-background shadow-xs outline-none transition-[border-color,box-shadow] duration-(--duration-fast,150ms) placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 motion-reduce:transition-none dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
          )}
          {...props}
        />
      ) : readOnly ? (
        <span
          id={controlId}
          data-slot="inline-edit-text"
          className={cn(shared, 'truncate whitespace-pre')}
        >
          <span id={textId} className={cn(!value && 'text-muted-foreground')}>
            {value || placeholder}
          </span>
        </span>
      ) : (
        <button
          ref={buttonRef}
          id={controlId}
          type="button"
          data-slot="inline-edit-text"
          disabled={disabled}
          // The name alone would hide the value, so read both: "Project name, Acme".
          aria-labelledby={labelled ? `${labelled} ${textId}` : undefined}
          aria-describedby={describedBy}
          aria-invalid={ariaInvalid}
          onClick={start}
          className={cn(
            shared,
            'cursor-text truncate whitespace-pre outline-none transition-[background-color,border-color,box-shadow] duration-(--duration-fast,150ms) hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
          )}
        >
          <span id={textId} className={cn(!value && 'text-muted-foreground')}>
            {value || placeholder}
          </span>
        </button>
      )}
      {/* Status sits outside the box, so showing it never pushes the text. */}
      {(pending || saved) && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-full ml-1.5 flex -translate-y-1/2 text-muted-foreground [&_svg]:size-4"
        >
          {pending ? (
            <Spinner aria-hidden />
          ) : (
            <CheckIcon className="text-emerald-600 motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:animate-in dark:text-emerald-400" />
          )}
        </span>
      )}
      <span aria-live="polite" className="sr-only">
        {pending ? labels.saving : saved ? labels.saved : ''}
      </span>
      {error && editing && (
        <span
          id={errorId}
          data-slot="inline-edit-error"
          className="absolute top-full left-1 mt-1 whitespace-nowrap font-normal text-destructive text-xs leading-none tracking-normal"
        >
          {error}
        </span>
      )}
      {name && <input type="hidden" name={name} value={value} />}
    </span>
  )
}

export { InlineEdit }
