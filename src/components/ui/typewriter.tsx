'use client'

import * as React from 'react'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

export interface TypewriterProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  /** One or more strings. With several, each is typed, held, deleted, then the next one. */
  words: string | string[]
  /** Milliseconds per typed character. Default 70. */
  typeSpeed?: number
  /** Milliseconds per deleted character. Default 40. */
  deleteSpeed?: number
  /** Milliseconds a word stays before it is deleted. Default 1800. */
  pause?: number
  /** Go around again after the last word. Default true. */
  loop?: boolean
  /** Show the blinking cursor. Default true. */
  cursor?: boolean
  /** Milliseconds before typing starts. Default 0. */
  delay?: number
  /** Called each time a word is fully typed. */
  onWordTyped?: (word: string, index: number) => void
}

type Phase = 'typing' | 'deleting'

/**
 * Types text one character at a time, deletes it and moves on to the next word. Screen
 * readers get the current word in full, not the keystrokes.
 */
function Typewriter({
  words,
  typeSpeed = 70,
  deleteSpeed = 40,
  pause = 1800,
  loop = true,
  cursor = true,
  delay = 0,
  onWordTyped,
  className,
  ...props
}: TypewriterProps) {
  const list = React.useMemo(() => (Array.isArray(words) ? words : [words]), [words])
  const reduced = useReducedMotion()
  const [index, setIndex] = React.useState(0)
  const [length, setLength] = React.useState(0)
  const [phase, setPhase] = React.useState<Phase>('typing')
  const [started, setStarted] = React.useState(delay === 0)
  const typedRef = React.useRef(onWordTyped)
  typedRef.current = onWordTyped

  const word = list[index % list.length] ?? ''
  const last = index === list.length - 1

  React.useEffect(() => {
    if (started) return
    const t = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(t)
  }, [started, delay])

  React.useEffect(() => {
    if (!started || reduced) return
    let timer: ReturnType<typeof setTimeout>
    if (phase === 'typing') {
      if (length < word.length) {
        timer = setTimeout(() => setLength((l) => l + 1), typeSpeed)
      } else {
        typedRef.current?.(word, index)
        if (list.length === 1 || (last && !loop)) return
        timer = setTimeout(() => setPhase('deleting'), pause)
      }
    } else if (phase === 'deleting') {
      if (length > 0) {
        timer = setTimeout(() => setLength((l) => l - 1), deleteSpeed)
      } else {
        setIndex((i) => (i + 1) % list.length)
        setPhase('typing')
      }
    }
    return () => clearTimeout(timer)
  }, [
    started,
    reduced,
    phase,
    length,
    word,
    index,
    last,
    list.length,
    loop,
    typeSpeed,
    deleteSpeed,
    pause,
  ])

  const shown = reduced ? word : word.slice(0, length)
  // The cursor blinks while the word is held, and stays solid while characters move.
  const idle = reduced || (phase === 'typing' && length >= word.length)

  return (
    <span data-slot="typewriter" className={cn('inline-flex items-baseline', className)} {...props}>
      <span className="sr-only">{word}</span>
      <span aria-hidden data-slot="typewriter-text">
        {shown}
      </span>
      {cursor && (
        <span
          aria-hidden
          data-slot="typewriter-cursor"
          className={cn(
            'ml-px inline-block h-[1em] w-[2px] translate-y-[0.1em] bg-current',
            idle && 'animate-[blink_1s_steps(2)_infinite]',
          )}
        />
      )}
    </span>
  )
}

export { Typewriter }
