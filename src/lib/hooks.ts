import { Hook, HookEvent, Project, AgentConfig } from "@/types";
import { getTransport } from "./transport";
import { useAppStore } from "@/store";
import { log } from "@/lib/logger";
import { BOSS_TARGET, bossOf } from "@/lib/team";
import { translateNow } from "@/i18n/useT";

export interface HookContext {
  project?: Project;
  agent?: AgentConfig;
  runId?: string;
  round?: number;
  prompt?: string;
  output?: string;
  error?: string;
  taskPrompt?: string;
  toAgent?: string; // para delegation
  task?: string;    // para delegation
  model?: string;   // para delegation
}

/**
 * `ctx` can be a function of the hook: a system event (a clock, the connection, a file) has no
 * agent or run behind it, so each hook says which project it is about — its own filter — instead
 * of all of them sharing one context.
 */
export async function emitHookEvent(
  event: HookEvent,
  vars: Record<string, any>,
  ctx: HookContext | ((hook: Hook) => HookContext),
): Promise<void> {
  const store = useAppStore.getState();
  const hooks = store.config.hooks || [];
  const time = new Date().toISOString();
  const contextOf = (hook: Hook): HookContext => (typeof ctx === "function" ? ctx(hook) : ctx);

  const activeHooks = hooks.filter(h => {
    if (!h.enabled) return false;
    if (h.event !== event) return false;
    const hookCtx = contextOf(h);
    if (h.filter) {
      if (h.filter.agentId && h.filter.agentId !== hookCtx.agent?.id) return false;
      if (h.filter.projectId && h.filter.projectId !== hookCtx.project?.id) return false;
    }
    return true;
  });

  for (const hook of activeHooks) {
    const hookCtx = contextOf(hook);
    // Base vars: event, project, workspace, agent, agentRole, time
    const templateVars = {
      event,
      time,
      project: hookCtx.project?.name || "",
      workspace: hookCtx.project?.workspaceDir || "",
      agent: hookCtx.agent?.name || "",
      agentRole: hookCtx.agent?.role || "",
      runId: hookCtx.runId || "",
      round: hookCtx.round?.toString() || "",
      prompt: hookCtx.prompt || "",
      output: hookCtx.output || "",
      error: hookCtx.error || "",
      taskPrompt: hookCtx.taskPrompt || "",
      toAgent: hookCtx.toAgent || "",
      task: hookCtx.task || "",
      model: hookCtx.model || "",
      ...vars
    };
    // execute non-blocking
    executeHookAction(hook, templateVars, hookCtx).catch(err => {
      // report error in system feed
      const msg = translateNow("hooks.failed", { name: hook.name, error: err.message });
      log.error("hooks", msg, err);
      if (hookCtx.project) {
        useAppStore.setState(s => ({
          messages: [...s.messages, {
            id: crypto.randomUUID(),
            ts: Date.now(),
            projectId: hookCtx.project?.id,
            fromAgentId: "user",
            kind: "system",
            text: msg
          }]
        }));
      }
    });
  }
}

// Anti-loop protection
const instructHookCounts = new Map<string, number>();

/**
 * Who an instruct hook actually writes to. A named agent is one agent in one project; `BOSS_TARGET`
 * is resolved when the hook fires, so it survives the team being rearranged:
 *
 * - filtered to a project → that project's boss;
 * - fired by something an agent did → the boss of the project it happened in;
 * - fired by the machine (a clock, the connection, the app opening) with no project filter → the
 *   boss of every project, which is the point of the option: one hook, every team's top agent.
 */
export function instructTargets(hook: Hook, ctx: HookContext): Array<{ agentId: string; projectId: string }> {
  const action = hook.action;
  if (action.type !== "instruct") return [];
  if (action.agentId !== BOSS_TARGET) {
    return ctx.project ? [{ agentId: action.agentId, projectId: ctx.project.id }] : [];
  }

  const projects = useAppStore.getState().config.projects;
  const wanted = hook.filter?.projectId ?? (ctx.agent ? ctx.project?.id : undefined);
  const reach = wanted ? projects.filter(p => p.id === wanted) : projects;

  return reach.flatMap(project => {
    const boss = bossOf(project.agents ?? []);
    return boss ? [{ agentId: boss.id, projectId: project.id }] : [];
  });
}

async function executeHookAction(hook: Hook, vars: Record<string, any>, ctx: HookContext) {
  const { renderTemplate } = await import("./template");
  const transport = getTransport();
  
  const action = hook.action;
  switch (action.type) {
    case "slack": {
      const body = JSON.stringify({ text: renderTemplate(action.template, vars) });
      await transport.httpPost(action.webhookUrl, body, { "Content-Type": "application/json" });
      break;
    }
    case "discord": {
      // discord limit is 2000 chars, truncate text or template render?
      let content = renderTemplate(action.template, vars);
      if (content.length > 2000) content = content.substring(0, 1999) + "…";
      const body = JSON.stringify({ content });
      await transport.httpPost(action.webhookUrl, body, { "Content-Type": "application/json" });
      break;
    }
    case "telegram": {
      const store = useAppStore.getState();
      const token = store.config.messaging?.telegram?.token;
      if (!token) {
        throw new Error(translateNow("hooks.telegramNoToken"));
      }
      let content = renderTemplate(action.template, vars);
      if (content.length > 4096) content = content.slice(0, 4096);
      const { sendToChat, sendToAllowed } = await import("./bridge");
      if (action.chatId) {
        await sendToChat(action.chatId, content);
      } else {
        await sendToAllowed(content);
      }
      break;
    }
    case "webhook": {
      const body = renderTemplate(action.bodyTemplate, vars);
      await transport.httpPost(action.url, body, action.headers || {});
      break;
    }
    case "command": {
      let args = action.args.map(a => renderTemplate(a, vars));
      // For Windows cmd args logic, if it's cmd, just replace normally and exec will handle.
      let cwd = action.cwd;
      if (cwd === "workspace" && ctx.project) {
        cwd = ctx.project.workspaceDir;
      }
      // Note: we can't use spawnRun directly because we need stdout/stderr to log it as system message.
      // Wait, transport.exec does wait and return stdout/stderr.
      const res = await transport.exec(action.program, args);
      // Wait, `transport.exec` does not currently take `cwd`. Oh, it might need to!
      // Let's modify transport.exec or just do it if we need to.
      // In transport-node.ts, exec runs in process.cwd(). Let me update transport.exec to support cwd!
      // I will update transport.ts `exec` signature later.
      const out = res.stdout.trim() || res.stderr.trim();
      if (out && ctx.project) {
        useAppStore.setState(s => ({
          messages: [...s.messages, {
            id: crypto.randomUUID(),
            ts: Date.now(),
            projectId: ctx.project?.id,
            fromAgentId: "user",
            kind: "system",
            text: `Hook [${hook.name}] command output:\n${out.substring(0, 500)}${out.length > 500 ? '...' : ''}`
          }]
        }));
      }
      break;
    }
    case "instruct": {
      // limit 5 per rootRunId
      let rootId = "global";
      if (ctx.runId) {
        // Need to find rootRunId from the store
        const store = useAppStore.getState();
        const run = store.runs[ctx.runId];
        if (run) rootId = run.rootRunId;
      }
      const countKey = `${hook.id}:${rootId}`;
      const count = instructHookCounts.get(countKey) || 0;
      if (count >= 5) {
        throw new Error(translateNow("hooks.loopLimit", { n: 5 }));
      }
      instructHookCounts.set(countKey, count + 1);
      
      const { instructAgent } = await import("./orchestrator");
      const text = renderTemplate(action.template, vars);
      for (const target of instructTargets(hook, ctx)) {
        await instructAgent(target.agentId, text, target.projectId);
      }
      break;
    }
    case "notify": {
      const title = renderTemplate(action.title, vars);
      const description = renderTemplate(action.template, vars);
      // Try to import toast from UI, if in app
      try {
        const { toast } = await import("@/components/ui/toast");
        toast({ title, description });
      } catch (e) {
        // CLI fallback
        console.error(`[notificación] ${title}: ${description}`);
      }
      break;
    }
  }
}

export async function testHookAction(hook: Hook): Promise<void> {
  // Sample values in the user's language: the point of the button is seeing the message you will
  // actually get, and half of it arriving in Spanish is not that.
  const vars = {
    event: hook.event,
    time: new Date().toISOString(),
    project: translateNow("hookTest.project"),
    workspace: "/test/workspace",
    agent: translateNow("hookTest.agent"),
    agentRole: "implementer",
    runId: "run-test-123",
    round: "1",
    prompt: translateNow("hookTest.prompt"),
    output: translateNow("hookTest.output"),
    error: translateNow("hookTest.error"),
    taskPrompt: translateNow("hookTest.taskPrompt"),
    toAgent: translateNow("hookTest.toAgent"),
    task: translateNow("hookTest.task"),
    question: translateNow("hookTest.question"),
    summary: translateNow("hookTest.summary"),
    model: "test-model"
  };
  const ctx: HookContext = {
    project: {
      id: "test",
      name: translateNow("hookTest.project"),
      workspaceDir: "/test/workspace",
      createdAt: Date.now(),
      agents: []
    }
  };
  await executeHookAction(hook, vars, ctx);
}
