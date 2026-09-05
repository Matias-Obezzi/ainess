import { createContext, useContext, useState, type ReactNode } from "react";

export interface DialogState<T> {
  open: boolean;
  editing: T | null;
  /** Open the dialog empty, to create a new item. */
  openCreate(): void;
  /** Open the dialog pre-filled with an existing item. */
  openEdit(item: T): void;
  close(): void;
}

/**
 * A settings section's header actions and body live in separate components (the header slot
 * and the content area of `SettingsDialog`), so "new X" / "edit X" dialog state is shared
 * through a small context instead of lifting it into the global store.
 */
export function createDialogContext<T>() {
  const Ctx = createContext<DialogState<T> | null>(null);

  function Provider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<T | null>(null);

    const value: DialogState<T> = {
      open,
      editing,
      openCreate: () => { setEditing(null); setOpen(true); },
      openEdit: (item: T) => { setEditing(item); setOpen(true); },
      close: () => setOpen(false),
    };

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  function useDialogState(): DialogState<T> {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error("useDialogState must be used within its section Provider");
    return ctx;
  }

  return { Provider, useDialogState };
}

/** Simpler on/off state, e.g. for the "Sugeridos" dialog. */
export function createToggleContext() {
  const Ctx = createContext<{ open: boolean; show(): void; hide(): void } | null>(null);

  function Provider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const value = { open, show: () => setOpen(true), hide: () => setOpen(false) };
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  function useToggleState() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error("useToggleState must be used within its section Provider");
    return ctx;
  }

  return { Provider, useToggleState };
}
