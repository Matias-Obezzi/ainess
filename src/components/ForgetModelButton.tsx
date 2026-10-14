// The ✕ on a model typed by hand in a picker: the app stops offering it.
import { X } from "lucide-react";
import { useAppStore } from "@/store";
import { useT } from "@/i18n/useT";
import type { ModelInfo, ProviderId } from "@/types";

export function ForgetModelButton({ provider, model }: { provider: ProviderId | undefined; model: ModelInfo }) {
  const t = useT();
  const forgetModel = useAppStore(state => state.forgetModel);
  if (!provider || !model.remembered) return null;
  // The select picks an item on pointer up and on Enter; stopping both keeps the ✕ from choosing it.
  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <button
      type="button"
      aria-label={t("models.forget", { model: model.id })}
      title={t("models.forget", { model: model.id })}
      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      onPointerDown={stop}
      onPointerUp={stop}
      onKeyDown={stop}
      onClick={e => { stop(e); forgetModel(provider, model.id); }}
    >
      <X className="size-3.5" />
    </button>
  );
}
