import * as React from 'react'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

export interface TextMorphProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  /** The text. Every change morphs from the previous one. */
  children: string
  /** Element to render. Default `span`. */
  as?: 'span' | 'div' | 'p' | 'strong' | 'h1' | 'h2' | 'h3' | 'h4'
  /** Milliseconds a morph takes. Default 450. */
  duration?: number
  /** Milliseconds between new letters appearing. Default 18. */
  stagger?: number
}

interface Glyph {
  key: string
  char: string
}

interface Leaving {
  id: number
  text: string
  left: number
}

/** Letters are matched by character and occurrence: the second "o" pairs with the second "o". */
function toGlyphs(text: string): Glyph[] {
  const seen = new Map<string, number>()
  return Array.from(text).map((char) => {
    const n = seen.get(char) ?? 0
    seen.set(char, n + 1)
    return { key: `${char}:${n}`, char }
  })
}

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const show = (char: string) => (char === ' ' ? ' ' : char)

/** The horizontal offset an element's running animation has it at right now. */
function currentShift(el: HTMLElement) {
  if (typeof DOMMatrixReadOnly === 'undefined') return 0
  const transform = getComputedStyle(el).transform
  return !transform || transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41
}

function LeavingText({
  item,
  duration,
  reduced,
  onDone,
}: {
  item: Leaving
  duration: number
  reduced: boolean
  onDone: (id: number) => void
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof el.animate !== 'function') {
      onDone(item.id)
      return
    }
    const animation = el.animate(
      reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 1, transform: 'none', filter: 'blur(0)' },
            { opacity: 0, transform: 'translateY(-0.25em) scale(0.9)', filter: 'blur(2px)' },
          ],
      { duration: reduced ? 200 : duration * 0.55, easing: EASE, fill: 'forwards' },
    )
    animation.onfinish = () => onDone(item.id)
    return () => animation.cancel()
  }, [item.id, duration, reduced, onDone])
  return (
    <span
      ref={ref}
      className="pointer-events-none absolute top-0 whitespace-pre"
      style={{ left: item.left }}
    >
      {Array.from(item.text).map(show).join('')}
    </span>
  )
}

/**
 * Morphs a label into its next value letter by letter: letters both share slide to their new
 * place, the others fade in or out, and the width follows. For buttons and status text, like
 * Save, Saving, Saved. Screen readers get the plain text; reduced motion crossfades instead.
 */
function TextMorph({
  children,
  as: Tag = 'span',
  duration = 450,
  stagger = 18,
  className,
  ...props
}: TextMorphProps) {
  const text = children
  const reduced = useReducedMotion()
  const glyphs = React.useMemo(() => toGlyphs(text), [text])
  const frameRef = React.useRef<HTMLSpanElement>(null)
  const trackRef = React.useRef<HTMLSpanElement>(null)
  const glyphRefs = React.useRef(new Map<string, HTMLSpanElement>())
  const last = React.useRef<{ text: string; left: Map<string, number>; width: number } | null>(null)
  const nextId = React.useRef(0)
  const [leaving, setLeaving] = React.useState<Leaving[]>([])
  const done = React.useCallback(
    (id: number) => setLeaving((items) => items.filter((item) => item.id !== id)),
    [],
  )

  React.useLayoutEffect(() => {
    const frame = frameRef.current
    const track = trackRef.current
    if (!frame || !track) return
    const left = new Map<string, number>()
    for (const [key, el] of glyphRefs.current) left.set(key, el.offsetLeft)
    const width = track.offsetWidth
    const prev = last.current
    last.current = { text, left, width }
    if (!prev || prev.text === text || typeof frame.animate !== 'function') return

    // The width keeps going from wherever a morph in flight has it.
    const running = frame.getAnimations().length > 0
    const fromWidth = running ? frame.getBoundingClientRect().width : prev.width
    for (const a of frame.getAnimations()) a.cancel()
    if (Math.abs(fromWidth - width) > 0.5) {
      frame.animate([{ width: `${fromWidth}px` }, { width: `${width}px` }], {
        duration: reduced ? 200 : duration,
        easing: EASE,
      })
    }

    if (reduced) {
      setLeaving((items) => [...items, { id: nextId.current++, text: prev.text, left: 0 }])
      track.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
      return
    }

    const kept = new Set<string>()
    let entering = 0
    for (const glyph of toGlyphs(text)) {
      const el = glyphRefs.current.get(glyph.key)
      if (!el) continue
      const from = prev.left.get(glyph.key)
      if (from !== undefined) {
        kept.add(glyph.key)
        const dx = from + currentShift(el) - (left.get(glyph.key) ?? 0)
        for (const a of el.getAnimations()) a.cancel()
        if (Math.abs(dx) > 0.5) {
          el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], {
            duration,
            easing: EASE,
          })
        }
      } else {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(0.25em) scale(0.9)', filter: 'blur(2px)' },
            { opacity: 1, transform: 'none', filter: 'blur(0)' },
          ],
          {
            duration: duration * 0.8,
            delay: duration * 0.15 + Math.min(entering++, 10) * stagger,
            easing: EASE,
            fill: 'backwards',
          },
        )
      }
    }
    const gone = toGlyphs(prev.text).filter((g) => !kept.has(g.key))
    if (gone.length) {
      setLeaving((items) => [
        ...items,
        ...gone.map((g) => ({
          id: nextId.current++,
          text: g.char,
          left: prev.left.get(g.key) ?? 0,
        })),
      ])
    }
  }, [text, reduced, duration, stagger])

  return (
    <Tag data-slot="text-morph" className={cn(className)} {...props}>
      <span className="sr-only">{text}</span>
      <span ref={frameRef} aria-hidden className="relative inline-block whitespace-nowrap">
        <span ref={trackRef} className="inline-flex">
          {glyphs.map((glyph) => (
            <span
              key={glyph.key}
              ref={(el) => {
                if (el) glyphRefs.current.set(glyph.key, el)
                else glyphRefs.current.delete(glyph.key)
              }}
              className="inline-block whitespace-pre"
            >
              {show(glyph.char)}
            </span>
          ))}
        </span>
        {leaving.map((item) => (
          <LeavingText
            key={item.id}
            item={item}
            duration={duration}
            reduced={reduced}
            onDone={done}
          />
        ))}
      </span>
    </Tag>
  )
}

export { TextMorph }
