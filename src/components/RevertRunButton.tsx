import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/lib/confirm";
import { applyRevert, isEmptyPlan, planRevertOfRun, type RevertPlan } from "@/lib/run-revert";
import { useT } from "@/i18n/useT";
import type { Run } from "@/types";
import { Undo2 } from "lucide-react";

/** As many as fit in a question without turning it into a wall. */
const LISTED = 12;

/**
 * Puts the folder back the way it was before this run.
 *
 * The plan is read first and shown before anything happens, because this is the one button in the
 * app that deletes someone's files. What it will not touch is named too: a file that was already
 * modified when the run started stays where it is, since the agent's edit and the user's are in the
 * same file and there is no way from here to tell them apart.
 */
export function RevertRunButton({ run }: { run: Run }) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  if (run.status === "running" || !run.cwd || !run.baseSha) return null;

  const ask = async () => {
    setBusy(true);
    try {
      const plan = await planRevertOfRun(run);
      if (!plan) {
        toast.error(t("revert.unavailable"));
        return;
      }
      if (isEmptyPlan(plan)) {
        toast.success(t("revert.nothingToUndo"));
        return;
      }
      const ok = await confirm({
        title: t("revert.confirmTitle"),
        description: describe(plan, t),
        destructive: true,
        confirmText: t("revert.confirmAction"),
      });
      if (!ok) return;

      const result = await applyRevert(run.cwd!, run.baseSha!, plan);
      if (result.ok) {
        toast.success(t("revert.done", { n: String(plan.restore.length + plan.remove.length) }));
      } else {
        toast.error(t("revert.failed", { error: result.error ?? "" }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void ask()}>
      <Undo2 className="size-3.5" />
      {t("revert.button")}
    </Button>
  );
}

function describe(plan: RevertPlan, t: (key: string, vars?: Record<string, string>) => string): string {
  const parts: string[] = [];
  if (plan.restore.length > 0) {
    parts.push(t("revert.willRestore", { n: String(plan.restore.length), files: list(plan.restore) }));
  }
  if (plan.remove.length > 0) {
    parts.push(t("revert.willRemove", { n: String(plan.remove.length), files: list(plan.remove) }));
  }
  if (plan.keptDirty.length > 0) {
    parts.push(t("revert.willKeep", { n: String(plan.keptDirty.length), files: list(plan.keptDirty) }));
  }
  return parts.join("\n\n");
}

function list(paths: string[]): string {
  const shown = paths.slice(0, LISTED).join(", ");
  return paths.length > LISTED ? `${shown}…` : shown;
}
