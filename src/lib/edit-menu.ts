// What a right click offers over something you can type into, and which of those apply right now.
//
// Apart from the component so the rules are a test and not a click: they are the whole reason the
// menu is not four buttons that are always on.
export type EditMenuKey = "cut" | "copy" | "paste" | "selectAll";

export interface EditTarget {
  /** A terminal only copies and pastes: cutting a line of output means nothing there. */
  terminal?: boolean;
  hasSelection: boolean;
  hasContent: boolean;
  /** A field that cannot be typed into still gives its text away, but takes none. */
  readOnly?: boolean;
}

export interface EditMenuItem {
  key: EditMenuKey;
  enabled: boolean;
}

/** The dictionary key each item is labelled with. */
export const editMenuLabels: Record<EditMenuKey, string> = {
  cut: "common.cut",
  copy: "common.copy",
  paste: "common.paste",
  selectAll: "common.selectAll",
};

/**
 * Paste is always on: telling whether the clipboard holds anything costs a read of it, which on
 * this platform is a permission-shaped operation done behind the user's back, and pasting nothing
 * is nothing anyway.
 */
export function editMenuItems({ terminal = false, hasSelection, hasContent, readOnly = false }: EditTarget): EditMenuItem[] {
  if (terminal) {
    return [
      { key: "copy", enabled: hasSelection },
      { key: "paste", enabled: true },
    ];
  }
  return [
    { key: "cut", enabled: hasSelection && !readOnly },
    { key: "copy", enabled: hasSelection },
    { key: "paste", enabled: !readOnly },
    { key: "selectAll", enabled: hasContent },
  ];
}
