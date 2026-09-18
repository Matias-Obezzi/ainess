import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  /**
   * The grey glyph most empty lists show. Still required: every caller has one, and it is the
   * fallback for the places `visual` cannot be resolved (a thread with no project behind it).
   */
  icon: LucideIcon;
  /** Something richer to show instead of the icon — the project's mascot in the threads. */
  visual?: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

/** Centered placeholder for any empty list, with an optional call-to-action button. */
export function EmptyState({ icon: Icon, visual, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground", className)}>
      {visual ?? <Icon className="mb-2 size-10 text-muted-foreground/50" />}
      <p className="font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-md text-sm">{description}</p>}
      {action && (
        <Button className="mt-2" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
