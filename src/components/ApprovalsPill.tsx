// How many decisions are waiting, next to the composer.
//
// The requests themselves are answered inline, under the delegation that made them (see
// InlineApproval), which is the right place but only while it is on screen. This is the part that
// has to be visible from anywhere: a count, and the list one click away.
import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import { useAppStore } from "@/store";
import { ApprovalsPanel } from "@/components/ApprovalsPanel";
import { Button } from "@/components/ui/button";
import { MovingBorder } from "@/components/ui/moving-border";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pendingApprovals } from "@/lib/approvals";
import { plural } from "@/i18n";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/utils";

export function ApprovalsPill({ className }: { className?: string }) {
  const t = useT();
  const approvals = useAppStore(state => state.approvals);
  const projects = useAppStore(state => state.config.projects);
  const currentProjectId = useAppStore(state => state.currentProjectId);

  const pending = useMemo(
    () => pendingApprovals(approvals, projects, currentProjectId),
    [approvals, projects, currentProjectId],
  );
  if (pending.length === 0) return null;

  const label = plural(
    pending.length,
    t("approvals.waiting.one", { n: pending.length }),
    t("approvals.waiting.other", { n: pending.length }),
  );

  return (
    <Popover>
      <MovingBorder radius="var(--radius-md)" color="currentColor" className={cn("text-amber-600 dark:text-amber-400 rounded-md", className)}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs rounded-[calc(var(--radius-md)-2px)]"
            aria-label={label}
            title={label}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="tabular-nums">{pending.length}</span>
          </Button>
        </PopoverTrigger>
      </MovingBorder>
      <PopoverContent align="end" className="w-96 p-3">
        <ApprovalsPanel />
      </PopoverContent>
    </Popover>
  );
}
