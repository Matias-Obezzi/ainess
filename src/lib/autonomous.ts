// "Autonomous mode": while a project is in it, the orchestrator stops waiting for the user at the
// four points that otherwise pause a run — the round cap, a delegation that needs approval, a
// question an agent asked, and a run that died out of quota (see src/lib/orchestrator.ts and
// CLAUDE.md's autonomous-mode plan). Pure module: no store, no I/O, so the rule and the report it
// produces are both easy to test in isolation.
import type { Project, Run, Approval, AgentQuestion } from "@/types";
import { translateNow } from "@/i18n/useT";

/**
 * Whether `project` is running unattended right now.
 *
 * A missing `autonomous` or a `until` that has already passed both mean "off" — the same as each
 * other, and on purpose: this never mutates the project to clear an expired field, because it is a
 * pure function. Something else (the periodic check that turns the mode off) is what acts on the
 * expiry; this only reports it. `until === now` counts as expired, not as still on: the mode is a
 * half-open window, and treating the boundary as "still running" is how a mode meant to always
 * turn itself off could end up not doing that on the one call that happens to land exactly on it.
 */
export function isAutonomous(project: Project | undefined, now: number = Date.now()): boolean {
  return !!project?.autonomous && project.autonomous.until > now;
}

/**
 * How many questions one task may have answered for it before the mode gives up and waits for the
 * user after all.
 *
 * Autonomous mode takes the round cap off, and the round cap is the only thing that otherwise
 * bounds an agent that answers every answer with another question. Past this the questions go back
 * to being questions: waking up to a task that needs an answer beats waking up to a night of quota
 * spent going in circles.
 */
export const MAX_AUTO_ANSWERS = 10;

/**
 * Whether a question asked by a task that has already had `used` of them answered for it should be
 * answered too, or left for the user. See `MAX_AUTO_ANSWERS`.
 */
export function canAutoAnswer(project: Project | undefined, used: number, now: number = Date.now()): boolean {
  return isAutonomous(project, now) && used < MAX_AUTO_ANSWERS;
}

export interface AutonomousReportInput {
  /** Runs of the project that finished or failed while the mode was on. */
  runs: Run[];
  /** Delegations approved without asking (only the ones with `auto: true` count). */
  autoApprovals: Approval[];
  /** Questions answered without asking (only the ones with `auto: true` count). */
  autoAnswers: AgentQuestion[];
  /** Runs currently parked, waiting for their provider's quota to come back. */
  quotaWaits: number;
}

export interface AutonomousReport {
  finished: number;
  failed: number;
  autoApproved: string[];
  autoAnswered: { question: string; instruction: string }[];
  quotaWaits: number;
  /** One line per section that actually happened; empty when there is nothing to say. */
  lines: string[];
}

/**
 * Builds the summary of one stretch of autonomous mode: what finished, what failed, what was
 * approved and answered on the project's own say-so, and what is still waiting on quota.
 *
 * Every section is skipped when it has nothing in it — a report that always shows "0 aprobaciones
 * automáticas" reads as noise the one night that number is never anything else, so silence is what
 * says "nothing happened here" instead of a zero doing it.
 */
export function autonomousReport(input: AutonomousReportInput): AutonomousReport {
  const finished = input.runs.filter(r => r.status === "done").length;
  const failed = input.runs.filter(r => r.status === "error").length;
  const autoApproved = input.autoApprovals.filter(a => a.auto).map(a => a.summary);
  const autoAnswered = input.autoAnswers
    .filter(q => q.auto)
    .map(q => ({ question: q.question, instruction: (q.answer ?? []).join(", ") }));
  const quotaWaits = input.quotaWaits;

  const lines: string[] = [];
  if (finished > 0 || failed > 0) {
    lines.push(translateNow("autonomous.report.tasks", { finished, failed }));
  }
  for (const summary of autoApproved) {
    lines.push(translateNow("autonomous.report.approved", { summary }));
  }
  for (const a of autoAnswered) {
    lines.push(translateNow("autonomous.report.answered", { question: a.question, instruction: a.instruction }));
  }
  if (quotaWaits > 0) {
    lines.push(translateNow("autonomous.report.quotaWaits", { n: quotaWaits }));
  }

  return { finished, failed, autoApproved, autoAnswered, quotaWaits, lines };
}
