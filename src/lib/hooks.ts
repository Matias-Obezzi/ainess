import { Hook, HookEvent, Project, AgentConfig } from "@/types";
import { getTransport } from "./transport";
import { useAppStore } from "@/store";

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

export async function emitHookEvent(event: HookEvent, vars: Record<string, any>, ctx: HookContext): Promise<void> {
  const store = useAppStore.getState();
  const hooks = store.config.hooks || [];
  
  // Base vars: event, project, workspace, agent, agentRole, time
  const time = new Date().toISOString();
  const templateVars = {
    event,
    time,
    project: ctx.project?.name || "",
    workspace: ctx.project?.workspaceDir || "",
    agent: ctx.agent?.name || "",
    agentRole: ctx.agent?.role || "",
    runId: ctx.runId || "",
    round: ctx.round?.toString() || "",
    prompt: ctx.prompt || "",
    output: ctx.output || "",
    error: ctx.error || "",
    taskPrompt: ctx.taskPrompt || "",
    toAgent: ctx.toAgent || "",
    task: ctx.task || "",
    model: ctx.model || "",
    ...vars
  };

  const activeHooks = hooks.filter(h => {
    if (!h.enabled) return false;
    if (h.event !== event) return false;
    if (h.filter) {
      if (h.filter.agentId && h.filter.agentId !== ctx.agent?.id) return false;
      if (h.filter.projectId && h.filter.projectId !== ctx.project?.id) return false;
    }
    return true;
  });

  for (const hook of activeHooks) {
    // execute non-blocking
    executeHookAction(hook, templateVars, ctx).catch(err => {
      // report error in system feed
      const msg = `Hook ${hook.name} falló: ${err.message}`;
      console.error(msg, err);
      if (ctx.project) {
        useAppStore.setState(s => ({
          messages: [...s.messages, {
            id: crypto.randomUUID(),
            ts: Date.now(),
            projectId: ctx.project?.id,
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
        throw new Error("Límite de 5 ejecuciones de instrucción alcanzado para esta tarea (protección anti-loop).");
      }
      instructHookCounts.set(countKey, count + 1);
      
      const { instructAgent } = await import("./orchestrator");
      const text = renderTemplate(action.template, vars);
      if (ctx.project) {
        // execute instructed prompt
        await instructAgent(action.agentId, text, ctx.project.id);
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
  const vars = {
    event: hook.event,
    time: new Date().toISOString(),
    project: "Proyecto Test",
    workspace: "/test/workspace",
    agent: "Agente Test",
    agentRole: "implementer",
    runId: "run-test-123",
    round: "1",
    prompt: "Prompt de prueba",
    output: "Resultado exitoso de prueba",
    error: "",
    taskPrompt: "Tarea original",
    toAgent: "Otro Agente",
    task: "Subtarea",
    model: "test-model"
  };
  const ctx: HookContext = {
    project: {
      id: "test",
      name: "Proyecto Test",
      workspaceDir: "/test/workspace",
      createdAt: Date.now()
    }
  };
  await executeHookAction(hook, vars, ctx);
}
