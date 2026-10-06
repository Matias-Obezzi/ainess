'use client'

import * as React from 'react'
import { useLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'

/** A key as shown on screen, and as read out. */
export interface KeyLabel {
  /** What the cap shows, "⌘" or "Ctrl" for example. */
  symbol: string
  /** What screen readers say, "Command" or "Control". */
  name: string
}

/** What screen readers say for each key, in place of its symbol. */
export interface KbdLabels {
  command: string
  control: string
  windows: string
  option: string
  alt: string
  shift: string
  return: string
  enter: string
  delete: string
  forwardDelete: string
  backspace: string
  escape: string
  tab: string
  /** Also written on the space cap. */
  space: string
  capsLock: string
  upArrow: string
  downArrow: string
  leftArrow: string
  rightArrow: string
  pageUp: string
  pageDown: string
  home: string
  end: string
  plus: string
}

export const defaultKbdLabels: KbdLabels = {
  command: 'Command',
  control: 'Control',
  windows: 'Windows',
  option: 'Option',
  alt: 'Alt',
  shift: 'Shift',
  return: 'Return',
  enter: 'Enter',
  delete: 'Delete',
  forwardDelete: 'Forward Delete',
  backspace: 'Backspace',
  escape: 'Escape',
  tab: 'Tab',
  space: 'Space',
  capsLock: 'Caps Lock',
  upArrow: 'Up Arrow',
  downArrow: 'Down Arrow',
  leftArrow: 'Left Arrow',
  rightArrow: 'Right Arrow',
  pageUp: 'Page Up',
  pageDown: 'Page Down',
  home: 'Home',
  end: 'End',
  plus: 'Plus',
}

type Name = keyof KbdLabels

// [mac symbol, mac name, other symbol, other name]. A symbol of null is the name itself.
const KEYS: Record<string, [string | null, Name, string | null, Name]> = {
  mod: ['⌘', 'command', 'Ctrl', 'control'],
  cmd: ['⌘', 'command', 'Win', 'windows'],
  command: ['⌘', 'command', 'Win', 'windows'],
  meta: ['⌘', 'command', 'Win', 'windows'],
  ctrl: ['⌃', 'control', 'Ctrl', 'control'],
  control: ['⌃', 'control', 'Ctrl', 'control'],
  alt: ['⌥', 'option', 'Alt', 'alt'],
  option: ['⌥', 'option', 'Alt', 'alt'],
  opt: ['⌥', 'option', 'Alt', 'alt'],
  shift: ['⇧', 'shift', 'Shift', 'shift'],
  enter: ['↵', 'return', 'Enter', 'enter'],
  return: ['↵', 'return', 'Enter', 'enter'],
  backspace: ['⌫', 'delete', 'Backspace', 'backspace'],
  delete: ['⌦', 'forwardDelete', 'Del', 'delete'],
  del: ['⌦', 'forwardDelete', 'Del', 'delete'],
  esc: ['Esc', 'escape', 'Esc', 'escape'],
  escape: ['Esc', 'escape', 'Esc', 'escape'],
  tab: ['⇥', 'tab', 'Tab', 'tab'],
  space: [null, 'space', null, 'space'],
  capslock: ['⇪', 'capsLock', 'Caps Lock', 'capsLock'],
  up: ['↑', 'upArrow', '↑', 'upArrow'],
  arrowup: ['↑', 'upArrow', '↑', 'upArrow'],
  down: ['↓', 'downArrow', '↓', 'downArrow'],
  arrowdown: ['↓', 'downArrow', '↓', 'downArrow'],
  left: ['←', 'leftArrow', '←', 'leftArrow'],
  arrowleft: ['←', 'leftArrow', '←', 'leftArrow'],
  right: ['→', 'rightArrow', '→', 'rightArrow'],
  arrowright: ['→', 'rightArrow', '→', 'rightArrow'],
  pageup: ['PgUp', 'pageUp', 'PgUp', 'pageUp'],
  pagedown: ['PgDn', 'pageDown', 'PgDn', 'pageDown'],
  home: ['Home', 'home', 'Home', 'home'],
  end: ['End', 'end', 'End', 'end'],
  plus: ['+', 'plus', '+', 'plus'],
}

/**
 * Turn one key name into what to show and what to say. Known names ("mod", "shift", "enter",
 * "up"…) become symbols on a Mac and words elsewhere; anything else is shown as written,
 * a single letter in capitals. `labels` changes what is said.
 */
function formatKey(key: string, mac: boolean, labels: KbdLabels = defaultKbdLabels): KeyLabel {
  const known = KEYS[key.toLowerCase()]
  if (known) {
    const [symbol, name] = mac ? [known[0], known[1]] : [known[2], known[3]]
    return { symbol: symbol ?? labels[name], name: labels[name] }
  }
  const symbol = key.length === 1 ? key.toUpperCase() : key
  return { symbol, name: symbol }
}

/** Split a shortcut like "mod+shift+k" into its keys. "mod++" means the plus key. */
function parseShortcut(shortcut: string): string[] {
  return shortcut
    .trim()
    .replace(/\+\+$/, '+plus')
    .split('+')
    .map((key) => key.trim())
    .filter(Boolean)
}

const MAC = /mac|iphone|ipad|ipod/i

function detectMac() {
  if (typeof navigator === 'undefined') return false
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    ''
  return MAC.test(platform) || MAC.test(navigator.userAgent)
}

const noop = () => () => {}

/**
 * True on Apple devices. False while rendering on the server, then corrected after hydration,
 * so the first paint never disagrees with the server's HTML.
 */
function useIsMac() {
  return React.useSyncExternalStore(noop, detectMac, () => false)
}

/** A single key cap. Its text is shown as written; use `KbdGroup` for "mod+k" style shortcuts. */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded-sm border border-b-2 bg-muted px-1 font-medium font-sans text-[0.6875rem] text-muted-foreground leading-none [&_svg:not([class*='size-'])]:size-3",
        // Inside a tooltip the colors flip, so the cap follows the tooltip's.
        'in-data-[slot=tooltip-content]:border-background/20 in-data-[slot=tooltip-content]:bg-background/10 in-data-[slot=tooltip-content]:text-background',
        className,
      )}
      {...props}
    />
  )
}

export interface KbdGroupProps extends React.ComponentProps<'kbd'> {
  /** A shortcut like "mod+k" or "shift+enter", rendered as one cap per key for the platform. */
  keys?: string
  /** Put between caps. Default nothing on a Mac and "+" elsewhere, the way each platform writes it. */
  separator?: React.ReactNode
  /** Force the Mac or the other spelling instead of detecting it. */
  platform?: 'mac' | 'other'
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<KbdLabels>
}

/**
 * A key combination. Pass `keys="mod+k"` for platform aware caps (⌘ K on a Mac, Ctrl + K
 * elsewhere), or `Kbd` children to compose it yourself.
 */
function KbdGroup({
  keys,
  separator,
  platform,
  labels: labelsProp,
  className,
  children,
  ...props
}: KbdGroupProps) {
  const labels = useLabels('kbd', defaultKbdLabels, labelsProp)
  const detected = useIsMac()
  const mac = platform ? platform === 'mac' : detected
  const between = separator === undefined ? (mac ? null : '+') : separator
  const parts = keys ? parseShortcut(keys).map((key) => formatKey(key, mac, labels)) : null
  return (
    <kbd
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1 font-sans', className)}
      {...props}
    >
      {parts
        ? parts.map((part, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: keys are positional, and a shortcut may repeat one
            <React.Fragment key={`${part.symbol}-${i}`}>
              {i > 0 && between !== null && (
                <span aria-hidden="true" className="text-muted-foreground text-xs">
                  {between}
                </span>
              )}
              <Kbd>
                {/* Symbols read badly ("place of interest sign"), so the name is what is said. */}
                <span aria-hidden="true">{part.symbol}</span>
                <span className="sr-only">{part.name}</span>
              </Kbd>
            </React.Fragment>
          ))
        : children}
    </kbd>
  )
}

export { formatKey, Kbd, KbdGroup, parseShortcut, useIsMac }
