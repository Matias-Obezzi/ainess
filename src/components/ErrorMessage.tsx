// An error, said in a sentence instead of dumped.
//
// What used to reach the conversation was the raw line a CLI printed — English, often about a
// subscription or a file descriptor, never about what to do next. `explainError` reads it once and
// this shows what it found, with the original one click away for when it matters.
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { explainError, firstLine, type ErrorKind } from "@/lib/errors";
import { copyText } from "@/lib/clipboard";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/utils";

/** Two of the headlines read better with what the text carried; the rest stand on their own. */
function headline(t: ReturnType<typeof useT>, kind: ErrorKind, titleKey: string, values?: Record<string, string>): string {
  if (kind === "model" && values?.model) return t("error.model.titleNamed", { model: values.model });
  if (kind === "tool" && values?.tool) return t("error.tool.titleNamed", { tool: values.tool });
  return t(titleKey);
}

export function ErrorMessage({ text, className }: { text: string; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const explained = explainError(text);

  const title = headline(t, explained.kind, explained.titleKey, explained.values);
  const hint = explained.values?.wait
    ? t("error.quota.hintWait", { wait: explained.values.wait })
    : explained.hintKey
      ? t(explained.hintKey)
      : undefined;

  // Nothing was recognized: the text itself is the best headline there is, and there is no detail
  // to hide because what would be hidden is what is already shown.
  const unknown = explained.kind === "unknown";
  const summary = unknown ? firstLine(explained.raw) : title;
  const hasDetail = !unknown || explained.raw.length > summary.length;

  return (
    <div className={cn("rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs", className)}>
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-destructive">{summary}</p>
          {hint && <p className="mt-0.5 text-muted-foreground">{hint}</p>}

          <div className="mt-1 flex items-center gap-2">
            {hasDetail && (
              <button
                type="button"
                className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(v => !v)}
              >
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {open ? t("error.hideDetail") : t("error.showDetail")}
              </button>
            )}
            <button
              type="button"
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => void copyText(explained.raw, t("error.copied"))}
            >
              <Copy className="h-3 w-3" /> {t("error.copy")}
            </button>
          </div>

          {open && (
            <pre className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded bg-background/60 p-1.5 font-mono text-[11px] text-muted-foreground">
              {explained.raw}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
