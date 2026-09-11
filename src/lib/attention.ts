import type { Approval, AgentQuestion, Task, Project, AgentRuntime, Run } from "@/types";
import { pendingApprovals } from "@/lib/approvals";

export type AttentionKind = "approval" | "question" | "task";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  projectId: string;
  agentId?: string;
  taskId?: string;
  title: string;
  at: number;
}

export interface WorkingItem {
  projectId: string;
  agentId: string;
  runId?: string;
  task?: string;
  since?: number;
}

/**
 * Everything across every project that is waiting on the user, in one list.
 *
 * Three things count: a delegation held for approval, a question an agent asked and nobody
 * answered, and a card the board put in "needs you" — which is where a failed run, a rejected
 * delegation and a review asking for changes all end up, so the runs themselves need no entry of
 * their own. A project that no longer exists cannot ask for anything.
 */
export function attentionItems(input: {
  approvals: Record<string, Approval>;
  questions: Record<string, AgentQuestion>;
  tasks: Record<string, Task[]>;
  projects: Project[];
}): AttentionItem[] {
  const { approvals, questions, tasks, projects } = input;
  const liveProjectIds = new Set(projects.map(p => p.id));
  const items: AttentionItem[] = [];

  // Pending approvals
  const pApprovals = pendingApprovals(approvals, projects);
  for (const a of pApprovals) {
    items.push({
      id: `approval:${a.id}`,
      kind: "approval",
      projectId: a.projectId,
      agentId: a.toAgentId ?? a.agentId,
      title: a.summary,
      at: a.createdAt,
    });
  }

  // Unanswered questions
  for (const q of Object.values(questions)) {
    if (q.status === "pending" && liveProjectIds.has(q.projectId)) {
      items.push({
        id: `question:${q.id}`,
        kind: "question",
        projectId: q.projectId,
        agentId: q.agentId,
        title: q.question,
        at: q.createdAt,
      });
    }
  }

  // Tasks in 'needs-you' (not archived)
  for (const [projectId, projectTasks] of Object.entries(tasks)) {
    if (liveProjectIds.has(projectId)) {
      for (const t of projectTasks) {
        if (t.status === "needs-you" && !t.archived) {
          items.push({
            id: `task:${t.id}`,
            kind: "task",
            projectId,
            agentId: t.agentId,
            taskId: t.id,
            title: t.title,
            at: t.updatedAt,
          });
        }
      }
    }
  }

  // Sort by 'at' descending (newest first)
  items.sort((a, b) => b.at - a.at);

  return items;
}

/**
 * Returns the list of agents currently working or waiting in existing projects.
 */
export function workingItems(input: {
  runtime: Record<string, Record<string, AgentRuntime>>;
  runs: Record<string, Run>;
  projects: Project[];
}): WorkingItem[] {
  const { runtime, runs, projects } = input;
  const items: WorkingItem[] = [];

  for (const p of projects) {
    const projectRuntime = runtime[p.id];
    if (!projectRuntime) continue;

    for (const [agentId, rt] of Object.entries(projectRuntime)) {
      if (rt.status === "working" || rt.status === "waiting") {
        const since = rt.currentRunId && runs[rt.currentRunId] ? runs[rt.currentRunId].startedAt : undefined;
        items.push({
          projectId: p.id,
          agentId,
          runId: rt.currentRunId,
          task: rt.currentTask,
          since,
        });
      }
    }
  }

  // Sort by 'since' ascending (longest working first), items with no 'since' go last
  items.sort((a, b) => {
    if (a.since !== undefined && b.since !== undefined) {
      return a.since - b.since;
    }
    if (a.since !== undefined) return -1;
    if (b.since !== undefined) return 1;
    return 0;
  });

  return items;
}
