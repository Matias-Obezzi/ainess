// A delegated agent's run, followed beside the conversation that delegated it: every step as it
// happens, without unfolding it inside the planner's thread.
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/StatusDot";
import { AgentAvatar } from "@/components/ProviderLogo";
import { RunActivity } from "./RunActivity";
import { useAppStore, selectAgent, selectLiveRun } from "@/store";
import { runDotStatus, runStatusLabelKey } from "@/lib/status-labels";
import { useT } from "@/i18n/useT";
import { useCurrentProjectId } from "./project-pane";

export function LiveDockSection() {
  const t = useT();
  const projectId = useCurrentProjectId();
  const runId = useAppStore(state => selectLiveRun(state, projectId));
  const run = useAppStore(state => (runId ? state.runs[runId] : undefined));
  const agent = useAppStore(state => (run ? selectAgent(state, run.agentId) : undefined));
  const closeLiveRun = useAppStore(state => state.closeLiveRun);
  if (!runId || !run) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-sm">
        {agent && <AgentAvatar provider={agent.provider} color={agent.color} size={18} />}
        <span className="truncate font-medium">{agent?.name ?? run.agentId}</span>
        <StatusDot status={runDotStatus[run.status]} />
        <span className="shrink-0 text-xs text-muted-foreground">{t(runStatusLabelKey[run.status])}</span>
        <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" aria-label={t("common.close")} onClick={() => closeLiveRun(projectId)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <RunActivity runId={runId} mode="full" />
      </div>
    </div>
  );
}
