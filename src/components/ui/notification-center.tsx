import { BellIcon, BellOffIcon, CheckCheckIcon } from 'lucide-react'
import * as React from 'react'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useLabels, useLocale } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface NotificationAction {
  id: string
  label: string
  /** Button style. Default `outline`, or `default` for the first action. */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive'
}

export interface NotificationData {
  id: string
  title: React.ReactNode
  description?: React.ReactNode
  createdAt: Date | string | number
  read?: boolean
  /** Drawn in a tile on the left. Takes the place of `avatar`. */
  icon?: React.ReactNode
  /** Picture of who it is from, with `name` for the initials while it loads. */
  avatar?: string
  /** Who it is from. Shown as initials when there is no icon or picture. */
  name?: string
  /** Free text shown next to the time, and something for custom tabs to filter on. */
  category?: string
  /** Buttons under the text, reported through `onAction`. */
  actions?: NotificationAction[]
}

export interface NotificationTab {
  value: string
  label: React.ReactNode
  /** Which notifications the tab lists. */
  filter: (notification: NotificationData) => boolean
}

export interface NotificationCenterLabels {
  /** Heading of the panel and name of the bell. */
  title: string
  /** Name of the bell with unread notifications. */
  unread: (label: string, count: number) => string
  markAsRead: string
  /** Read for the dot of an unread notification that cannot be marked. */
  unreadDot: string
  /** The two built in tabs. */
  allTab: string
  unreadTab: string
  markAllAsRead: string
  /** The empty Unread tab. */
  caughtUp: string
  caughtUpHint: string
  /** Any other empty tab. */
  empty: string
  emptyHint: string
}

export const defaultNotificationCenterLabels: NotificationCenterLabels = {
  title: 'Notifications',
  unread: (label, count) => `${label}, ${count} unread`,
  markAsRead: 'Mark as read',
  unreadDot: 'Unread',
  allTab: 'All',
  unreadTab: 'Unread',
  markAllAsRead: 'Mark all as read',
  caughtUp: 'You are all caught up',
  caughtUpHint: 'Nothing new since you last looked.',
  empty: 'No notifications',
  emptyHint: 'New activity will show up here.',
}

function toDate(value: Date | string | number) {
  return value instanceof Date ? value : new Date(value)
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

function capitalize(text: string, locale?: string) {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

function formatDay(date: Date, now: Date, locale?: string) {
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  if (days === 0 || days === -1) {
    return capitalize(
      new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day'),
      locale,
    )
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date)
}

function formatWhen(date: Date, now: Date, locale?: string) {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  if (minutes < 1) return rtf.format(0, 'second')
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  if (startOfDay(date) === startOfDay(now)) return rtf.format(-Math.round(minutes / 60), 'hour')
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date)
}

/** Newest first, split by day. */
function groupByDay(notifications: NotificationData[], now: Date, locale?: string) {
  const sorted = [...notifications].sort(
    (a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime(),
  )
  const groups: { key: number; label: string; items: NotificationData[] }[] = []
  for (const notification of sorted) {
    const date = toDate(notification.createdAt)
    const key = startOfDay(date)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(notification)
    else groups.push({ key, label: formatDay(date, now, locale), items: [notification] })
  }
  return groups
}

export interface NotificationBellProps extends React.ComponentProps<'button'> {
  /** Unread notifications. The badge hides at 0. */
  count?: number
  /** Above this the badge reads `max+`. Default 99. */
  max?: number
  /** Accessible name before the count. Default "Notifications". */
  label?: string
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<NotificationCenterLabels>
}

/** A bell with a badge for the unread count. The bell rings when the count goes up. */
function NotificationBell({
  count = 0,
  max = 99,
  label: labelProp,
  labels: labelsProp,
  className,
  ...props
}: NotificationBellProps) {
  const labels = useLabels('notification-center', defaultNotificationCenterLabels, labelsProp)
  const label = labelProp ?? labels.title
  const badgeRef = React.useRef<HTMLSpanElement>(null)
  const iconRef = React.useRef<SVGSVGElement>(null)
  const previous = React.useRef(count)
  const reduced = useReducedMotion()

  React.useEffect(() => {
    const grew = count > previous.current
    previous.current = count
    if (!grew || reduced) return
    iconRef.current?.animate?.(
      [
        { rotate: '0deg' },
        { rotate: '14deg' },
        { rotate: '-12deg' },
        { rotate: '8deg' },
        { rotate: '-4deg' },
        { rotate: '0deg' },
      ],
      { duration: 600, easing: 'ease-in-out' },
    )
    badgeRef.current?.animate?.([{ scale: 0.6 }, { scale: 1.2 }, { scale: 1 }], {
      duration: 400,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    })
  }, [count, reduced])

  return (
    <Button
      variant="ghost"
      size="icon"
      data-slot="notification-bell"
      aria-label={count > 0 ? labels.unread(label, count) : label}
      className={cn('relative rounded-full', className)}
      {...props}
    >
      <BellIcon ref={iconRef} aria-hidden className="origin-top" />
      {count > 0 ? (
        <span
          ref={badgeRef}
          aria-hidden
          data-slot="notification-badge"
          className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-semibold text-[0.625rem] text-white tabular-nums leading-none ring-2 ring-background"
        >
          {count > max ? `${max}+` : count}
        </span>
      ) : null}
    </Button>
  )
}

export interface NotificationItemProps extends Omit<React.ComponentProps<'li'>, 'onSelect'> {
  notification: NotificationData
  /** Marks it read. Also called when the title is pressed. */
  onRead?: (id: string) => void
  /** Called with the id of the action pressed. */
  onAction?: (notificationId: string, actionId: string) => void
  /** Called when the title is pressed, to open what it is about. */
  onSelect?: (notification: NotificationData) => void
  now?: Date
  locale?: string
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<NotificationCenterLabels>
}

/** One notification: a picture, the text, the time, its actions and an unread dot. */
function NotificationItem({
  notification,
  onRead,
  onAction,
  onSelect,
  now = new Date(),
  locale: localeProp,
  labels: labelsProp,
  className,
  ...props
}: NotificationItemProps) {
  const labels = useLabels('notification-center', defaultNotificationCenterLabels, labelsProp)
  const locale = useLocale(localeProp)
  const { id, title, description, icon, avatar, name, category, actions, read } = notification
  const date = toDate(notification.createdAt)
  const pressable = !!onSelect || (!!onRead && !read)
  return (
    <li
      data-slot="notification-item"
      data-unread={read ? undefined : ''}
      className={cn(
        'relative flex gap-3 px-4 py-3 transition-colors duration-(--duration-fast,150ms) data-[unread]:bg-primary/[0.03] dark:data-[unread]:bg-primary/[0.04]',
        pressable && 'hover:bg-accent/60',
        className,
      )}
      {...props}
    >
      <div className="shrink-0">
        {icon ? (
          <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-4">
            {icon}
          </span>
        ) : (
          <Avatar className="size-9">
            {avatar ? <AvatarImage src={avatar} alt="" /> : null}
            <AvatarFallback className="text-xs">
              {(name ?? '?')
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join('')}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="min-w-0 flex-1 pr-4">
        {pressable ? (
          <button
            type="button"
            onClick={() => {
              if (!read) onRead?.(id)
              onSelect?.(notification)
            }}
            // The whole row presses this button; the actions sit above it.
            className="text-left text-sm leading-snug outline-none after:absolute after:inset-0 focus-visible:after:rounded-md focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
          >
            {title}
          </button>
        ) : (
          <p className="text-sm leading-snug">{title}</p>
        )}
        {description ? (
          <p className="mt-0.5 line-clamp-2 text-muted-foreground text-sm">{description}</p>
        ) : null}
        <p className="mt-1 text-muted-foreground text-xs">
          <time dateTime={date.toISOString()}>{formatWhen(date, now, locale)}</time>
          {category ? <> · {category}</> : null}
        </p>
        {actions?.length ? (
          <div className="relative mt-2 flex flex-wrap gap-2">
            {actions.map((action, index) => (
              <Button
                key={action.id}
                size="sm"
                variant={action.variant ?? (index === 0 ? 'default' : 'outline')}
                className="h-7 px-2.5"
                onClick={() => onAction?.(id, action.id)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {!read ? (
        onRead ? (
          <button
            type="button"
            aria-label={labels.markAsRead}
            title={labels.markAsRead}
            onClick={() => onRead(id)}
            className="group/dot absolute top-3 right-3 grid size-6 place-items-center rounded-full outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="size-2 rounded-full bg-primary transition-transform duration-(--duration-fast,150ms) group-hover/dot:scale-75" />
          </button>
        ) : (
          <span className="absolute top-5 right-5 size-2 rounded-full bg-primary">
            <span className="sr-only">{labels.unreadDot}</span>
          </span>
        )
      ) : null}
    </li>
  )
}

export interface NotificationPanelProps
  extends Omit<React.ComponentProps<'div'>, 'title' | 'onSelect'> {
  notifications: NotificationData[]
  /** Marks one read. Without it there is no unread dot to press. */
  onRead?: (id: string) => void
  /** Marks every one read. Without it there is no "Mark all as read". */
  onReadAll?: () => void
  /** Called with the notification and the action pressed. */
  onAction?: (notificationId: string, actionId: string) => void
  /** Called when a notification's title is pressed. */
  onSelect?: (notification: NotificationData) => void
  /** More tabs after All and Unread. */
  tabs?: NotificationTab[]
  /** Tab open at first. Default `all`. */
  defaultTab?: string
  /** Heading of the panel. Default "Notifications". */
  title?: React.ReactNode
  /** Under the list, such as a "View all" link. */
  footer?: React.ReactNode
  /** Shown when a tab has nothing in it. Default a short message per tab. */
  empty?: React.ReactNode
  /** What "now" is for the times and the day groups. Default the clock. */
  now?: Date
  locale?: string
  /** Words to use instead of the English ones. A `LabelsProvider` sets them for the whole app. */
  labels?: Partial<NotificationCenterLabels>
}

/**
 * The panel itself: header, tabs, notifications by day and a footer. NotificationCenter puts
 * it in a popover; render it on its own for a full page of notifications.
 */
function NotificationPanel({
  notifications,
  onRead,
  onReadAll,
  onAction,
  onSelect,
  tabs = [],
  defaultTab = 'all',
  title: titleProp,
  footer,
  empty,
  now: nowProp,
  locale: localeProp,
  labels: labelsProp,
  className,
  ...props
}: NotificationPanelProps) {
  const labels = useLabels('notification-center', defaultNotificationCenterLabels, labelsProp)
  const locale = useLocale(localeProp)
  const title = titleProp ?? labels.title
  // Times like "5 min. ago" move on by themselves while the panel stays open.
  const [clock, setClock] = React.useState(() => new Date())
  React.useEffect(() => {
    if (nowProp) return
    const timer = setInterval(() => setClock(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [nowProp])
  const now = nowProp ?? clock
  const unread = notifications.filter((n) => !n.read).length
  const allTabs: NotificationTab[] = [
    { value: 'all', label: labels.allTab, filter: () => true },
    { value: 'unread', label: labels.unreadTab, filter: (n) => !n.read },
    ...tabs,
  ]
  // Items that were there when the panel opened come in still; the ones after slide in.
  const fresh = React.useRef<Map<string, boolean> | null>(null)
  if (fresh.current === null) fresh.current = new Map(notifications.map((n) => [n.id, false]))
  for (const n of notifications) if (!fresh.current.has(n.id)) fresh.current.set(n.id, true)

  return (
    <div
      data-slot="notification-panel"
      className={cn('flex min-h-0 flex-col bg-popover text-popover-foreground', className)}
      {...props}
    >
      <Tabs defaultValue={defaultTab} className="min-h-0 flex-1 gap-0">
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <h2 className="font-semibold text-sm">{title}</h2>
          {onReadAll ? (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2 h-7 px-2 text-muted-foreground"
              disabled={unread === 0}
              onClick={onReadAll}
            >
              <CheckCheckIcon />
              {labels.markAllAsRead}
            </Button>
          ) : null}
        </div>
        <div className="border-b px-4 pb-3">
          <TabsList className="w-full">
            {allTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs">
                {tab.label}
                {tab.value === 'unread' && unread > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 font-semibold text-[0.625rem] text-primary-foreground tabular-nums leading-4">
                    {unread}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {allTabs.map((tab) => {
          const groups = groupByDay(notifications.filter(tab.filter), now, locale)
          return (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className="max-h-[min(26rem,60vh)] min-h-0 overflow-y-auto overscroll-contain"
            >
              {groups.length === 0 ? (
                (empty ?? (
                  <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                    <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                      {tab.value === 'unread' ? (
                        <CheckCheckIcon aria-hidden className="size-5" />
                      ) : (
                        <BellOffIcon aria-hidden className="size-5" />
                      )}
                    </span>
                    <p className="font-medium text-sm">
                      {tab.value === 'unread' ? labels.caughtUp : labels.empty}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {tab.value === 'unread' ? labels.caughtUpHint : labels.emptyHint}
                    </p>
                  </div>
                ))
              ) : (
                <div className="pb-1">
                  {groups.map((group) => (
                    <section key={group.key} aria-label={group.label}>
                      <h3 className="sticky top-0 z-[1] bg-popover/95 px-4 pt-3 pb-1 font-medium text-muted-foreground text-xs backdrop-blur-sm">
                        {group.label}
                      </h3>
                      <ul>
                        {group.items.map((notification) => (
                          <NotificationItem
                            key={notification.id}
                            notification={notification}
                            onRead={onRead}
                            onAction={onAction}
                            onSelect={onSelect}
                            now={now}
                            locale={locale}
                            labels={labelsProp}
                            className={cn(
                              fresh.current?.get(notification.id) &&
                                'fade-in-0 slide-in-from-top-2 animate-in duration-(--duration-slow,300ms) motion-reduce:animate-none',
                            )}
                          />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
      {footer ? <div className="border-t p-1.5">{footer}</div> : null}
    </div>
  )
}

export interface NotificationCenterProps extends Omit<NotificationPanelProps, 'className'> {
  /** Controlled open state. */
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Where the panel lines up with the bell. Default `end`. */
  align?: 'start' | 'center' | 'end'
  /** Classes for the bell. */
  className?: string
  /** Classes for the panel. */
  panelClassName?: string
}

/**
 * A bell with the unread count that opens the notifications: tabs, groups by day, mark one
 * or all as read, actions per notification and new ones sliding in.
 */
function NotificationCenter({
  open,
  defaultOpen,
  onOpenChange,
  align = 'end',
  className,
  panelClassName,
  title: titleProp,
  ...panel
}: NotificationCenterProps) {
  const labels = useLabels('notification-center', defaultNotificationCenterLabels, panel.labels)
  const title = titleProp ?? labels.title
  const unread = panel.notifications.filter((n) => !n.read).length
  return (
    <Popover open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <NotificationBell
          count={unread}
          label={typeof title === 'string' ? title : labels.title}
          labels={panel.labels}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={8}
        aria-label={typeof title === 'string' ? title : labels.title}
        className="w-[min(24rem,calc(100vw-1rem))] overflow-hidden p-0"
      >
        <NotificationPanel title={title} className={panelClassName} {...panel} />
      </PopoverContent>
    </Popover>
  )
}

export { NotificationBell, NotificationCenter, NotificationItem, NotificationPanel }
