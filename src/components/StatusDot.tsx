import { AgentStatus } from "@/types";
import { cn } from "@/lib/utils";
import { Sonar } from "@/components/ui/sonar";

export function StatusDot({ status, className }: { status: AgentStatus; className?: string }) {
  const colorClass = {
    idle: "bg-gray-400",
    working: "bg-green-500",
    waiting: "bg-yellow-500",
    stopped: "bg-orange-500",
    error: "bg-red-500"
  }[status];

  const dot = <div className={cn("w-2 h-2 rounded-full", colorClass, className)} title={status} />;
  // Working is the one state that is happening right now: it sends out rings instead of blinking.
  if (status !== "working") return dot;
  return (
    <Sonar variant="pulse" rings={2} duration={2} scale={2.4} className="text-green-500">
      {dot}
    </Sonar>
  );
}
