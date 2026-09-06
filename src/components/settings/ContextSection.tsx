import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { useAppStore } from "@/store";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n/useT";

interface ContextCtxValue {
  draft: string;
  setDraft(v: string): void;
  dirty: boolean;
  save(): void;
}

const ContextCtx = createContext<ContextCtxValue | null>(null);

/** Shares the staged shared-context draft between the header's "Guardar" action and the textarea. */
export function ContextSectionProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const sharedContext = useAppStore(state => state.config.sharedContext);
  const setSharedContext = useAppStore(state => state.setSharedContext);
  const [draft, setDraft] = useState(sharedContext);

  useEffect(() => setDraft(sharedContext), [sharedContext]);

  const dirty = draft !== sharedContext;
  const save = () => {
    setSharedContext(draft);
    toast.success(t("context.saved"));
  };

  return <ContextCtx.Provider value={{ draft, setDraft, dirty, save }}>{children}</ContextCtx.Provider>;
}

function useContextCtx(): ContextCtxValue {
  const ctx = useContext(ContextCtx);
  if (!ctx) throw new Error("useContextCtx must be used within ContextSectionProvider");
  return ctx;
}

export function ContextSectionActions() {
  const t = useT();
  const { dirty, save } = useContextCtx();
  return <Button size="sm" onClick={save} disabled={!dirty}>{t("common.save")}</Button>;
}

export function ContextSection() {
  const t = useT();
  const { draft, setDraft } = useContextCtx();

  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 text-sm text-muted-foreground">{t("context.intro")}</p>
      <Textarea
        className="min-h-64 flex-1 resize-none font-mono"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  );
}
