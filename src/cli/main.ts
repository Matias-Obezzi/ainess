import { parseArgs } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { useAppStore, selectRoots } from "@/store";
import { setTransport } from "@/lib/transport";
import { nodeTransport, killAllSync } from "@/lib/transport-node";
import { AgentConfig, Skill, McpServer, ProviderId, AgentRole } from "@/types";
import { syncMcpToAntigravity } from "@/lib/mcp-sync";

async function main() {
  setTransport(nodeTransport);
  await useAppStore.getState().init();
  const store = useAppStore.getState();

  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");

  function print(obj: any, text: string) {
    if (jsonOutput) {
      console.log(JSON.stringify(obj));
    } else {
      console.log(text);
    }
  }

  function error(msg: string): never {
    if (jsonOutput) {
      console.error(JSON.stringify({ error: msg }));
    } else {
      console.error(msg);
    }
    process.exit(2);
  }

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log("Uso: ais [opciones] <prompt>");
    console.log("  -a, --agent <nombre>   Agente a usar");
    console.log("  -w, --workspace <dir>  Directorio de trabajo");
    console.log("  --json                 Salida en JSON");
    console.log("  -q, --quiet            Solo imprimir resultado");
    console.log("  --max-rounds <n>       Rondas máximas");
    console.log("Subcomandos: agents, skills, mcp, context, run");
    process.exit(0);
  }

  const KNOWN = new Set(["run", "agents", "skills", "mcp", "context"]);
  const first = args[0];

  if (!first.startsWith("-") && !KNOWN.has(first)) {
    if (/^[a-z][a-z0-9-]{0,24}$/.test(first) && args.length === 1) {
      error(`Subcomando desconocido: "${first}". Subcomandos: ${[...KNOWN].join(", ")}`);
    }
  }

  if (first === "agents") {
    const sub = args[1] || "list";
    if (sub === "list") {
      if (jsonOutput) {
        console.log(JSON.stringify(store.config.agents));
      } else {
        for (const a of store.config.agents) {
          const parent = a.parentId ? store.config.agents.find(x => x.id === a.parentId)?.name || a.parentId : "root";
          console.log(`- ${a.name} [${a.role}] (Provider: ${a.provider}, Parent: ${parent})`);
        }
      }
      process.exit(0);
    } else if (sub === "add" || sub === "edit") {
      const { values, positionals } = parseArgs({
        args: args.slice(2),
        options: {
          name: { type: "string" },
          provider: { type: "string" },
          role: { type: "string" },
          parent: { type: "string" },
          model: { type: "string" },
          "auto-approve": { type: "boolean" },
          description: { type: "string" },
          "system-prompt-file": { type: "string" },
          color: { type: "string" },
          program: { type: "string" },
          args: { type: "string" },
        },
        allowPositionals: true
      });
      const targetName = (sub === "add" ? values.name : positionals[0]) as string | undefined;
      if (!targetName) error("Falta nombre");
      
      let agent = store.config.agents.find(a => a.name.toLowerCase() === targetName.toLowerCase());
      if (sub === "add" && agent) error("Agente ya existe");
      if (sub === "edit" && !agent) error("Agente no encontrado");

      const id = agent ? agent.id : crypto.randomUUID();
      const name = (values.name as string) || (agent ? agent.name : targetName);
      if (sub === "edit" && values.name) {
        const existing = store.config.agents.find(a => a.name.toLowerCase() === (values.name as string).toLowerCase() && a.id !== id);
        if (existing) error("Ya existe otro agente con ese nombre");
      }

      let parentId: string | null = agent ? agent.parentId : null;
      if (values.parent) {
        if (String(values.parent).toLowerCase() === "null" || values.parent === "") parentId = null;
        else {
          const p = store.config.agents.find(a => a.name.toLowerCase() === String(values.parent).toLowerCase());
          if (!p) error("Padre no encontrado");
          parentId = p.id;
        }
      }

      let systemPrompt = agent ? agent.systemPrompt : undefined;
      if (values["system-prompt-file"]) {
        systemPrompt = fs.readFileSync(values["system-prompt-file"] as string, "utf-8");
      }

      const newAgent: AgentConfig = {
        id,
        name,
        provider: (values.provider as ProviderId) || (agent?.provider ?? "claude"),
        role: (values.role as AgentRole) || (agent?.role ?? "implementer"),
        parentId,
        model: values.model !== undefined ? String(values.model) : agent?.model,
        autoApprove: values["auto-approve"] !== undefined ? Boolean(values["auto-approve"]) : (agent?.autoApprove ?? false),
        description: values.description !== undefined ? String(values.description) : agent?.description,
        systemPrompt,
        color: values.color !== undefined ? String(values.color) : agent?.color,
      };
      
      if (newAgent.provider === "custom") {
        newAgent.customCommand = {
          program: String(values.program || agent?.customCommand?.program || ""),
          args: String(values.args || agent?.customCommand?.args.join(" ") || "").split(" ")
        };
      }

      store.upsertAgent(newAgent);
      await store.saveConfig();
      print(newAgent, `Agente ${sub === "add" ? "agregado" : "editado"}: ${name}`);
      process.exit(0);
    } else if (sub === "remove") {
      const name = args[2];
      const agent = store.config.agents.find(a => a.name.toLowerCase() === name.toLowerCase());
      if (!agent) error("No encontrado");
      store.removeAgent(agent.id);
      await store.saveConfig();
      print({ id: agent.id }, `Agente eliminado`);
      process.exit(0);
    }
  }

  if (first === "skills") {
    const sub = args[1] || "list";
    if (sub === "list") {
      print(store.config.skills, store.config.skills.map(s => `- ${s.name}: ${s.description || ""}`).join("\n"));
      process.exit(0);
    } else if (sub === "add" || sub === "edit") {
      const targetName = args[2];
      if (!targetName || targetName.startsWith("-")) error("Falta nombre");
      
      const { values } = parseArgs({
        args: args.slice(3),
        options: {
          file: { type: "string" },
          description: { type: "string" },
          agents: { type: "string" },
        }
      });

      let skill = store.config.skills.find(s => s.name.toLowerCase() === targetName.toLowerCase());
      if (sub === "add" && skill) error("Skill ya existe");
      if (sub === "edit" && !skill) error("Skill no encontrado");

      const id = skill ? skill.id : crypto.randomUUID();
      let content = skill ? skill.content : "";
      if (values.file) content = fs.readFileSync(values.file as string, "utf-8");

      let enabledFor: "all" | string[] = skill ? skill.enabledFor : "all";
      if (values.agents) {
        if (values.agents === "all") enabledFor = "all";
        else {
          enabledFor = String(values.agents).split(",").map((n: string) => {
            const a = store.config.agents.find(x => x.name.toLowerCase() === n.trim().toLowerCase());
            if (!a) error(`Agente ${n} no encontrado`);
            return a.id;
          });
        }
      }

      const newSkill: Skill = {
        id,
        name: targetName,
        description: values.description !== undefined ? String(values.description) : skill?.description,
        content,
        enabledFor
      };

      store.upsertSkill(newSkill);
      await store.saveConfig();
      print(newSkill, `Skill ${sub} ok`);
      process.exit(0);
    } else if (sub === "remove" || sub === "show") {
      const name = args[2];
      const skill = store.config.skills.find(a => a.name.toLowerCase() === name.toLowerCase());
      if (!skill) error("No encontrado");
      if (sub === "remove") {
        store.removeSkill(skill.id);
        await store.saveConfig();
        print({ id: skill.id }, "Eliminado");
      } else {
        print(skill, skill.content);
      }
      process.exit(0);
    }
  }

  if (first === "mcp") {
    const sub = args[1] || "list";
    if (sub === "list") {
      print(store.config.mcpServers, store.config.mcpServers.map(s => `- ${s.name} (${s.transport})`).join("\n"));
      process.exit(0);
    } else if (sub === "sync") {
      const res = await syncMcpToAntigravity(store.config.mcpServers);
      print(res, res.success ? `Sync ok: ${res.added} agregados, ${res.removed} removidos` : `Error: ${res.error}`);
      process.exit(res.success ? 0 : 1);
    } else if (sub === "add" || sub === "edit") {
      const targetName = args[2];
      if (!targetName || targetName.startsWith("-")) error("Falta nombre");

      const { values } = parseArgs({
        args: args.slice(3),
        options: {
          command: { type: "string" },
          args: { type: "string" },
          url: { type: "string" },
          agents: { type: "string" },
        },
        strict: false
      });
      
      let mcp = store.config.mcpServers.find(s => s.name.toLowerCase() === targetName.toLowerCase());
      if (sub === "add" && mcp) error("MCP ya existe");
      if (sub === "edit" && !mcp) error("MCP no encontrado");

      const env: Record<string, string> = mcp?.env || {};
      for (let i = 3; i < args.length; i++) {
        if (args[i] === "--env" && args[i+1]) {
          const [k, v] = args[i+1].split("=");
          if (k && v !== undefined) env[k] = v;
          i++;
        }
      }

      let enabledFor: "all" | string[] = mcp ? mcp.enabledFor : "all";
      if (values.agents) {
        if (values.agents === "all") enabledFor = "all";
        else {
          enabledFor = String(values.agents).split(",").map((n: string) => {
            const a = store.config.agents.find(x => x.name.toLowerCase() === n.trim().toLowerCase());
            if (!a) error(`Agente ${n} no encontrado`);
            return a.id;
          });
        }
      }

      const transport = values.url ? "http" : (values.command ? "stdio" : (mcp?.transport || "stdio"));
      
      const newMcp: McpServer = {
        id: mcp ? mcp.id : crypto.randomUUID(),
        name: targetName,
        transport,
        command: values.command !== undefined ? String(values.command) : mcp?.command,
        args: values.args !== undefined ? String(values.args).split(" ") : mcp?.args,
        url: values.url !== undefined ? String(values.url) : mcp?.url,
        env: Object.keys(env).length > 0 ? env : undefined,
        enabledFor
      };

      store.upsertMcpServer(newMcp);
      await store.saveConfig();
      print(newMcp, `MCP ${sub} ok`);
      process.exit(0);
    } else if (sub === "remove") {
      const name = args[2];
      const mcp = store.config.mcpServers.find(a => a.name.toLowerCase() === name.toLowerCase());
      if (!mcp) error("No encontrado");
      store.removeMcpServer(mcp.id);
      await store.saveConfig();
      print({ id: mcp.id }, "Eliminado");
      process.exit(0);
    }
  }

  if (first === "context") {
    const sub = args[1] || "show";
    if (sub === "show") {
      print({ context: store.config.sharedContext }, store.config.sharedContext);
      process.exit(0);
    } else if (sub === "clear") {
      store.setSharedContext("");
      await store.saveConfig();
      print({ ok: true }, "Context cleared");
      process.exit(0);
    } else if (sub === "set") {
      let text = "";
      const fileIdx = args.indexOf("--file");
      if (fileIdx >= 0 && args[fileIdx+1]) {
        text = fs.readFileSync(args[fileIdx+1], "utf-8");
      } else {
        text = fs.readFileSync(0, "utf-8"); // stdin
      }
      store.setSharedContext(text);
      await store.saveConfig();
      print({ ok: true }, "Context set");
      process.exit(0);
    }
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      agent: { type: "string", short: "a" },
      workspace: { type: "string", short: "w" },
      json: { type: "boolean" },
      quiet: { type: "boolean", short: "q" },
      "max-rounds": { type: "string" },
    },
    allowPositionals: true,
    strict: false
  });

  let prompt = first === "run" ? positionals.slice(1).join(" ") : positionals.join(" ");

  if (!prompt && !process.stdin.isTTY) {
    try { prompt = fs.readFileSync(0, "utf-8").trim(); } catch {}
  }
  
  if (!prompt) {
    error("Falta el prompt");
  }

  let agentId = "";
  const roots = selectRoots(store);
  
  if (values.agent) {
    const a = store.config.agents.find(x => x.name.toLowerCase() === String(values.agent).toLowerCase());
    if (!a) error(`Agente "${values.agent}" no encontrado.`);
    agentId = a.id;
  } else {
    const planner = roots.find(r => r.role === "planner");
    agentId = (planner || roots[0])?.id;
    if (!agentId) error("No hay agentes configurados.");
  }

  if (values.workspace) store.setWorkspaceDir(path.resolve(String(values.workspace)), false);
  else store.setWorkspaceDir(process.cwd(), false);

  if (values["max-rounds"]) store.setMaxRounds(parseInt(String(values["max-rounds"]), 10));

  const printedLengths = new Map<string, number>();

  useAppStore.subscribe((state, prevState) => {
    if (state.messages.length > prevState.messages.length || state.messages !== prevState.messages) {
      for (const msg of state.messages) {
        if (!prevState.messages.find(m => m.id === msg.id) || msg.kind === "text") {
          const prevLen = printedLengths.get(msg.id) || 0;
          if (msg.text.length > prevLen) {
            const delta = msg.text.substring(prevLen);
            printedLengths.set(msg.id, msg.text.length);
            
            if (values.json) {
              console.log(JSON.stringify(msg));
            } else if (!values.quiet || (msg.kind === "result" && msg.toAgentId === "user")) {
              if (msg.kind !== "text" || prevLen === 0) {
                const date = new Date(msg.ts).toLocaleTimeString("en-GB", { hour12: false });
                const fromName = msg.fromAgentId === "user" ? "user" : msg.fromAgentId === "system" ? "system" : store.config.agents.find(a => a.id === msg.fromAgentId)?.name || msg.fromAgentId;
                const toName = msg.toAgentId === "user" ? "user" : msg.toAgentId ? store.config.agents.find(a => a.id === msg.toAgentId)?.name || msg.toAgentId : "";
                
                let colorPrefix = "\x1b[0m";
                if (msg.kind === "error" || msg.kind === "stderr") colorPrefix = "\x1b[31m";
                else if (msg.kind === "delegation") colorPrefix = "\x1b[33m";
                else if (msg.kind === "tool") colorPrefix = "\x1b[90m";
                else if (msg.kind === "result") colorPrefix = "\x1b[32m";
                
                const agent = store.config.agents.find(a => a.id === msg.fromAgentId);
                const agentColor = agent?.color ? `\x1b[36m` : `\x1b[34m`;

                const header = `${date}  ${agentColor}${fromName}\x1b[0m ${toName ? `? ${toName}` : ""}  [${msg.kind}]`;
                
                if (msg.kind === "text") {
                  process.stdout.write(`\n${header}\n${colorPrefix}${delta}\x1b[0m`);
                } else {
                  console.log(`${header}  ${colorPrefix}${msg.text}\x1b[0m`);
                }
              } else {
                process.stdout.write(delta);
              }
            }
          }
        }
      }
    }

    if (prevState.activeTaskRunId !== null && state.activeTaskRunId === null) {
      if (!values.json) process.stdout.write("\n");
      const errs = state.messages.find(m => m.kind === "error" && m.text.includes("No se encontró el CLI"));
      const isError = errs || state.runs[prevState.activeTaskRunId]?.status === "error";
      process.exit(isError ? 1 : 0);
    }
  });

  process.on("SIGINT", () => {
    useAppStore.getState().stopAll();
    setTimeout(() => process.exit(130), 3000);
  });
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") { killAllSync(); process.exit(0); }
  });
  process.on("exit", () => killAllSync());

  await useAppStore.getState().submitPrompt(prompt, agentId);
}

main().catch(e => {
  console.error(e);
  process.exit(2);
});
