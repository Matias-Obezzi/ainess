import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { useAppStore } from "@/store";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

interface ContextCtxValue {
  draft: string;
  setDraft(v: string): void;
  dirty: boolean;
  save(): void;
}

const ContextCtx = createContext<ContextCtxValue | null>(null);

/** Shares the staged shared-context draft between the header's "Guardar" action and the textarea. */
export function ContextSectionProvider({ children }: { children: ReactNode }) {
  const sharedContext = useAppStore(state => state.config.sharedContext);
  const setSharedContext = useAppStore(state => state.setSharedContext);
  const [draft, setDraft] = useState(sharedContext);

  useEffect(() => setDraft(sharedContext), [sharedContext]);

  const dirty = draft !== sharedContext;
  const save = () => {
    setSharedContext(draft);
    toast.success("Contexto guardado");
  };

  return <ContextCtx.Provider value={{ draft, setDraft, dirty, save }}>{children}</ContextCtx.Provider>;
}

function useContextCtx(): ContextCtxValue {
  const ctx = useContext(ContextCtx);
  if (!ctx) throw new Error("useContextCtx must be used within ContextSectionProvider");
  return ctx;
}

export function ContextSectionActions() {
  const { dirty, save } = useContextCtx();
  return <Button size="sm" onClick={save} disabled={!dirty}>Guardar</Button>;
}

export function ContextSection() {
  const { draft, setDraft } = useContextCtx();

  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 text-sm text-muted-foreground">Se agrega al system prompt de todos los agentes.</p>
      <Textarea
        className="min-h-64 flex-1 resize-none font-mono"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  );
}
