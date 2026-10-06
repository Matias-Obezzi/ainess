'use client'

import { CheckIcon, EyeIcon, EyeOffIcon, XIcon } from 'lucide-react'
import * as React from 'react'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'

export interface PasswordStrength {
  /** 0 for an empty password, then 1 (weak) to 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4
  /** The level in words: "Weak", "Fair", "Good" or "Strong". Empty for score 0. */
  label: string
  /** The one change that would help most, if any. */
  hint?: string
}

export interface PasswordRule {
  /** What the rule asks for, shown in the checklist. */
  label: string
  /** True when the password meets it. */
  test: (password: string) => boolean
}

export interface PasswordFieldLabels {
  /** Name of the eye button. It stays the same and `aria-pressed` says the state. */
  reveal: string
  /** Name of the strength meter. */
  strength: string
  /** What the meter reads for an empty password. */
  empty: string
  /** The four levels. */
  weak: string
  fair: string
  good: string
  strong: string
  /** The hints of the built in scorer, the one that would help most first. */
  avoidCommon: string
  useLength: string
  avoidSequences: string
  avoidRepeats: string
  mixCharacters: string
  addLength: string
  /** The default rules. Your own rules keep their own `label`. */
  ruleLength: string
  ruleCase: string
  ruleNumber: string
  ruleSymbol: string
}

export const defaultPasswordFieldLabels: PasswordFieldLabels = {
  reveal: 'Show password',
  strength: 'Password strength',
  empty: 'Empty',
  weak: 'Weak',
  fair: 'Fair',
  good: 'Good',
  strong: 'Strong',
  avoidCommon: 'Avoid common passwords and words.',
  useLength: 'Use at least 12 characters.',
  avoidSequences: 'Avoid runs like abcd or 1234.',
  avoidRepeats: 'Avoid repeating the same character.',
  mixCharacters: 'Mix in capitals, numbers or symbols.',
  addLength: 'A few more characters would make it strong.',
  ruleLength: 'At least 12 characters',
  ruleCase: 'A lowercase and an uppercase letter',
  ruleNumber: 'A number',
  ruleSymbol: 'A symbol',
}

const LEVELS = ['', 'weak', 'fair', 'good', 'strong'] as const

// The handful everyone tries first. A real check against breached passwords belongs on the
// server; this only catches the obvious ones while typing.
const COMMON = [
  'password',
  'passw0rd',
  'qwerty',
  'letmein',
  'welcome',
  'admin',
  'iloveyou',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'master',
  'login',
  'abc123',
  '123456',
  '111111',
  'secret',
]

const SEQUENCES = [
  'abcdefghijklmnopqrstuvwxyz',
  '01234567890',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
]

function hasSequence(password: string, length = 4) {
  const lower = password.toLowerCase()
  for (const seq of SEQUENCES) {
    const both = [seq, [...seq].reverse().join('')]
    for (const s of both) {
      for (let i = 0; i + length <= s.length; i++) {
        if (lower.includes(s.slice(i, i + length))) return true
      }
    }
  }
  return false
}

/**
 * A quick strength estimate from length, character variety and the patterns people lean on:
 * common words, keyboard runs and repeats. Good enough to guide someone while they type; it
 * is not a substitute for checking against breached passwords on the server.
 */
function getPasswordStrength(
  password: string,
  labels: PasswordFieldLabels = defaultPasswordFieldLabels,
): PasswordStrength {
  if (!password) return { score: 0, label: '' }

  const length = password.length
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(password)).length

  let points = 0
  if (length >= 8) points++
  if (length >= 12) points++
  if (length >= 16) points++
  if (classes >= 3) points++
  if (classes === 4) points++

  const lower = password.toLowerCase()
  const common = COMMON.some((word) => lower.includes(word))
  const repeats = /(.)\1{2,}/.test(password)
  const sequence = hasSequence(password)
  if (repeats) points--
  if (sequence) points--

  let score = (
    points <= 1 ? 1 : points === 2 ? 2 : points <= 4 ? 3 : 4
  ) as PasswordStrength['score']
  if (common) score = 1

  let hint: string | undefined
  if (common) hint = labels.avoidCommon
  else if (length < 12) hint = labels.useLength
  else if (sequence) hint = labels.avoidSequences
  else if (repeats) hint = labels.avoidRepeats
  else if (classes < 3) hint = labels.mixCharacters
  else if (score < 4) hint = labels.addLength

  const level = LEVELS[score]
  return { score, label: level ? labels[level] : '', hint }
}

/** A sensible checklist to start from. */
const defaultPasswordRules: PasswordRule[] = [
  { label: 'At least 12 characters', test: (p) => p.length >= 12 },
  { label: 'A lowercase and an uppercase letter', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
  { label: 'A symbol', test: (p) => /[^a-zA-Z\d]/.test(p) },
]

/** The label key of each default rule, so the default checklist follows the labels. */
const ruleKeys = new Map<PasswordRule, keyof PasswordFieldLabels>(
  (['ruleLength', 'ruleCase', 'ruleNumber', 'ruleSymbol'] as const).map((key, i) => [
    defaultPasswordRules[i] as PasswordRule,
    key,
  ]),
)

const barColor = ['', 'bg-destructive', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500']

export interface PasswordFieldProps
  extends Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'defaultValue'> {
  /** Controlled value. */
  value?: string
  /** Starting value when uncontrolled. */
  defaultValue?: string
  /** Called with the new text on every change. */
  onValueChange?: (value: string) => void
  /** Show the strength meter and hint under the field. */
  strength?: boolean
  /** Replace the built in scorer, for zxcvbn or your own rules. Gets the labels as well. */
  getStrength?: (password: string, labels: PasswordFieldLabels) => PasswordStrength
  /** Show a checklist under the field. `true` uses the default rules. */
  rules?: boolean | PasswordRule[]
  /** Controlled reveal state. */
  revealed?: boolean
  /** Starting reveal state when uncontrolled. */
  defaultRevealed?: boolean
  /** Called when the eye button is pressed. */
  onRevealedChange?: (revealed: boolean) => void
  /** Accessible name of the eye button. It stays the same and `aria-pressed` says the state. Default "Show password". */
  revealLabel?: string
  /** Classes for the input itself. `className` goes on the outer wrapper. */
  inputClassName?: string
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<PasswordFieldLabels>
}

/**
 * A password input with a button that shows what was typed, and optionally a strength meter
 * and a checklist of rules. The meter and the checklist are linked to the input, so a screen
 * reader hears them with it.
 */
function PasswordField({
  value: valueProp,
  defaultValue = '',
  onValueChange,
  strength = false,
  getStrength = getPasswordStrength,
  rules,
  revealed: revealedProp,
  defaultRevealed = false,
  onRevealedChange,
  revealLabel: revealProp,
  labels: labelsProp,
  className,
  inputClassName,
  id,
  disabled,
  autoComplete,
  ref,
  onChange,
  'aria-describedby': describedBy,
  ...props
}: PasswordFieldProps) {
  const labels = useLabels('password-field', defaultPasswordFieldLabels, labelsProp)
  const revealLabel = revealProp ?? labels.reveal
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const value = valueProp ?? uncontrolled
  const [revealedState, setRevealedState] = React.useState(defaultRevealed)
  const revealed = revealedProp ?? revealedState

  const autoId = React.useId()
  const inputId = id ?? autoId
  const meterId = `${autoId}-strength`
  const rulesId = `${autoId}-rules`

  const inputRef = React.useRef<HTMLInputElement>(null)
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

  const toggle = () => {
    const next = !revealed
    if (revealedProp === undefined) setRevealedState(next)
    onRevealedChange?.(next)
  }

  // Never let a browser remember or submit the field while it is a plain text input.
  React.useEffect(() => {
    const form = inputRef.current?.form
    if (!form || revealedProp !== undefined) return
    const hide = () => setRevealedState(false)
    form.addEventListener('submit', hide)
    return () => form.removeEventListener('submit', hide)
  }, [revealedProp])

  const ruleList = rules === true ? defaultPasswordRules : rules || []
  const ruleLabel = (rule: PasswordRule) => {
    const key = ruleKeys.get(rule)
    return key ? labels[key] : rule.label
  }
  const result = strength ? getStrength(value, labels) : null

  return (
    <div data-slot="password-field" className={cn('flex w-full min-w-0 flex-col gap-2', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type={revealed ? 'text' : 'password'}
          data-slot="password-field-input"
          // A meter or rules mean a password is being chosen, so offer to generate one.
          autoComplete={autoComplete ?? (strength || rules ? 'new-password' : 'current-password')}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            onChange?.(e)
            if (valueProp === undefined) setUncontrolled(e.target.value)
            onValueChange?.(e.target.value)
          }}
          aria-describedby={
            [
              describedBy,
              strength && value ? meterId : undefined,
              ruleList.length ? rulesId : undefined,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          className={cn(
            'flex h-9 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-10 pl-3 text-base shadow-xs outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
            // Edge and old IE draw their own eye; ours already does the job.
            '[&::-ms-reveal]:hidden',
            inputClassName,
          )}
          {...props}
        />
        <button
          type="button"
          data-slot="password-field-toggle"
          aria-label={revealLabel}
          aria-pressed={revealed}
          aria-controls={inputId}
          disabled={disabled}
          onClick={toggle}
          // Keep focus, and the caret, in the field when clicked with a mouse.
          onPointerDown={(e) => e.preventDefault()}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="relative size-4" aria-hidden>
            <EyeIcon
              className={cn(
                'absolute inset-0 size-4 transition-[opacity,scale] duration-(--duration-fast,150ms) motion-reduce:transition-none',
                revealed ? 'scale-75 opacity-0' : 'scale-100 opacity-100',
              )}
            />
            <EyeOffIcon
              className={cn(
                'absolute inset-0 size-4 transition-[opacity,scale] duration-(--duration-fast,150ms) motion-reduce:transition-none',
                revealed ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
              )}
            />
          </span>
        </button>
      </div>

      {result && (
        <PasswordStrengthMeter id={meterId} strength={result} labels={labelsProp} hidden={!value} />
      )}

      {ruleList.length > 0 && (
        <ul id={rulesId} data-slot="password-field-rules" className="grid gap-1 text-sm">
          {ruleList.map((rule) => {
            const met = rule.test(value)
            return (
              <li
                key={rule.label}
                data-met={met ? '' : undefined}
                className="flex items-center gap-2 text-muted-foreground transition-colors data-[met]:text-foreground"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,color] duration-(--duration-fast,150ms) motion-reduce:transition-none [&_svg]:size-2.5',
                    met
                      ? 'border-transparent bg-emerald-500 text-white'
                      : 'border-input text-muted-foreground',
                  )}
                >
                  {met ? <CheckIcon strokeWidth={3} /> : <XIcon strokeWidth={3} />}
                </span>
                {ruleLabel(rule)}
                <span className="sr-only">{met ? ', done' : ', not yet'}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The four segment bar with its label and hint. Exported for a meter placed elsewhere. */
function PasswordStrengthMeter({
  strength,
  labels: labelsProp,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  strength: PasswordStrength
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<PasswordFieldLabels>
}) {
  const labels = useLabels('password-field', defaultPasswordFieldLabels, labelsProp)
  const { score, label, hint } = strength
  return (
    <div
      data-slot="password-strength"
      data-score={score}
      className={cn('grid gap-1.5', className)}
      {...props}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: four separate segments, which a native meter cannot draw */}
      <div
        role="meter"
        aria-label={labels.strength}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        aria-valuetext={label || labels.empty}
        className="grid grid-cols-4 gap-1"
      >
        {[1, 2, 3, 4].map((level) => (
          <span key={level} className="relative h-1 overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                'absolute inset-0 origin-left rounded-full transition-[scale,background-color] duration-(--duration-normal,200ms) ease-(--easing-emphasized,cubic-bezier(0.16,1,0.3,1)) motion-reduce:transition-none',
                barColor[score],
                score >= level ? 'scale-x-100' : 'scale-x-0',
              )}
            />
          </span>
        ))}
      </div>
      {/* Polite, and only the level and hint change, so it speaks when the level moves, not on every key. */}
      <p aria-live="polite" className="flex flex-wrap gap-x-2 text-muted-foreground text-xs">
        {label && <span className="font-medium text-foreground">{label}</span>}
        {hint && <span>{hint}</span>}
      </p>
    </div>
  )
}

export { defaultPasswordRules, getPasswordStrength, PasswordField, PasswordStrengthMeter }
