// The bell in the window bar: the session's history of everything that asked for attention.
// It is not the toast system (`components/ui/toast`), which only says things in the moment, nor
// the OS notifications of `hooks/useSystemNotifications`: this is what is left afterwards.
import { useEffect, useState, useRef } from "react";
import {
  Bell,
  CircleAlert,
  CircleCheck,
  Download,
  Info,
  ShieldQuestion,
  MessageCircleQuestion,
  Trash2,
  Unplug,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppNotification, NotificationKind } from "@/types";
import { useAppStore } from "@/store";
import { unreadBadge, unreadCount } from "@/lib/notifications";
import { formatTimeAgo } from "@/lib/format";
import { useT, useLocale } from "@/i18n/useT";
import { plural } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { RunDetailDialog } from "@/components/RunDetailDialog";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationKind, LucideIcon> = {
  approval: ShieldQuestion,
  question: MessageCircleQuestion,
  "task-done": CircleCheck,
  "task-failed": CircleAlert,
  interrupted: Unplug,
  tunnel: Unplug,
  update: Download,
  info: Info,
};

const COLORS: Record<NotificationKind, string> = {
  approval: "text-amber-500",
  question: "text-amber-500",
  "task-done": "text-emerald-500",
  "task-failed": "text-red-500",
  interrupted: "text-muted-foreground",
  tunnel: "text-muted-foreground",
  update: "text-muted-foreground",
  info: "text-muted-foreground",
};

/** One row of the panel. Clickable only when it knows where to take the user. */
function NotificationRow({
  item,
  now,
  onOpen,
}: {
  item: AppNotification;
  now: number;
  onOpen: (item: AppNotification) => void;
}) {
  const locale = useLocale();
  const Icon = ICONS[item.kind] ?? Info;
  const goes = Boolean(item.projectId || item.runId);

  const body = (
    <>
      <Icon className={cn("mt-0.5 size-4 shrink-0", COLORS[item.kind] ?? COLORS.info)} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-xs", item.read ? "font-normal" : "font-semibold")}>
            {item.title}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{formatTimeAgo(item.ts, now, locale)}</span>
        </span>
        {item.body && <span className="block truncate text-[11px] text-muted-foreground">{item.body}</span>}
      </span>
      {!item.read && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
    </>
  );

  const className = cn(
    "flex w-full items-start gap-2 px-3 py-2 text-left",
    goes && "hover:bg-accent",
    !item.read && "bg-accent/40",
  );

  if (!goes) return <div className={className}>{body}</div>;

  return (
    <button type="button" className={className} onClick={() => onOpen(item)}>
      {body}
    </button>
  );
}

/** Bell + panel. Always visible, with or without an open project. */
export function NotificationBell() {
  const t = useT();
  const items = useAppStore(state => state.notifications);
  const open = useAppStore(state => state.notificationsOpen);
  const toggleNotifications = useAppStore(state => state.toggleNotifications);
  const markNotificationsRead = useAppStore(state => state.markNotificationsRead);
  const markNotificationRead = useAppStore(state => state.markNotificationRead);
  const clearNotifications = useAppStore(state => state.clearNotifications);
  const openProject = useAppStore(state => state.openProject);

  /**
   * Opening the panel is reading it.
   *
   * Everything the bell holds is on screen at once, so the badge asking for attention after you
   * have looked is asking twice. Anything that lands while the panel is open is read too — it is
   * just as much in front of you as the rest.
   */
  useEffect(() => {
    if (!open) return;
    if (items.some(n => !n.read)) markNotificationsRead();
  }, [open, items, markNotificationsRead]);

  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Radix closes popovers on outside click, but the title bar where this lives is a
  // data-tauri-drag-region. A click there is intercepted by Tauri to drag the window,
  // swallowing the event before it reaches Radix's dismiss layer. We catch it in the
  // capture phase to close the panel manually.
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        contentRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      toggleNotifications(false);
    };
    document.addEventListener("pointerdown", handler, { capture: true });
    return () => document.removeEventListener("pointerdown", handler, { capture: true });
  }, [open, toggleNotifications]);

  // The relative times only need to move while somebody is looking at them.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [open]);

  const unread = unreadCount(items);
  const badge = unreadBadge(unread);

  const goTo = (item: AppNotification) => {
    markNotificationRead(item.id);
    toggleNotifications(false);
    if (item.projectId) openProject(item.projectId);
    if (item.runId) setDetailRunId(item.runId);
  };

  return (
    <>
      <Popover open={open} onOpenChange={value => toggleNotifications(value)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                ref={triggerRef}
                variant="ghost"
                size="icon"
                className="relative h-7 w-7"
                aria-label={unread > 0 ? t("notifications.withUnread", { n: unread }) : t("notifications.title")}
              >
                <Bell className={cn("h-4 w-4", unread === 0 && "text-muted-foreground")} />
                {badge && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] leading-none font-semibold text-primary-foreground tabular-nums">
                    {badge}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {unread > 0 ? plural(unread, t("notifications.unread.one", { n: unread }), t("notifications.unread.other", { n: unread })) : t("notifications.title")}
          </TooltipContent>
        </Tooltip>

        {/* The window bar always paints on top (z-60): the offset keeps the panel clear of it. */}
        {/* We prevent auto-focus because it falls on the first icon button, making its tooltip appear on its own. */}
        <PopoverContent ref={contentRef} align="end" sideOffset={10} className="w-[360px] p-0" onOpenAutoFocus={e => e.preventDefault()}>
          <div className="flex items-center gap-1 border-b border-border px-3 py-2">
            <span className="flex-1 text-xs font-semibold">{t("notifications.title")}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={t("notifications.clearAll")}
                  disabled={items.length === 0}
                  onClick={() => clearNotifications()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("notifications.clear")}</TooltipContent>
            </Tooltip>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={t("notifications.empty.title")}
              description={t("notifications.empty.body")}
              className="py-8"
            />
          ) : (
            <div className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {items.map(item => (
                <NotificationRow key={item.id} item={item} now={now} onOpen={goTo} />
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <RunDetailDialog
        runId={detailRunId}
        open={detailRunId !== null}
        onOpenChange={value => {
          if (!value) setDetailRunId(null);
        }}
      />
    </>
  );
}
