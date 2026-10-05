import { CheckIcon, CopyIcon, WrapTextIcon } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CodeBlockProps extends Omit<React.ComponentProps<'figure'>, 'children'> {
  /** The source. Copied as it is, and shown in plain monospace when nothing highlighted is given. */
  code: string
  /**
   * Highlighted HTML of the same code, one line of source per line of HTML, as shiki's
   * `codeToHtml` returns it. A wrapping `<pre><code>` is dropped. Only pass HTML you trust.
   */
  html?: string
  /** Highlighted lines as React nodes, one per line of source. Takes precedence over `html`. */
  lines?: React.ReactNode[]
  /** File name in the header, like `app/page.tsx`. */
  filename?: React.ReactNode
  /** Language shown in the header, like `tsx`. */
  language?: string
  /** Numbers in the gutter. Default true. */
  lineNumbers?: boolean
  /** Number of the first line. Default 1. */
  startLine?: number
  /** Lines to mark, as a list like `"3-5,8"` or an array, in the numbers the gutter shows. */
  highlight?: string | number[]
  /** Start with long lines wrapped instead of scrolling sideways. Default false. */
  wrap?: boolean
  /** A button that switches wrapping. Default true. */
  wrapToggle?: boolean
  /** A copy button. Default true. */
  copyable?: boolean
  /** Lines shown before the block collapses behind a "Show all" button. `false` never collapses. Default 20. */
  maxLines?: number | false
}

/** `"3-5,8"` → {3, 4, 5, 8}. */
export function parseLineRanges(input: string | number[] | undefined): Set<number> {
  if (!input) return new Set()
  if (Array.isArray(input)) return new Set(input)
  const out = new Set<number>()
  for (const part of input.split(',')) {
    const [a, b] = part.split('-').map((n) => Number.parseInt(n.trim(), 10))
    if (a === undefined || Number.isNaN(a)) continue
    const end = b === undefined || Number.isNaN(b) ? a : b
    for (let n = Math.min(a, end); n <= Math.max(a, end); n++) out.add(n)
  }
  return out
}

/** The lines of highlighted HTML, without a wrapping `<pre><code>`. */
function splitHtml(html: string) {
  const inner = /<code[^>]*>([\s\S]*)<\/code>/.exec(html)?.[1] ?? html
  return inner.replace(/\n$/, '').split('\n')
}

// Pixels per line and the block's vertical padding, for the collapsed height.
const LINE = 24
const PAD = 12

/**
 * Code with a header, line numbers, marked lines, a wrap switch and a copy button, collapsed
 * when long. It does no highlighting itself: pass `html` or `lines` from shiki or any other
 * highlighter, or nothing for plain monospace.
 */
function CodeBlock({
  code,
  html,
  lines,
  filename,
  language,
  lineNumbers = true,
  startLine = 1,
  highlight,
  wrap: initialWrap = false,
  wrapToggle = true,
  copyable = true,
  maxLines = 20,
  className,
  ...props
}: CodeBlockProps) {
  const id = React.useId()
  const [wrap, setWrap] = React.useState(initialWrap)
  const [expanded, setExpanded] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const source = code.replace(/\n$/, '').split('\n')
  const htmlLines = React.useMemo(() => (html && !lines ? splitHtml(html) : null), [html, lines])
  const marked = React.useMemo(() => parseLineRanges(highlight), [highlight])
  const count = source.length
  const collapsible = maxLines !== false && count > maxLines + 2
  const collapsed = collapsible && !expanded
  const gutter = `${String(startLine + count - 1).length}ch`

  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // The clipboard can be blocked by the page's permissions; the code stays selectable.
    }
  }

  const actions = (wrapToggle || copyable) && (
    <div className="flex items-center gap-0.5">
      {wrapToggle && (
        <button
          type="button"
          aria-pressed={wrap}
          aria-label="Wrap lines"
          title="Wrap lines"
          onClick={() => setWrap((w) => !w)}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:bg-accent aria-pressed:text-foreground"
        >
          <WrapTextIcon aria-hidden className="size-4" />
        </button>
      )}
      {copyable && (
        <button
          type="button"
          aria-label={copied ? 'Copied' : 'Copy code'}
          title="Copy code"
          onClick={copy}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {copied ? (
            <CheckIcon aria-hidden className="size-4" />
          ) : (
            <CopyIcon aria-hidden className="size-4" />
          )}
        </button>
      )}
    </div>
  )

  const header = filename !== undefined || language !== undefined

  return (
    <figure
      data-slot="code-block"
      className={cn(
        'group/code relative m-0 min-w-0 overflow-hidden rounded-lg border bg-muted/30 text-sm',
        className,
      )}
      {...props}
    >
      {header ? (
        <figcaption className="flex min-h-10 items-center justify-between gap-3 border-b py-1 pr-1.5 pl-4">
          <span className="min-w-0 truncate font-mono text-muted-foreground text-xs">
            {filename}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {language && (
              <span className="rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground uppercase leading-none">
                {language}
              </span>
            )}
            {actions}
          </span>
        </figcaption>
      ) : (
        actions && (
          <div className="absolute top-1.5 right-1.5 z-(--z-raised,10) rounded-md bg-background/80 opacity-0 backdrop-blur-sm transition-opacity focus-within:opacity-100 group-hover/code:opacity-100 [@media(hover:none)]:opacity-100">
            {actions}
          </div>
        )
      )}

      <section
        id={id}
        aria-label={
          typeof filename === 'string' ? filename : language ? `${language} code` : 'Code'
        }
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a region that scrolls has to be focusable, or the end of long lines is out of reach by keyboard
        tabIndex={0}
        className={cn(
          'overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
          collapsed && 'overflow-y-hidden',
        )}
        style={{ maxHeight: collapsed ? (maxLines as number) * LINE + PAD : undefined }}
      >
        <pre className="m-0 font-mono text-[13px] leading-6" style={{ paddingBlock: PAD }}>
          <code
            className={cn(
              'grid',
              wrap ? 'w-full' : 'w-max min-w-full',
              // Shiki's dual themes write both colors as variables; pick the one for the mode.
              '[&_[style*=--shiki-light]]:text-(--shiki-light) dark:[&_[style*=--shiki-dark]]:text-(--shiki-dark)',
            )}
          >
            {source.map((text, i) => {
              const n = startLine + i
              const on = marked.has(n)
              const content = lines ? lines[i] : htmlLines ? undefined : text
              return (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                  key={i}
                  data-line={n}
                  data-highlighted={on || undefined}
                  className={cn(
                    'flex px-4',
                    on &&
                      'bg-primary/[0.06] shadow-[inset_2px_0_0_var(--primary)] dark:bg-primary/10',
                  )}
                >
                  {lineNumbers && (
                    <span
                      aria-hidden
                      className={cn(
                        'mr-4 shrink-0 select-none text-right tabular-nums',
                        on ? 'text-foreground' : 'text-muted-foreground/60',
                      )}
                      style={{ width: gutter }}
                    >
                      {n}
                    </span>
                  )}
                  {htmlLines && !lines ? (
                    <span
                      className={cn(
                        'min-w-0 flex-1',
                        wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
                      )}
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: highlighter output the app passes in, documented as trusted
                      dangerouslySetInnerHTML={{ __html: htmlLines[i] || ' ' }}
                    />
                  ) : (
                    <span
                      className={cn(
                        'min-w-0 flex-1',
                        wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
                      )}
                    >
                      {content === '' || content === undefined ? ' ' : content}
                    </span>
                  )}
                </span>
              )
            })}
          </code>
        </pre>
      </section>

      {collapsible && (
        <div
          className={cn(
            'flex justify-center',
            collapsed
              ? 'absolute inset-x-0 bottom-0 h-20 items-end bg-linear-to-t from-background via-background/80 to-transparent pb-3'
              : 'border-t py-2',
          )}
        >
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded((e) => !e)}
            className="rounded-full border bg-background px-3 py-1 font-medium text-xs shadow-xs outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {expanded ? 'Show less' : `Show all ${count} lines`}
          </button>
        </div>
      )}
    </figure>
  )
}

export { CodeBlock }
