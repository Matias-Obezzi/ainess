// A file an agent named, as something you can press: it opens beside the conversation.
import { FileText } from "lucide-react";
import { useAppStore } from "@/store";
import { useT } from "@/i18n/useT";
import { useCurrentProjectId } from "@/components/shell/project-pane";

export function PathChip({ path, mono = true }: { path: string; mono?: boolean }) {
  const t = useT();
  const openPreview = useAppStore(state => state.openPreview);
  const projectId = useCurrentProjectId();
  return (
    <button
      type="button"
      title={t("file.openPreview")}
      data-testid="path-chip"
      className={`inline items-baseline rounded bg-background/60 px-1 py-0.5 text-left text-[0.9em] text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid break-all ${mono ? "font-mono" : ""}`}
      onClick={e => { e.stopPropagation(); openPreview(path, projectId); }}
    >
      <FileText className="mr-1 inline h-3 w-3 shrink-0 -translate-y-px" />
      {path}
    </button>
  );
}
