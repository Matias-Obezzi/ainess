// A delegation waiting for a yes, answered where it was read.
//
// This used to be a bar across the top of the project, the full width of the window, listing every
// pending request away from the conversation that produced them. A permission is about one thing
// the agent wants to do, so it belongs next to that thing: this sits under the delegation, says
// what it is asking, and takes yes or no. What is out of view is what the composer's pill counts.
import { useState } from "react";
import { Check, X } from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/useT";

export function InlineApproval({ approvalId }: { approvalId: string }) {
  const t = useT();
  const approval = useAppStore(state => state.approvals[approvalId]);
  const approve = useAppStore(state => state.approve);
  const reject = useAppStore(state => state.reject);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!approval || approval.status !== "pending") return null;

  const decide = async (yes: boolean) => {
    setBusy(true);
    try {
      await (yes ? approve(approvalId, note || undefined) : reject(approvalId, note || undefined));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("approvals.inlineTitle")}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Input
          className="h-7 min-w-40 flex-1 text-xs"
          placeholder={t("approvals.notePlaceholder")}
          value={note}
          onChange={e => setNote(e.target.value)}
          disabled={busy}
        />
        <Button size="sm" className="h-7" disabled={busy} onClick={() => void decide(true)}>
          <Check className="mr-1 h-3.5 w-3.5" /> {t("approvals.approve")}
        </Button>
        <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => void decide(false)}>
          <X className="mr-1 h-3.5 w-3.5" /> {t("approvals.reject")}
        </Button>
      </div>
    </div>
  );
}
