'use client'

import { AlertCircleIcon, CheckIcon, ChevronRightIcon, MinusIcon } from 'lucide-react'
import * as React from 'react'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'

export interface TreeViewLabels {
  /** Read after a node whose children failed to load. */
  loadFailed: string
}

export const defaultTreeViewLabels: TreeViewLabels = {
  loadFailed: 'could not load, open to retry',
}

import { Spinner } from '@/components/ui/spinner'

export interface TreeNode {
  /** Unique across the whole tree. */
  id: string
  /** What the row shows. */
  label: React.ReactNode
  /** Text matched by type-ahead, when `label` is not a plain string. */
  textValue?: string
  /** Shown before the label. Wins over `renderIcon`. */
  icon?: React.ReactNode
  /** Nested nodes. A node with children is a folder. */
  children?: TreeNode[]
  /** A folder whose children come from `loadChildren` the first time it opens. */
  hasChildren?: boolean
  /** Can be focused but not selected, checked or opened. */
  disabled?: boolean
}

export type TreeCheckedState = boolean | 'mixed'

export interface TreeIconState {
  expanded: boolean
  branch: boolean
  loading: boolean
}

export interface TreeViewProps
  extends Omit<
    React.ComponentProps<'ul'>,
    'onSelect' | 'defaultValue' | 'defaultChecked' | 'children'
  > {
  /** The nodes at the top level. */
  data: TreeNode[]
  /** `single` keeps one node selected, `multiple` any number, `none` turns selection off. Default `single`. */
  selectionMode?: 'none' | 'single' | 'multiple'
  /** Selected ids, controlled. */
  selected?: string[]
  /** Selected ids at first. */
  defaultSelected?: string[]
  onSelectedChange?: (ids: string[]) => void
  /** Open folder ids, controlled. */
  expanded?: string[]
  /** Open folder ids at first. */
  defaultExpanded?: string[]
  onExpandedChange?: (ids: string[]) => void
  /**
   * A checkbox on every row. Checking a folder checks everything inside it, and a folder with
   * only some of its contents checked shows a dash. Replaces selection.
   */
  checkboxes?: boolean
  /** Checked ids, controlled. Folders count as checked when all their contents are. */
  checked?: string[]
  /** Checked ids at first. */
  defaultChecked?: string[]
  onCheckedChange?: (ids: string[]) => void
  /** Fetches the children of a node with `hasChildren` the first time it opens. */
  loadChildren?: (node: TreeNode) => Promise<TreeNode[]>
  /** The icon of each row, from its state. A node's own `icon` wins. */
  renderIcon?: (node: TreeNode, state: TreeIconState) => React.ReactNode
  /** Runs on Enter, and on a click, for a node that is not disabled. */
  onAction?: (node: TreeNode) => void
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<TreeViewLabels>
}

interface Entry {
  node: TreeNode
  parent: string | null
  level: number
  posinset: number
  setsize: number
}

function useControllable<T>(value: T | undefined, initial: T, onChange?: (next: T) => void) {
  const [own, setOwn] = React.useState(initial)
  const current = value ?? own
  const set = React.useCallback(
    (next: T) => {
      if (value === undefined) setOwn(next)
      onChange?.(next)
    },
    [value, onChange],
  )
  return [current, set] as const
}

const noIds: string[] = []
const TYPEAHEAD_MS = 500

/** Ids that read as checked: leaves in `raw`, and folders whose contents all are. */
function checkedIdsOf(
  nodes: TreeNode[],
  raw: ReadonlySet<string>,
  loaded: ReadonlyMap<string, TreeNode[]>,
) {
  const ids: string[] = []
  const visit = (node: TreeNode): boolean => {
    const kids = node.children ?? loaded.get(node.id)
    const on = kids && kids.length > 0 ? kids.map(visit).every(Boolean) : raw.has(node.id)
    if (on) ids.push(node.id)
    return on
  }
  for (const node of nodes) visit(node)
  return ids
}

const textOf = (node: TreeNode) =>
  (node.textValue ?? (typeof node.label === 'string' ? node.label : '')).toLowerCase()

/**
 * A tree of folders and items, with the keyboard of a file explorer: arrows to move, open and
 * close, Home and End, type to jump, and * to open every folder next to the focused one. Folders
 * open with a height animation and can load their contents when first opened.
 */
function TreeView({
  data,
  selectionMode = 'single',
  selected: selectedProp,
  defaultSelected = noIds,
  onSelectedChange,
  expanded: expandedProp,
  defaultExpanded = noIds,
  onExpandedChange,
  checkboxes = false,
  checked: checkedProp,
  defaultChecked = noIds,
  onCheckedChange,
  loadChildren,
  renderIcon,
  onAction,
  labels: labelsProp,
  className,
  onKeyDown,
  ...props
}: TreeViewProps) {
  const labels = useLabels('tree-view', defaultTreeViewLabels, labelsProp)
  const [expandedIds, setExpandedIds] = useControllable(
    expandedProp,
    defaultExpanded,
    onExpandedChange,
  )
  const [selectedIds, setSelectedIds] = useControllable(
    selectedProp,
    defaultSelected,
    onSelectedChange,
  )
  const [checkedRaw, setCheckedRaw] = React.useState(defaultChecked)
  const checkedIds = checkedProp ?? checkedRaw

  const [loaded, setLoaded] = React.useState<ReadonlyMap<string, TreeNode[]>>(() => new Map())
  const [loading, setLoading] = React.useState<ReadonlySet<string>>(() => new Set())
  const [failed, setFailed] = React.useState<ReadonlySet<string>>(() => new Set())
  const [focusedId, setFocusedId] = React.useState<string | null>(null)

  const expanded = React.useMemo(() => new Set(expandedIds), [expandedIds])
  const selected = React.useMemo(() => new Set(selectedIds), [selectedIds])
  const items = React.useRef(new Map<string, HTMLLIElement>())
  // Folders opened at least once keep their contents mounted, so closing can animate.
  const opened = React.useRef(new Set<string>())
  const anchor = React.useRef<string | null>(null)
  const typeahead = React.useRef({ text: '', timer: 0 })

  const childrenOf = React.useCallback(
    (node: TreeNode) => node.children ?? loaded.get(node.id),
    [loaded],
  )
  const isBranch = (node: TreeNode) =>
    (node.children !== undefined && node.children.length > 0) ||
    (node.children === undefined && node.hasChildren === true)

  const index = React.useMemo(() => {
    const map = new Map<string, Entry>()
    const walk = (nodes: TreeNode[], parent: string | null, level: number) => {
      nodes.forEach((node, i) => {
        map.set(node.id, { node, parent, level, posinset: i + 1, setsize: nodes.length })
        const kids = childrenOf(node)
        if (kids) walk(kids, node.id, level + 1)
      })
    }
    walk(data, null, 1)
    return map
  }, [data, childrenOf])

  const visible = React.useMemo(() => {
    const ids: string[] = []
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        ids.push(node.id)
        const kids = childrenOf(node)
        if (kids && expanded.has(node.id)) walk(kids)
      }
    }
    walk(data)
    return ids
  }, [data, childrenOf, expanded])

  // Folders derive their state from what they hold, so only the raw ids of leaves (and of
  // folders whose contents have not loaded yet) matter.
  const checkState = React.useMemo(() => {
    const raw = new Set(checkedIds)
    const states = new Map<string, TreeCheckedState>()
    const visit = (node: TreeNode): TreeCheckedState => {
      const kids = childrenOf(node)
      let state: TreeCheckedState
      if (kids && kids.length > 0) {
        const all = kids.map(visit)
        state = all.every((s) => s === true)
          ? true
          : all.every((s) => s === false)
            ? false
            : 'mixed'
      } else {
        state = raw.has(node.id)
      }
      states.set(node.id, state)
      return state
    }
    data.forEach(visit)
    return states
  }, [data, childrenOf, checkedIds])

  const commitChecked = (raw: Set<string>, lookup = loaded) => {
    if (checkedProp === undefined) setCheckedRaw([...raw])
    // Report what reads as checked, folders included, so the value can be passed back as is.
    onCheckedChange?.(checkedIdsOf(data, raw, lookup))
  }

  const descendants = (node: TreeNode): string[] => {
    const kids = childrenOf(node) ?? []
    return kids.flatMap((kid) => [kid.id, ...descendants(kid)])
  }

  const toggleChecked = (node: TreeNode) => {
    if (node.disabled) return
    const on = checkState.get(node.id) !== true
    const raw = new Set(checkedIds)
    for (const id of [node.id, ...descendants(node)]) {
      if (index.get(id)?.node.disabled) continue
      if (on) raw.add(id)
      else raw.delete(id)
    }
    commitChecked(raw)
  }

  // Loading resolves later, when these may have changed, so it reads them from here.
  const latest = React.useRef({ checkedIds, expandedIds, loaded })
  latest.current = { checkedIds, expandedIds, loaded }

  const load = (node: TreeNode) => {
    if (!loadChildren || loading.has(node.id)) return
    const without = (set: ReadonlySet<string>) => {
      const next = new Set(set)
      next.delete(node.id)
      return next
    }
    setLoading((prev) => new Set(prev).add(node.id))
    setFailed(without)
    loadChildren(node)
      .then(
        (kids) => {
          const lookup = new Map(latest.current.loaded).set(node.id, kids)
          latest.current.loaded = lookup
          setLoaded(lookup)
          // A folder checked before its contents arrived passes the check down to them.
          const raw = new Set(latest.current.checkedIds)
          if (checkboxes && raw.has(node.id)) {
            for (const kid of kids) raw.add(kid.id)
            commitChecked(raw, lookup)
          }
        },
        () => {
          setFailed((prev) => new Set(prev).add(node.id))
          setExpandedIds(latest.current.expandedIds.filter((id) => id !== node.id))
        },
      )
      .finally(() => setLoading(without))
  }

  const setOpen = (node: TreeNode, open: boolean) => {
    if (node.disabled || !isBranch(node) || expanded.has(node.id) === open) return
    if (open) {
      if (!childrenOf(node)) load(node)
      setExpandedIds([...expandedIds, node.id])
    } else {
      setExpandedIds(expandedIds.filter((id) => id !== node.id))
      // Focus inside a folder that closes goes to the folder.
      const focused = focusedId && index.get(focusedId)
      if (focused && focusedId !== node.id && isInside(focusedId, node.id)) focus(node.id)
    }
  }

  const isInside = (id: string, ancestor: string) => {
    let parent = index.get(id)?.parent ?? null
    while (parent) {
      if (parent === ancestor) return true
      parent = index.get(parent)?.parent ?? null
    }
    return false
  }

  const focus = (id: string | undefined) => {
    if (!id) return
    setFocusedId(id)
    items.current.get(id)?.focus()
  }

  const select = (id: string, how: 'replace' | 'toggle' | 'range') => {
    const node = index.get(id)?.node
    if (!node || node.disabled || selectionMode === 'none' || checkboxes) return
    if (selectionMode === 'single') {
      if (!selected.has(id) || selectedIds.length !== 1) setSelectedIds([id])
      return
    }
    if (how === 'range' && anchor.current && visible.includes(anchor.current)) {
      const a = visible.indexOf(anchor.current)
      const b = visible.indexOf(id)
      const range = visible
        .slice(Math.min(a, b), Math.max(a, b) + 1)
        .filter((v) => !index.get(v)?.node.disabled)
      setSelectedIds(range)
      return
    }
    anchor.current = id
    if (how === 'toggle') {
      setSelectedIds(selected.has(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id])
    } else {
      setSelectedIds([id])
    }
  }

  const activate = (node: TreeNode, toggleSelection: boolean) => {
    if (node.disabled) return
    if (checkboxes) {
      if (!isBranch(node)) toggleChecked(node)
    } else {
      select(node.id, selectionMode === 'multiple' && toggleSelection ? 'toggle' : 'replace')
    }
    onAction?.(node)
  }

  const tabbable =
    focusedId && visible.includes(focusedId)
      ? focusedId
      : (visible.find((id) => selected.has(id)) ?? visible[0])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    const target = event.target as HTMLElement
    if (target.getAttribute('role') !== 'treeitem') return
    const id = target.dataset.id
    const entry = id ? index.get(id) : undefined
    if (!id || !entry) return
    const { node } = entry
    const at = visible.indexOf(id)
    const multi = selectionMode === 'multiple' && !checkboxes
    const move = (to: string | undefined) => {
      if (!to) return
      focus(to)
      if (multi && event.shiftKey) select(to, 'range')
    }
    let handled = true

    switch (event.key) {
      case 'ArrowDown':
        if (multi && event.shiftKey && !anchor.current) anchor.current = id
        move(visible[at + 1])
        break
      case 'ArrowUp':
        if (multi && event.shiftKey && !anchor.current) anchor.current = id
        move(visible[at - 1])
        break
      case 'ArrowRight':
        if (isBranch(node) && !node.disabled) {
          if (!expanded.has(id)) setOpen(node, true)
          else focus(childrenOf(node)?.[0]?.id)
        }
        break
      case 'ArrowLeft':
        if (isBranch(node) && expanded.has(id)) setOpen(node, false)
        else focus(entry.parent ?? undefined)
        break
      case 'Home':
        move(visible[0])
        break
      case 'End':
        move(visible[visible.length - 1])
        break
      case 'Enter':
        if (isBranch(node) && !onAction && (selectionMode === 'none' || checkboxes)) {
          setOpen(node, !expanded.has(id))
        } else {
          activate(node, false)
        }
        break
      case ' ':
        if (checkboxes) toggleChecked(node)
        else if (multi && event.shiftKey) select(id, 'range')
        else if (selectionMode !== 'none') select(id, multi ? 'toggle' : 'replace')
        else if (isBranch(node)) setOpen(node, !expanded.has(id))
        break
      case '*': {
        const siblings = entry.parent
          ? (childrenOf(index.get(entry.parent)?.node as TreeNode) ?? [])
          : data
        const toOpen = siblings.filter((s) => isBranch(s) && !s.disabled && !expanded.has(s.id))
        for (const s of toOpen) if (!childrenOf(s)) load(s)
        if (toOpen.length) setExpandedIds([...expandedIds, ...toOpen.map((s) => s.id)])
        break
      }
      default:
        if (multi && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
          setSelectedIds(visible.filter((v) => !index.get(v)?.node.disabled))
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const state = typeahead.current
          window.clearTimeout(state.timer)
          state.text += event.key.toLowerCase()
          state.timer = window.setTimeout(() => {
            state.text = ''
          }, TYPEAHEAD_MS)
          // Typing the same letter again cycles through the nodes that start with it; a longer
          // word keeps the focused node when it still matches.
          const repeat = [...state.text].every((c) => c === state.text[0])
          const query = repeat ? state.text.slice(0, 1) : state.text
          const from = repeat ? at + 1 : at
          const order = [...visible.slice(from), ...visible.slice(0, from)]
          const match = order.find((v) => {
            const n = index.get(v)?.node
            return n ? textOf(n).startsWith(query) : false
          })
          focus(match)
        } else {
          handled = false
        }
    }
    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const renderNodes = (nodes: TreeNode[], level: number): React.ReactNode =>
    nodes.map((node, i) => {
      const branch = isBranch(node)
      const open = branch && expanded.has(node.id)
      if (open) opened.current.add(node.id)
      const kids = childrenOf(node)
      const isLoading = loading.has(node.id)
      const isSelected = selectionMode !== 'none' && !checkboxes && selected.has(node.id)
      const check = checkState.get(node.id) ?? false
      const icon = node.icon ?? renderIcon?.(node, { expanded: open, branch, loading: isLoading })

      return (
        <li
          key={node.id}
          ref={(el) => {
            if (el) items.current.set(node.id, el)
            else items.current.delete(node.id)
          }}
          role="treeitem"
          data-slot="tree-view-item"
          data-id={node.id}
          aria-level={level}
          aria-posinset={i + 1}
          aria-setsize={nodes.length}
          aria-expanded={branch ? open : undefined}
          aria-selected={selectionMode !== 'none' && !checkboxes ? isSelected : undefined}
          aria-checked={checkboxes ? check : undefined}
          aria-disabled={node.disabled || undefined}
          aria-busy={isLoading || undefined}
          tabIndex={node.id === tabbable ? 0 : -1}
          className="outline-none [&:focus-visible>[data-slot=tree-view-row]]:ring-2 [&:focus-visible>[data-slot=tree-view-row]]:ring-ring/60 [&:focus-visible>[data-slot=tree-view-row]]:ring-inset"
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocusedId(node.id)
          }}
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the treeitem above takes the keyboard; this is its pointer target */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: the tree handles keys for every item */}
          <div
            data-slot="tree-view-row"
            data-selected={isSelected || undefined}
            data-disabled={node.disabled || undefined}
            className="flex h-8 cursor-default select-none items-center gap-1.5 rounded-md px-1.5 text-sm transition-colors hover:bg-accent/60 data-[disabled]:opacity-50 data-[selected]:bg-accent data-[selected]:font-medium data-[selected]:text-accent-foreground [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            onClick={(event) => {
              if (node.disabled) return
              if (branch) setOpen(node, !open)
              if (selectionMode === 'multiple' && event.shiftKey && !checkboxes) {
                select(node.id, 'range')
              } else {
                activate(node, true)
              }
            }}
          >
            <span
              aria-hidden="true"
              className="flex size-4 items-center justify-center text-muted-foreground"
            >
              {isLoading ? (
                <Spinner className="size-3.5" />
              ) : failed.has(node.id) ? (
                <AlertCircleIcon className="size-3.5 text-destructive" />
              ) : branch ? (
                <ChevronRightIcon
                  className={cn(
                    'size-3.5 transition-transform duration-(--duration-fast,150ms) motion-reduce:transition-none',
                    open && 'rotate-90',
                  )}
                />
              ) : null}
            </span>
            {checkboxes && (
              <span
                aria-hidden="true"
                data-state={check === 'mixed' ? 'indeterminate' : check ? 'checked' : 'unchecked'}
                className="flex size-4 items-center justify-center rounded-[5px] border border-input text-primary-foreground shadow-xs transition-colors data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary dark:bg-input/30 dark:data-[state=checked]:bg-primary dark:data-[state=indeterminate]:bg-primary"
                onClick={(event) => {
                  event.stopPropagation()
                  toggleChecked(node)
                }}
              >
                {check === 'mixed' ? (
                  <MinusIcon className="size-3" />
                ) : check ? (
                  <CheckIcon className="size-3" />
                ) : null}
              </span>
            )}
            {icon && (
              <span className="flex items-center text-muted-foreground" aria-hidden="true">
                {icon}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            {failed.has(node.id) && <span className="sr-only">, {labels.loadFailed}</span>}
          </div>
          {branch && (open || opened.current.has(node.id)) && (
            <div
              data-state={open ? 'open' : 'closed'}
              inert={!open}
              className="grid transition-[grid-template-rows,visibility] duration-(--duration-normal,200ms) ease-(--easing-standard,cubic-bezier(0.2,0,0,1)) data-[state=closed]:invisible data-[state=open]:visible data-[state=closed]:grid-rows-[0fr] data-[state=open]:grid-rows-[1fr] motion-reduce:transition-none"
            >
              {/* biome-ignore lint/a11y/useSemanticElements: a tree's nested list is a group, by the ARIA tree pattern */}
              <ul role="group" className="ms-3.5 min-h-0 overflow-hidden border-s ps-1.5">
                {kids ? renderNodes(kids, level + 1) : null}
              </ul>
            </div>
          )}
        </li>
      )
    })

  return (
    <ul
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA tree pattern is a list with role tree
      role="tree"
      data-slot="tree-view"
      aria-multiselectable={selectionMode === 'multiple' && !checkboxes ? true : undefined}
      className={cn('flex flex-col text-foreground', className)}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {renderNodes(data, 1)}
    </ul>
  )
}

export { TreeView }
