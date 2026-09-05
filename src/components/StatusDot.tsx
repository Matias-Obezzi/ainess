import { AgentStatus } from "@/types";
import { cn } from "@/lib/utils";

export function StatusDot({ status, className }: { status: AgentStatus; className?: string }) {
  const colorClass = {
    idle: "bg-gray-400",
    working: "bg-green-500 animate-pulse",
    waiting: "bg-yellow-500",
    stopped: "bg-orange-500",
    error: "bg-red-500"
  }[status];

  return (
    <div
      className={cn("w-2 h-2 rounded-full", colorClass, className)}
      title={status}
    />
  );
}
