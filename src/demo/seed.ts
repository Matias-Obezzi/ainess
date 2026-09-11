// A made-up workspace, for the screenshots in the README.
//
// The alternative was photographing a real one, which means either an empty app — nothing to show —
// or somebody's actual repositories, prompts and spending on the front page of a public project.
// So this invents a plausible afternoon instead: three agents, a task that has been delegated and
// is being worked on, a fortnight of usage behind it.
//
// Dev only, and it says so structurally: everything below is reached through `import.meta.env.DEV`,
// which vite replaces with `false` in a production build, so the bundler drops the import and none
// of this ships. It is also the reason the numbers here can be obviously invented without anyone
// mistaking them for a measurement.
//
// Run it with `npm run screenshots`, or by hand at `http://localhost:5173/?demo=<screen>`.
import type { AppConfig, CommMessage, Run, Task } from "@/types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * The real clock, not a fixed date.
 *
 * Determinism would be nice for diffing the PNGs, but everything on screen is written as "2 hours
 * ago" against the actual time — pinned to a date in the past, every row read "0 sec. ago", which
 * is the one thing a screenshot of a working afternoon must not say.
 */
const NOW = Date.now();

const PROJECT = "p-checkout";
const PLANNER = "a-planner";
const IMPL_ONE = "a-impl-1";
const IMPL_TWO = "a-impl-2";
const REVIEWER = "a-reviewer";

const AGENTS: AppConfig["projects"][number]["agents"] = [
  {
    id: PLANNER, name: "Claude", provider: "claude", role: "planner", parentId: null,
    autoApprove: true, color: "#d97757", model: "opus",
    description: "Reads the repo, splits the work and delegates it.",
  },
  {
    id: IMPL_ONE, name: "Implementer 1", provider: "antigravity", role: "implementer", parentId: PLANNER,
    autoApprove: true, color: "#4f8cff",
    description: "Writes the code in the workspace.",
  },
  {
    id: IMPL_TWO, name: "Implementer 2", provider: "copilot", role: "implementer", parentId: PLANNER,
    autoApprove: true, color: "#8b5cf6",
    description: "Writes the code in the workspace.",
  },
  {
    id: REVIEWER, name: "Reviewer", provider: "claude", role: "reviewer", parentId: PLANNER,
    autoApprove: true, color: "#10b981", model: "sonnet",
    description: "Checks what the implementers did before it is called done.",
  },
];

export function demoConfig(base: AppConfig): AppConfig {
  return {
    ...base,
    language: "en",
    approveDelegations: false,
    projects: [
      {
        id: PROJECT,
        name: "checkout-api",
        workspaceDir: "C:/work/checkout-api",
        color: "#6366f1",
        createdAt: NOW - 30 * DAY,
        agents: AGENTS,
        budget: { monthlyUsd: 50, onReached: "warn" },
      },
      {
        id: "p-landing",
        name: "landing",
        workspaceDir: "C:/work/landing",
        color: "#f59e0b",
        createdAt: NOW - 12 * DAY,
        agents: AGENTS.map(a => ({ ...a, id: `landing-${a.id}` })),
      },
    ],
    formations: [
      { id: "f-team", name: "Full team", description: "Planner, two implementers and a reviewer", agents: AGENTS },
      { id: "f-solo", name: "Just a planner", agents: [AGENTS[0]] },
    ],
    defaultFormationId: "f-team",
    // Left null: `runInit` restores the last project, which would send the home shot to a board.
    lastProjectId: null,
  };
}

/** Two weeks of finished work, so the usage strip under the box has a shape instead of one bar. */
function history(): Run[] {
  // Each with the answer it got: a thread of six identical "Done." reads as a fixture, which is
  // exactly what a screenshot must not look like.
  const past: Array<[string, string]> = [
    ["Add idempotency keys to the payment endpoint", "Added, keyed on the order id. Two requests with the same key now return the same charge instead of making a second one."],
    ["The webhook retries twice on a 500, make it back off", "It retries with a delay that doubles now, five times at most, and gives up instead of hammering."],
    ["Split the checkout controller, it is 900 lines", "Split into four: cart, pricing, payment and confirmation. The tests did not have to change."],
    ["Write tests for the refund path", "Eleven of them. A partial refund over the original amount was not checked anywhere; it is now, and it failed until I fixed the guard."],
    ["Upgrade the stripe client and fix what breaks", "Upgraded. Two call sites moved to the new intents API and one deprecated field is gone."],
    ["Cache the tax lookup, it is called per line item", "Cached per order rather than per line. A ten-line cart went from ten lookups to one."],
  ];
  const runs: Run[] = [];
  for (let day = 13; day >= 1; day--) {
    // Uneven on purpose: real weeks are not flat, and a flat strip reads as fake.
    const count = [0, 1, 3, 2, 0, 4, 2, 1, 3, 5, 2, 0, 3][day % 13];
    for (let i = 0; i < count; i++) {
      const startedAt = NOW - day * DAY + i * 40 * 60 * 1000;
      runs.push({
        id: `r-${day}-${i}`, projectId: day % 4 === 0 ? "p-landing" : PROJECT,
        agentId: PLANNER, parentRunId: null, rootRunId: `r-${day}-${i}`,
        prompt: past[(day + i) % past.length][0],
        status: day === 3 && i === 0 ? "error" : "done",
        startedAt, endedAt: startedAt + 11 * 60 * 1000,
        output: past[(day + i) % past.length][1], rawLines: [], childRunIds: [], round: 0,
        usage: { costUsd: 0.31 + (i % 3) * 0.22, inputTokens: 48_000 + i * 9_000, outputTokens: 5_200 + i * 900 },
      });
    }
  }
  return runs;
}

/** The run on screen: the planner has delegated and one implementer is still working. */
function live(): { runs: Run[]; messages: CommMessage[] } {
  const rootId = "r-live";
  const childId = "r-live-child";
  const startedAt = NOW - 6 * 60 * 1000;

  const runs: Run[] = [
    {
      id: rootId, projectId: PROJECT, agentId: PLANNER, parentRunId: null, rootRunId: rootId,
      prompt: "The checkout retries a failed payment twice and charges the card each time. Find it and fix it.",
      status: "running", startedAt, output: "", rawLines: [],
      childRunIds: [childId], round: 0, model: "opus",
    },
    {
      id: childId, projectId: PROJECT, agentId: IMPL_ONE, parentRunId: rootId, rootRunId: rootId,
      prompt: "Make the retry idempotent: reuse the payment intent instead of creating a second one.",
      status: "running", startedAt: startedAt + 90 * 1000, output: "", rawLines: [],
      childRunIds: [], round: 0,
    },
  ];

  let at = startedAt;
  const step = (kind: CommMessage["kind"], text: string, meta?: CommMessage["meta"], runId = rootId): CommMessage => {
    at += 14 * 1000;
    return { id: `m-${at}`, ts: at, runId, projectId: PROJECT, fromAgentId: PLANNER, kind, text, meta };
  };

  const messages: CommMessage[] = [
    { id: "m-user", ts: startedAt - 1000, projectId: PROJECT, fromAgentId: "user", toAgentId: PLANNER, kind: "user",
      text: "The checkout retries a failed payment twice and charges the card each time. Find it and fix it." },
    step("tool", "Grep(pattern: \"retry\", path: \"src/payments\")", { tool: "Grep", summary: "Grep · retry in src/payments" }),
    step("tool", "Read(src/payments/charge.ts)", { tool: "Read", summary: "Read · src/payments/charge.ts" }),
    step("text", "The retry builds a fresh payment intent each time instead of reusing the one that failed, so the gateway sees three separate charges. I will have this fixed and covered by a test."),
    { id: "m-deleg", ts: at + 8000, runId: rootId, projectId: PROJECT, fromAgentId: PLANNER, toAgentId: IMPL_ONE,
      kind: "delegation", text: "Make the retry idempotent: reuse the payment intent instead of creating a second one." },
    { id: "m-c1", ts: at + 20000, runId: childId, projectId: PROJECT, fromAgentId: IMPL_ONE, kind: "tool",
      text: "Edit(src/payments/charge.ts)", meta: { tool: "Edit", summary: "Edit · src/payments/charge.ts" } },
    { id: "m-c2", ts: at + 34000, runId: childId, projectId: PROJECT, fromAgentId: IMPL_ONE, kind: "tool",
      text: "Bash(npm test -- payments)", meta: { tool: "Bash", summary: "npm test -- payments" } },
  ];

  return { runs, messages };
}

function tasks(): Task[] {
  const base = { projectId: PROJECT, dependsOn: [] as string[], archived: false, createdAt: NOW - 2 * DAY, updatedAt: NOW - HOUR };
  return [
    { ...base, id: "t-1", title: "Double charge on a retried payment", status: "working", priority: "high", agentId: IMPL_ONE, runId: "r-live-child", order: 0, detail: "The retry builds a fresh payment intent instead of reusing the failed one." },
    { ...base, id: "t-2", title: "Back off before retrying a 500 from the webhook", status: "backlog", agentId: IMPL_TWO, order: 0, dependsOn: ["t-1"] },
    { ...base, id: "t-3", title: "Split the checkout controller", status: "backlog", order: 1 },
    { ...base, id: "t-4", title: "Tests for the refund path", status: "in-review", agentId: REVIEWER, order: 0 },
    { ...base, id: "t-5", title: "Upgrade the stripe client", status: "ready", agentId: IMPL_ONE, order: 0 },
    { ...base, id: "t-6", title: "Idempotency keys on the payment endpoint", status: "done", agentId: IMPL_ONE, order: 0 },
    { ...base, id: "t-7", title: "Cache the tax lookup", status: "done", agentId: IMPL_TWO, order: 1 },
  ];
}

/** Everything the store needs on top of the config, applied once init has settled. */
export function demoState() {
  const { runs, messages } = live();
  const all = [...history(), ...runs];
  return {
    runs: Object.fromEntries(all.map(r => [r.id, r])),
    messages,
    tasks: { [PROJECT]: tasks() },
    binaries: {
      claude: { path: "C:/Users/you/AppData/Roaming/npm/claude.cmd", version: "2.0.44" },
      antigravity: { path: "C:/Users/you/.gemini/bin/agy.exe", version: "0.4.1" },
      copilot: { path: "C:/Users/you/AppData/Roaming/npm/copilot.cmd", version: "0.3.9" },
    },
    runtime: {
      [PROJECT]: {
        [PLANNER]: { agentId: PLANNER, status: "working" as const, currentRunId: "r-live", currentTask: "Find the double charge", queuedInstructions: [] },
        [IMPL_ONE]: { agentId: IMPL_ONE, status: "working" as const, currentRunId: "r-live-child", currentTask: "Make the retry idempotent", queuedInstructions: [] },
        [IMPL_TWO]: { agentId: IMPL_TWO, status: "idle" as const, queuedInstructions: [] },
        [REVIEWER]: { agentId: REVIEWER, status: "idle" as const, queuedInstructions: [] },
      },
    },
    activeTaskRunId: { [PROJECT]: "r-live" },
  };
}

export const DEMO_PROJECT_ID = PROJECT;
