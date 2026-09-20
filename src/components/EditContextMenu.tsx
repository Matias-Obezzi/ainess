// The right-click menu of every field in the app, and of the terminals.
//
// WebView2's own menu is off (src-tauri/src/webview.rs): a desktop window offering "reload" and
// "view source" is out of place. Copying and pasting with the mouse is not, and that is what went
// with it, so this puts it back.
//
// One menu, mounted once at the root, that listens for the click instead of hanging off each
// field: a field written tomorrow gets it without anybody remembering to ask for it.
import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Copy, Scissors, TextSelect } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DropdownActionItems, type MenuAction } from "@/components/menu-actions";
import { editMenuItems, editMenuLabels, type EditMenuItem, type EditMenuKey } from "@/lib/edit-menu";
import { copyText } from "@/lib/clipboard";
import { pasteIntoTerminal, terminalAt } from "@/lib/terminal-registry";
import { useT } from "@/i18n/useT";

const ICONS: Record<EditMenuKey, React.ComponentType<{ className?: string }>> = {
  cut: Scissors,
  copy: Copy,
  paste: ClipboardPaste,
  selectAll: TextSelect,
};

/** Inputs that hold no text: a right click on a checkbox is not about editing. */
const NOT_TEXT = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

const EDITABLE = "input, textarea, [contenteditable=''], [contenteditable='true']";

interface Spot {
  x: number;
  y: number;
  items: EditMenuItem[];
  /** What copy and cut take, read at click time: by the time an item is picked, focus has moved. */
  selection: string;
  /** Puts focus and selection back where the click found them, so the edit lands there. */
  restore(): void;
  /** Set when the click landed in a terminal: pasting there writes to the PTY, not to the DOM. */
  terminalId?: string;
}

/** What the click landed on, or nothing when it was not something you can type into. */
function spotFor(event: MouseEvent): Spot | null {
  const target = event.target as Element | null;
  if (!target) return null;
  const at = { x: event.clientX, y: event.clientY };

  const terminal = terminalAt(target);
  if (terminal) {
    const selection = terminal.entry.term.getSelection();
    return {
      ...at,
      terminalId: terminal.id,
      selection,
      items: editMenuItems({ terminal: true, hasSelection: selection.length > 0, hasContent: true }),
      restore: () => terminal.entry.term.focus(),
    };
  }

  const field = target.closest<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  if (field) {
    if (field instanceof HTMLInputElement && NOT_TEXT.has(field.type)) return null;
    // Null on the types that have no caret (number, date): those have nothing to select either.
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selection = start != null && end != null ? field.value.slice(start, end) : "";
    return {
      ...at,
      selection,
      items: editMenuItems({
        hasSelection: selection.length > 0,
        hasContent: field.value.length > 0,
        readOnly: field.readOnly || field.disabled,
      }),
      restore: () => {
        field.focus();
        if (start != null) field.setSelectionRange(start, end);
      },
    };
  }

  const host = target.closest<HTMLElement>(EDITABLE);
  if (!host) return null;
  // A contenteditable keeps its selection in the document, and the document's selection is what
  // the menu takes away when it opens — so it is cloned here and put back before the edit.
  const live = window.getSelection();
  const range = live && live.rangeCount > 0 && host.contains(live.anchorNode) ? live.getRangeAt(0).cloneRange() : null;
  const selection = range && !range.collapsed ? range.toString() : "";
  return {
    ...at,
    selection,
    items: editMenuItems({ hasSelection: selection.length > 0, hasContent: (host.textContent ?? "").length > 0 }),
    restore: () => {
      host.focus();
      if (!range) return;
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    },
  };
}

/**
 * Does the thing, on the field the click came from.
 *
 * `execCommand` is deprecated and is still the only edit that goes through the browser's own
 * machinery: it respects the selection, leaves the caret after what it wrote, keeps the undo
 * stack, and fires the `input` event React needs to see — a controlled field written any other
 * way ends up showing one thing and holding another.
 */
async function perform(key: EditMenuKey, spot: Spot, copied: string): Promise<void> {
  if (spot.terminalId) {
    if (key === "copy") await copyText(spot.selection, copied);
    else await pasteIntoTerminal(spot.terminalId);
    return;
  }
  spot.restore();
  switch (key) {
    case "copy":
      await copyText(spot.selection, copied);
      break;
    case "cut":
      // Only once the clipboard has it: a cut that fails to copy would be a delete.
      if (await copyText(spot.selection, copied)) document.execCommand("delete");
      break;
    case "paste": {
      const text = await navigator.clipboard.readText().catch(() => "");
      if (text) document.execCommand("insertText", false, text);
      break;
    }
    case "selectAll":
      document.execCommand("selectAll");
      break;
  }
}

export function EditContextMenu() {
  const t = useT();
  const [spot, setSpot] = useState<Spot | null>(null);
  // Both live outside the render: they are read while the menu is closing, when the state that
  // drew it is already gone.
  const openedRef = useRef<Spot | null>(null);
  const pendingRef = useRef<EditMenuKey | null>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const next = spotFor(event);
      if (!next) return;
      // On the way down, not on the way up: a field inside one of the app's own menus stops the
      // event before it reaches the document (React's `stopPropagation` stops the native one too),
      // and a field is always about its own text rather than about what it sits in.
      event.preventDefault();
      event.stopPropagation();
      openedRef.current = next;
      pendingRef.current = null;
      setSpot(next);
    };
    document.addEventListener("contextmenu", handler, true);
    return () => document.removeEventListener("contextmenu", handler, true);
  }, []);

  const copied = t("common.copied");
  const actions: MenuAction[] = (spot?.items ?? []).map(item => ({
    key: item.key,
    label: t(editMenuLabels[item.key]),
    icon: ICONS[item.key],
    disabled: !item.enabled,
    // Picked now, run once the menu has let go of the focus: see `onCloseAutoFocus` below.
    onSelect: () => { pendingRef.current = item.key; },
  }));

  return (
    <DropdownMenu open={spot !== null} onOpenChange={open => { if (!open) setSpot(null); }}>
      {/* Nothing to click: it is only where the menu hangs from. Remounted on every click so the
          popover measures the new point instead of the one it opened at. */}
      <DropdownMenuTrigger asChild key={`${spot?.x ?? 0}:${spot?.y ?? 0}`}>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none fixed h-0 w-0"
          style={{ left: spot?.x ?? 0, top: spot?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={0}
        className="w-48"
        data-testid="edit-context-menu"
        onCloseAutoFocus={event => {
          // Radix would hand the focus to the anchor, which is nobody. It belongs to the field the
          // click came from, and the edit only works once it is back there.
          event.preventDefault();
          const opened = openedRef.current;
          const key = pendingRef.current;
          pendingRef.current = null;
          if (!opened) return;
          if (key) void perform(key, opened, copied);
          else opened.restore();
        }}
      >
        <DropdownActionItems actions={actions} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
