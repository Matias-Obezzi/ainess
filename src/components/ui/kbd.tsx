'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/** A key as shown on screen, and as read out. */
export interface KeyLabel {
  /** What the cap shows, "⌘" or "Ctrl" for example. */
  symbol: string
  /** What screen readers say, "Command" or "Control". */
  name: string
}

// [mac symbol, mac name, other symbol, other name]
const KEYS: Record<string, [string, string, string, string]> = {
  mod: ['⌘', 'Command', 'Ctrl', 'Control'],
  cmd: ['⌘', 'Command', 'Win', 'Windows'],
  command: ['⌘', 'Command', 'Win', 'Windows'],
  meta: ['⌘', 'Command', 'Win', 'Windows'],
  ctrl: ['⌃', 'Control', 'Ctrl', 'Control'],
  control: ['⌃', 'Control', 'Ctrl', 'Control'],
  alt: ['⌥', 'Option', 'Alt', 'Alt'],
  option: ['⌥', 'Option', 'Alt', 'Alt'],
  opt: ['⌥', 'Option', 'Alt', 'Alt'],
  shift: ['⇧', 'Shift', 'Shift', 'Shift'],
  enter: ['↵', 'Return', 'Enter', 'Enter'],
  return: ['↵', 'Return', 'Enter', 'Enter'],
  backspace: ['⌫', 'Delete', 'Backspace', 'Backspace'],
  delete: ['⌦', 'Forward Delete', 'Del', 'Delete'],
  del: ['⌦', 'Forward Delete', 'Del', 'Delete'],
  esc: ['Esc', 'Escape', 'Esc', 'Escape'],
  escape: ['Esc', 'Escape', 'Esc', 'Escape'],
  tab: ['⇥', 'Tab', 'Tab', 'Tab'],
  space: ['Space', 'Space', 'Space', 'Space'],
  capslock: ['⇪', 'Caps Lock', 'Caps Lock', 'Caps Lock'],
  up: ['↑', 'Up Arrow', '↑', 'Up Arrow'],
  arrowup: ['↑', 'Up Arrow', '↑', 'Up Arrow'],
  down: ['↓', 'Down Arrow', '↓', 'Down Arrow'],
  arrowdown: ['↓', 'Down Arrow', '↓', 'Down Arrow'],
  left: ['←', 'Left Arrow', '←', 'Left Arrow'],
  arrowleft: ['←', 'Left Arrow', '←', 'Left Arrow'],
  right: ['→', 'Right Arrow', '→', 'Right Arrow'],
  arrowright: ['→', 'Right Arrow', '→', 'Right Arrow'],
  pageup: ['PgUp', 'Page Up', 'PgUp', 'Page Up'],
  pagedown: ['PgDn', 'Page Down', 'PgDn', 'Page Down'],
  home: ['Home', 'Home', 'Home', 'Home'],
  end: ['End', 'End', 'End', 'End'],
  plus: ['+', 'Plus', '+', 'Plus'],
}

/**
 * Turn one key name into what to show and what to say. Known names ("mod", "shift", "enter",
 * "up"…) become symbols on a Mac and words elsewhere; anything else is shown as written,
 * a single letter in capitals.
 */
function formatKey(key: string, mac: boolean): KeyLabel {
  const known = KEYS[key.toLowerCase()]
  if (known)
    return mac ? { symbol: known[0], name: known[1] } : { symbol: known[2], name: known[3] }
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
}

/**
 * A key combination. Pass `keys="mod+k"` for platform aware caps (⌘ K on a Mac, Ctrl + K
 * elsewhere), or `Kbd` children to compose it yourself.
 */
function KbdGroup({ keys, separator, platform, className, children, ...props }: KbdGroupProps) {
  const detected = useIsMac()
  const mac = platform ? platform === 'mac' : detected
  const between = separator === undefined ? (mac ? null : '+') : separator
  const parts = keys ? parseShortcut(keys).map((key) => formatKey(key, mac)) : null
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
