// The bell in the window bar: the session's history of everything that asked for attention.
// It is not the toast system (`components/ui/toast`), which only says things in the moment, nor
// the OS notifications of `hooks/useSystemNotifications`: this is what is left afterwards.
import { useEffect, useMemo, useState, useRef } from "react";
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
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Odometer } from "@/components/ui/odometer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NotificationPanel, type NotificationData } from "@/components/ui/notification-center";
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

/** A notification of the app as the panel draws it: its kind's icon and color, its time, its text. */
function toPanelItem(item: AppNotification): NotificationData {
  const Icon = ICONS[item.kind] ?? Info;
  return {
    id: item.id,
    title: item.title,
    description: item.body,
    createdAt: item.ts,
    read: item.read,
    icon: <Icon className={cn("size-4", COLORS[item.kind] ?? COLORS.info)} />,
  };
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

  // Read is something you do: opening one, or "mark all as read". Opening the panel used to read
  // everything in it, which left the Unread tab empty the moment there was something in it.

  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

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
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [open]);

  const unread = unreadCount(items);
  const badge = unreadBadge(unread);

  const panelItems = useMemo(() => items.map(toPanelItem), [items]);

  const goTo = (item: AppNotification) => {
    markNotificationRead(item.id);
    // One that knows no place to take you is only read.
    if (!item.projectId && !item.runId) return;
    toggleNotifications(false);
    if (item.projectId) openProject(item.projectId, item.chatId ?? null, item.chatId ? "chat" : undefined);
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
                    {/* "9+" stays a word; a count rolls to its new value. */}
                    {unread > 9 ? badge : <Odometer value={unread} />}
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
          <NotificationPanel
            className="max-h-[70vh]"
            notifications={panelItems}
            now={now}
            onRead={markNotificationRead}
            onReadAll={unread > 0 ? markNotificationsRead : undefined}
            onSelect={selected => {
              const item = items.find(n => n.id === selected.id);
              if (item) goTo(item);
            }}
            footer={items.length > 0 ? (
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => clearNotifications()}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("notifications.clear")}
              </Button>
            ) : undefined}
          />
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
