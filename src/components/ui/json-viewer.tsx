import {
  CheckIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  LinkIcon,
  SearchIcon,
} from 'lucide-react'
import * as React from 'react'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type JsonType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'other'

export interface JsonCopyDetail {
  /** What was copied: the value as JSON, or its path. */
  kind: 'value' | 'path'
  /** Path of the node, like `root.users[0].name`. */
  path: string
  /** The text put on the clipboard. */
  text: string
}

export interface JsonViewerLabels {
  /** Placeholder and name of the search field. */
  search: string
  /** Where the current match is among all of them. */
  match: (current: number, total: number) => string
  noMatches: string
  expandAll: string
  collapseAll: string
  /** Name of the tree when no `aria-label` is given. */
  tree: string
  /** How many children a branch holds. */
  size: (count: number, type: 'array' | 'object') => string
  /** The type of a branch, read with its name. */
  array: string
  object: string
  /** The row that loads the next page of a long branch. */
  showMore: (count: number) => string
  /** After it, how many are still hidden. */
  left: (count: number) => string
  copyValue: (path: string) => string
  copyPath: (path: string) => string
  /** Tooltips of the copy buttons, with their key. */
  copyValueHint: string
  copyPathHint: string
  /** Announced after a copy. */
  valueCopied: string
  pathCopied: string
}

export const defaultJsonViewerLabels: JsonViewerLabels = {
  search: 'Search keys and values',
  match: (current, total) => `${current} of ${total}`,
  noMatches: 'No matches',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  tree: 'JSON',
  size: (count, type) =>
    `${count} ${type === 'array' ? (count === 1 ? 'item' : 'items') : count === 1 ? 'key' : 'keys'}`,
  array: 'array',
  object: 'object',
  showMore: (count) => `Show ${count} more`,
  left: (count) => `${count} left`,
  copyValue: (path) => `Copy value of ${path}`,
  copyPath: (path) => `Copy path ${path}`,
  copyValueHint: 'Copy value (c)',
  copyPathHint: 'Copy path (p)',
  valueCopied: 'Value copied',
  pathCopied: 'Path copied',
}

export interface JsonViewerProps extends Omit<React.ComponentProps<'div'>, 'children' | 'onCopy'> {
  /** Any JSON value: an object, an array or a primitive. */
  data: unknown
  /** Name of the root in paths, as in `root.users[0].name`. Default "root". */
  rootName?: string
  /** Levels open on the first render. Default 1, the root's children. */
  defaultExpandDepth?: number
  /** Search field over keys and values. Default true. */
  searchable?: boolean
  /** Children shown at once in a long array or object; the rest load a page at a time. Default 100. */
  pageSize?: number
  /** Copy value and copy path buttons on each row. Default true. */
  copyable?: boolean
  /** Called after something was copied. */
  onCopy?: (detail: JsonCopyDetail) => void
  /** Height the tree scrolls past, in pixels or any CSS length. Default 384. */
  maxHeight?: number | string
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<JsonViewerLabels>
}

interface NodeRow {
  kind: 'node'
  id: string
  level: number
  name: string | number | null
  value: unknown
  type: JsonType
  size: number
  parent: string | null
  pos: number
  setSize: number
}

interface MoreRow {
  kind: 'more'
  id: string
  level: number
  parent: string
  remaining: number
  pos: number
  setSize: number
}

type Row = NodeRow | MoreRow

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

function typeOf(value: unknown): JsonType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  const t = typeof value
  if (t === 'object') return 'object'
  if (t === 'string' || t === 'number' || t === 'boolean') return t
  return 'other'
}

const childPath = (parent: string, key: string | number) =>
  typeof key === 'number'
    ? `${parent}[${key}]`
    : IDENTIFIER.test(key)
      ? `${parent}.${key}`
      : `${parent}[${JSON.stringify(key)}]`

function entriesOf(value: unknown): [string | number, unknown][] {
  if (Array.isArray(value)) return value.map((v, i) => [i, v])
  if (value && typeof value === 'object') return Object.entries(value)
  return []
}

const isBranch = (type: JsonType) => type === 'object' || type === 'array'

const primitiveText = (value: unknown, type: JsonType) =>
  type === 'string' ? JSON.stringify(value) : String(value)

function copyText(value: unknown, type: JsonType) {
  if (type === 'string') return value as string
  if (type === 'other') return String(value)
  return JSON.stringify(value, null, 2)
}

// Search walks the whole document; past this many nodes it stops, so a huge payload never hangs.
const SEARCH_LIMIT = 50_000

const typeColor: Record<JsonType, string> = {
  string: 'text-emerald-700 dark:text-emerald-400',
  number: 'text-sky-700 dark:text-sky-400',
  boolean: 'text-violet-700 dark:text-violet-400',
  null: 'text-muted-foreground italic',
  other: 'text-muted-foreground',
  object: 'text-muted-foreground',
  array: 'text-muted-foreground',
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const lower = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let at = 0
  let i = lower.indexOf(query)
  while (i !== -1) {
    if (i > at) parts.push(text.slice(at, i))
    parts.push(
      <mark
        key={i}
        className="rounded-[2px] bg-amber-200 text-inherit dark:bg-amber-400/30 dark:text-foreground"
      >
        {text.slice(i, i + query.length)}
      </mark>,
    )
    at = i + query.length
    i = lower.indexOf(query, at)
  }
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}

/**
 * A collapsible JSON tree. Values are colored by type, search highlights matches and opens the
 * branches that hold them, long arrays load a page at a time, and every row copies its value or
 * its path. Follows the tree pattern: arrows move and open, Home and End jump, Enter toggles,
 * `c` copies the value and `p` the path.
 */
function JsonViewer({
  data,
  rootName = 'root',
  defaultExpandDepth = 1,
  searchable = true,
  pageSize = 100,
  copyable = true,
  onCopy,
  maxHeight = 384,
  labels: labelsProp,
  className,
  'aria-label': ariaLabel,
  ...props
}: JsonViewerProps) {
  const labels = useLabels('json-viewer', defaultJsonViewerLabels, labelsProp)
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => {
    const open = new Set<string>()
    const walk = (value: unknown, path: string, depth: number) => {
      if (depth >= defaultExpandDepth || !isBranch(typeOf(value))) return
      open.add(path)
      for (const [k, v] of entriesOf(value).slice(0, pageSize))
        walk(v, childPath(path, k), depth + 1)
    }
    walk(data, rootName, 0)
    return open
  })
  const [pages, setPages] = React.useState<ReadonlyMap<string, number>>(() => new Map())
  const [query, setQuery] = React.useState('')
  const [focusId, setFocusId] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState<{ id: string; kind: 'value' | 'path' } | null>(null)
  const [matchIndex, setMatchIndex] = React.useState(0)
  const rowRefs = React.useRef(new Map<string, HTMLDivElement>())
  const pendingFocus = React.useRef<string | null>(null)
  const q = query.trim().toLowerCase()

  // Every match in document order, with the branches to open and the pages to load to reach it.
  const search = React.useMemo(() => {
    const matches: string[] = []
    const open = new Set<string>()
    const need = new Map<string, number>()
    if (!q) return { matches, open, need, hits: new Set<string>() }
    let seen = 0
    const walk = (value: unknown, path: string, name: string | number | null, chain: string[]) => {
      if (++seen > SEARCH_LIMIT) return
      const type = typeOf(value)
      const keyHit = typeof name === 'string' && name.toLowerCase().includes(q)
      const valueHit = !isBranch(type) && primitiveText(value, type).toLowerCase().includes(q)
      if (keyHit || valueHit) {
        matches.push(path)
        for (const p of chain) open.add(p)
      }
      if (!isBranch(type)) return
      entriesOf(value).forEach(([k, v], i) => {
        const before = matches.length
        walk(v, childPath(path, k), k, [...chain, path])
        if (matches.length > before) need.set(path, Math.max(need.get(path) ?? 0, i + 1))
      })
    }
    walk(data, rootName, null, [])
    return { matches, open, need, hits: new Set(matches) }
  }, [data, rootName, q])

  // A new query opens what it found. It merges into the open state, so closing a branch after
  // searching still works.
  const [appliedQuery, setAppliedQuery] = React.useState(q)
  if (appliedQuery !== q) {
    setAppliedQuery(q)
    setMatchIndex(0)
    if (search.open.size) setExpanded((prev) => new Set([...prev, ...search.open]))
    if (search.need.size) {
      setPages((prev) => {
        const next = new Map(prev)
        for (const [id, count] of search.need) {
          const pagesNeeded = Math.ceil(count / pageSize)
          next.set(id, Math.max(next.get(id) ?? 1, pagesNeeded))
        }
        return next
      })
    }
  }

  const rows = React.useMemo(() => {
    const out: Row[] = []
    const visit = (
      value: unknown,
      id: string,
      name: string | number | null,
      level: number,
      parent: string | null,
      pos: number,
      setSize: number,
    ) => {
      const type = typeOf(value)
      const children = isBranch(type) ? entriesOf(value) : []
      out.push({
        kind: 'node',
        id,
        level,
        name,
        value,
        type,
        size: children.length,
        parent,
        pos,
        setSize,
      })
      if (!isBranch(type) || !expanded.has(id)) return
      const limit = (pages.get(id) ?? 1) * pageSize
      const page = children.slice(0, limit)
      const more = children.length - page.length
      const size = page.length + (more > 0 ? 1 : 0)
      page.forEach(([k, v], i) => {
        visit(v, childPath(id, k), k, level + 1, id, i + 1, size)
      })
      if (more > 0) {
        out.push({
          kind: 'more',
          id: `${id}#more`,
          level: level + 1,
          parent: id,
          remaining: more,
          pos: size,
          setSize: size,
        })
      }
    }
    visit(data, rootName, null, 1, null, 1, 1)
    return out
  }, [data, rootName, expanded, pages, pageSize])

  const current = rows.find((r) => r.id === focusId) ? focusId : (rows[0]?.id ?? null)

  React.useEffect(() => {
    const id = pendingFocus.current
    if (!id) return
    const el = rowRefs.current.get(id)
    if (!el) return
    pendingFocus.current = null
    el.focus()
    el.scrollIntoView?.({ block: 'nearest' })
  })

  const focusRow = (id: string | undefined) => {
    if (!id) return
    setFocusId(id)
    pendingFocus.current = id
    const el = rowRefs.current.get(id)
    if (el) {
      el.focus()
      el.scrollIntoView?.({ block: 'nearest' })
      pendingFocus.current = null
    }
  }

  const toggle = (id: string, open?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (open ?? !next.has(id)) next.add(id)
      else next.delete(id)
      return next
    })

  const loadMore = (parent: string) =>
    setPages((prev) => new Map(prev).set(parent, (prev.get(parent) ?? 1) + 1))

  const setAll = (open: boolean) => {
    if (!open) {
      setExpanded(new Set())
      focusRow(rootName)
      return
    }
    const all = new Set<string>()
    let seen = 0
    const walk = (value: unknown, path: string) => {
      if (++seen > SEARCH_LIMIT || !isBranch(typeOf(value))) return
      all.add(path)
      for (const [k, v] of entriesOf(value).slice(0, pageSize)) walk(v, childPath(path, k))
    }
    walk(data, rootName)
    setExpanded(all)
  }

  const copy = async (row: NodeRow, kind: 'value' | 'path') => {
    const text = kind === 'path' ? row.id : copyText(row.value, row.type)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied({ id: row.id, kind })
    onCopy?.({ kind, path: row.id, text })
  }

  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(null), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const goToMatch = (step: number) => {
    if (!search.matches.length) return
    const next = (matchIndex + step + search.matches.length) % search.matches.length
    setMatchIndex(next)
    focusRow(search.matches[next])
  }

  const onRowKeyDown = (e: React.KeyboardEvent, row: Row, index: number) => {
    const node = row.kind === 'node' ? row : null
    const branch = node && isBranch(node.type) && node.size > 0
    const open = node ? expanded.has(node.id) : false
    switch (e.key) {
      case 'ArrowDown':
        focusRow(rows[index + 1]?.id)
        break
      case 'ArrowUp':
        focusRow(rows[index - 1]?.id)
        break
      case 'Home':
        focusRow(rows[0]?.id)
        break
      case 'End':
        focusRow(rows[rows.length - 1]?.id)
        break
      case 'ArrowRight':
        if (branch && !open) toggle(row.id, true)
        else if (branch) focusRow(rows[index + 1]?.id)
        break
      case 'ArrowLeft':
        if (branch && open) toggle(row.id, false)
        else if (row.parent) focusRow(row.parent)
        break
      case 'Enter':
      case ' ':
        if (row.kind === 'more') loadMore(row.parent)
        else if (branch) toggle(row.id)
        break
      case 'c':
      case 'p':
        if (!node || !copyable || e.metaKey || e.ctrlKey || e.altKey) return
        copy(node, e.key === 'c' ? 'value' : 'path')
        break
      default:
        return
    }
    e.preventDefault()
  }

  const posInMatches = search.matches.indexOf(current ?? '')

  return (
    <div
      data-slot="json-viewer"
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground',
        className,
      )}
      {...props}
    >
      {searchable && (
        <div className="flex items-center gap-2 border-b p-2">
          <div className="relative flex-1">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  goToMatch(e.shiftKey ? -1 : posInMatches === -1 ? 0 : 1)
                }
              }}
              placeholder={labels.search}
              aria-label={labels.search}
              className="h-8 pl-8"
            />
          </div>
          {q && (
            <span role="status" className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {search.matches.length
                ? labels.match(posInMatches === -1 ? 0 : posInMatches + 1, search.matches.length)
                : labels.noMatches}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={labels.expandAll}
            onClick={() => setAll(true)}
          >
            <ChevronsUpDownIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={labels.collapseAll}
            onClick={() => setAll(false)}
          >
            <ChevronsDownUpIcon />
          </Button>
        </div>
      )}
      <div
        role="tree"
        aria-label={ariaLabel ?? labels.tree}
        className="overflow-auto py-1 font-mono text-[13px] leading-6"
        style={{ maxHeight }}
      >
        {rows.map((row, index) => {
          const indent = { paddingLeft: `calc(${(row.level - 1) * 1.25}rem + 0.5rem)` }
          const ref = (el: HTMLDivElement | null) => {
            if (el) rowRefs.current.set(row.id, el)
            else rowRefs.current.delete(row.id)
          }
          if (row.kind === 'more') {
            return (
              <div
                key={row.id}
                ref={ref}
                role="treeitem"
                aria-level={row.level}
                aria-posinset={row.pos}
                aria-setsize={row.setSize}
                tabIndex={row.id === current ? 0 : -1}
                onFocus={() => setFocusId(row.id)}
                onKeyDown={(e) => onRowKeyDown(e, row, index)}
                data-slot="json-viewer-more"
                className="cursor-pointer pr-2 text-muted-foreground outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                style={indent}
                onClick={() => loadMore(row.parent)}
              >
                <span className="ml-5 font-sans text-xs underline-offset-4 hover:underline">
                  {labels.showMore(Math.min(pageSize, row.remaining))}
                  <span className="text-muted-foreground/80"> · {labels.left(row.remaining)}</span>
                </span>
              </div>
            )
          }
          const branch = isBranch(row.type)
          const open = expanded.has(row.id)
          const isMatch = search.hits.has(row.id)
          const name =
            row.name === null
              ? rootName
              : typeof row.name === 'number'
                ? String(row.name)
                : row.name
          const count = labels.size(row.size, row.type === 'array' ? 'array' : 'object')
          return (
            <div
              key={row.id}
              ref={ref}
              role="treeitem"
              aria-level={row.level}
              aria-posinset={row.pos}
              aria-setsize={row.setSize}
              tabIndex={row.id === current ? 0 : -1}
              onFocus={() => setFocusId(row.id)}
              onKeyDown={(e) => onRowKeyDown(e, row, index)}
              aria-expanded={branch && row.size > 0 ? open : undefined}
              // The row's own name, without the labels of its copy buttons.
              aria-label={
                branch
                  ? `${name}, ${row.type === 'array' ? labels.array : labels.object}, ${count}`
                  : `${name}: ${primitiveText(row.value, row.type)}`
              }
              data-slot="json-viewer-row"
              data-type={row.type}
              data-match={isMatch || undefined}
              className={cn(
                'group flex items-start gap-1 pr-2 outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
                branch && row.size > 0 && 'cursor-pointer',
              )}
              style={indent}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return
                if (branch && row.size > 0) toggle(row.id)
              }}
            >
              <span className="flex h-6 w-4 shrink-0 items-center justify-center">
                {branch && row.size > 0 && (
                  <ChevronRightIcon
                    aria-hidden
                    className={cn(
                      'size-3.5 text-muted-foreground transition-transform duration-(--duration-fast,150ms) motion-reduce:transition-none',
                      open && 'rotate-90',
                    )}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1 break-words">
                <span
                  className={cn(
                    typeof row.name === 'number' ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  <Highlight text={name} query={typeof row.name === 'string' ? q : ''} />
                </span>
                <span className="text-muted-foreground">: </span>
                {branch ? (
                  <span className="text-muted-foreground">
                    {!open && (row.type === 'array' ? '[…]' : '{…}')}
                    <span className={cn('font-sans text-xs', !open && 'ml-2')}>{count}</span>
                  </span>
                ) : (
                  <span className={typeColor[row.type]}>
                    <Highlight text={primitiveText(row.value, row.type)} query={q} />
                  </span>
                )}
              </span>
              {copyable && (
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                  {(['value', 'path'] as const).map((kind) => {
                    const done = copied?.id === row.id && copied.kind === kind
                    const Icon = done ? CheckIcon : kind === 'value' ? CopyIcon : LinkIcon
                    return (
                      <button
                        key={kind}
                        type="button"
                        tabIndex={-1}
                        aria-label={
                          kind === 'value' ? labels.copyValue(row.id) : labels.copyPath(row.id)
                        }
                        title={kind === 'value' ? labels.copyValueHint : labels.copyPathHint}
                        onClick={() => copy(row, kind)}
                        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <Icon aria-hidden className="size-3.5" />
                      </button>
                    )
                  })}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div aria-live="polite" className="sr-only">
        {copied ? (copied.kind === 'value' ? labels.valueCopied : labels.pathCopied) : ''}
      </div>
    </div>
  )
}

export { JsonViewer }
