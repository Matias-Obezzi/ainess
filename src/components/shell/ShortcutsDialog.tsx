// Ctrl+/ (⌘+/ on macOS): every keyboard shortcut, grouped by where it works. The list comes from
// src/lib/shortcuts.ts, the same table App.tsx resolves its global keys from.
import { useMemo } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import {
  SHORTCUT_GROUPS,
  SHORTCUT_GROUP_KEY,
  formatShortcut,
  shortcutPlatform,
  shortcutsOfGroup,
} from "@/lib/shortcuts";
import { useT } from "@/i18n/useT";

export function ShortcutsDialog() {
  const t = useT();
  const open = useAppStore(state => state.shortcutsOpen);
  const toggleShortcuts = useAppStore(state => state.toggleShortcuts);
  const platform = useMemo(() => shortcutPlatform(), []);

  return (
    <Dialog open={open} onOpenChange={toggleShortcuts}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
          <DialogDescription>{t("shortcuts.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {SHORTCUT_GROUPS.map(group => {
            const items = shortcutsOfGroup(group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(SHORTCUT_GROUP_KEY[group])}
                </span>
                {items.map(shortcut => (
                  <div key={shortcut.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 odd:bg-muted/40">
                    {/* A fixed column, so every description starts at the same place. */}
                    <span className="flex w-28 shrink-0 items-center gap-1">
                      {formatShortcut(shortcut.keys, platform).map((part, i) => (
                        <Kbd key={`${shortcut.id}-${i}`}>{part}</Kbd>
                      ))}
                    </span>
                    <span className="text-sm text-muted-foreground">{t(shortcut.descriptionKey)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
