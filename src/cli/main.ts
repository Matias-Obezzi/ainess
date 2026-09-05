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
    console.log("  -w, --workspace <dir>  Directorio de trabajo (busca o crea proyecto)");
    console.log("  -p, --project <nombre> Proyecto a usar");
    console.log("  --json                 Salida en JSON");
    console.log("  -q, --quiet            Solo imprimir resultado");
    console.log("  --max-rounds <n>       Rondas máximas");
    console.log("Subcomandos: agents, skills, mcp, context, projects, run");
    process.exit(0);
  }

  const KNOWN = new Set(["run", "agents", "skills", "mcp", "context", "projects", "detect", "profile", "presets"]);
  const first = args[0];

  if (!first.startsWith("-") && !KNOWN.has(first)) {
    if (/^[a-z][a-z0-9-]{0,24}$/.test(first) && args.length === 1) {
      error(`Subcomando desconocido: "${first}". Subcomandos: ${[...KNOWN].join(", ")}`);
    }
  }

  if (first === "detect") {
    const sub = args[1] || "list";
    if (sub === "list") {
      if (jsonOutput) {
        console.log(JSON.stringify(store.binaries));
      } else {
        const providers = Object.keys(store.binaries) as ProviderId[];
        for (const p of providers) {
          const bin = store.binaries[p];
          if (bin?.path) {
            console.log(`${p}: ${bin.path} ${bin.version ? `(${bin.version})` : ""}`);
          } else {
            console.log(`${p}: No detectado`);
          }
        }
      }
      process.exit(0);
    } else if (sub === "set") {
      const provider = args[2] as ProviderId;
      const rp = args[3];
      if (!provider || !rp) error("Uso: ais detect set <provider> <ruta>");
      store.updateConfig({ binaryOverrides: { ...store.config.binaryOverrides, [provider]: rp } });
      await store.detectBinaries();
      print({ ok: true }, "Override seteado.");
      process.exit(0);
    } else if (sub === "clear") {
      const provider = args[2] as ProviderId;
      if (!provider) error("Uso: ais detect clear <provider>");
      const overrides = { ...store.config.binaryOverrides };
      delete overrides[provider];
      store.updateConfig({ binaryOverrides: overrides });
      await store.detectBinaries();
      print({ ok: true }, "Override borrado.");
      process.exit(0);
    }
  }

  if (first === "profile") {
    const sub = args[1] || "show";
    if (sub === "show") {
      print(store.config.profile, `Nombre: ${store.config.profile?.name}\nSobre vos: ${store.config.profile?.about}\nPreferencias: ${store.config.profile?.preferences}`);
      process.exit(0);
    } else if (sub === "set") {
      const { values } = parseArgs({
        args: args.slice(2),
        options: {
          name: { type: "string" },
          about: { type: "string" },
          "about-file": { type: "string" },
          preferences: { type: "string" },
        },
        strict: false
      });
      const current = store.config.profile || { name: "", about: "", preferences: "" };
      let about = values.about as string | undefined;
      if (values["about-file"]) about = fs.readFileSync(values["about-file"] as string, "utf-8");
      
      store.updateConfig({
        profile: {
          name: values.name !== undefined ? String(values.name) : current.name,
          about: about !== undefined ? about : current.about,
          preferences: values.preferences !== undefined ? String(values.preferences) : current.preferences,
        }
      });
      await store.saveConfig();
      print({ ok: true }, "Perfil guardado.");
      process.exit(0);
    }
  }

  if (first === "presets") {
    const sub = args[1] || "list";
    if (sub === "list") {
      print(store.config.presets, store.config.presets?.map(p => `- ${p.name}: ${p.prompt.substring(0, 50)}... [Agent: ${p.agentId||"Cualquiera"}] [Model: ${p.model||"Predeterminado"}]`).join("\n") || "");
      process.exit(0);
    } else if (sub === "add") {
      const name = args[2];
      if (!name) error("Falta nombre");
      const { values } = parseArgs({
        args: args.slice(3),
        options: {
          prompt: { type: "string" },
          agent: { type: "string" },
          model: { type: "string" },
        },
        strict: false
      });
      if (!values.prompt) error("Falta --prompt");
      let agentId: string | undefined = undefined;
      if (values.agent) {
        const a = store.config.agents.find(x => x.name.toLowerCase() === String(values.agent).toLowerCase());
        if (!a) error(`Agente "${values.agent}" no encontrado`);
        agentId = a.id;
      }
      const p = {
        id: crypto.randomUUID(),
        name,
        prompt: String(values.prompt),
        agentId,
        model: values.model ? String(values.model) : undefined
      };
      const presets = [...(store.config.presets || [])];
      const idx = presets.findIndex(x => x.name === name);
      if (idx >= 0) presets[idx] = p; else presets.push(p);
      store.updateConfig({ presets });
      await store.saveConfig();
      print(p, "Orden guardada");
      process.exit(0);
    } else if (sub === "remove") {
      const name = args[2];
      if (!name) error("Falta nombre");
      const presets = (store.config.presets || []).filter(p => p.name !== name);
      store.updateConfig({ presets });
      await store.saveConfig();
      print({ ok: true }, "Orden eliminada");
      process.exit(0);
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
    } else if (sub === "init") {
      const providerKeys = Object.keys(store.binaries) as ProviderId[];
      const detectables = providerKeys.filter(p => p !== "custom");
      const rootPlanner = store.config.agents.find(a => a.parentId === null && a.role === "planner");
      let added = 0;
      for (const p of detectables) {
        const bin = store.binaries[p];
        const hasAgent = store.config.agents.some(a => a.provider === p);
        if (bin && bin.path && bin.version !== null && !hasAgent) {
          store.upsertAgent({
            id: crypto.randomUUID(),
            name: p.charAt(0).toUpperCase() + p.slice(1),
            provider: p,
            role: "implementer",
            parentId: rootPlanner ? rootPlanner.id : null,
            autoApprove: true,
            color: "#6b7280"
          });
          added++;
        }
      }
      await store.saveConfig();
      print({ added }, `Inicializados ${added} agentes.`);
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

  if (first === "projects") {
    const sub = args[1] || "list";
    if (sub === "list") {
      print(store.config.projects, store.config.projects.map(p => `- ${p.name}: ${p.workspaceDir}`).join("\n"));
      process.exit(0);
    } else if (sub === "add") {
      const name = args[2];
      if (!name || name.startsWith("-")) error("Falta nombre");
      const dirIdx = args.indexOf("--dir");
      if (dirIdx === -1 || !args[dirIdx+1]) error("Falta --dir <carpeta>");
      const workspaceDir = path.resolve(args[dirIdx+1]);
      if (store.config.projects.find(p => p.name.toLowerCase() === name.toLowerCase())) error("Proyecto ya existe");
      store.addProject({ name, workspaceDir });
      await store.saveConfig();
      print({ name, workspaceDir }, `Proyecto agregado: ${name}`);
      process.exit(0);
    } else if (sub === "remove") {
      const name = args[2];
      const p = store.config.projects.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (!p) error("No encontrado");
      store.removeProject(p.id);
      await store.saveConfig();
      print({ id: p.id }, "Proyecto eliminado");
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
      project: { type: "string", short: "p" },
      json: { type: "boolean" },
      quiet: { type: "boolean", short: "q" },
      "max-rounds": { type: "string" },
      preset: { type: "string" },
      model: { type: "string" },
      "auto-model": { type: "boolean" },
    },
    allowPositionals: true,
    strict: false
  });

  if (values["auto-model"] !== undefined) {
    store.updateConfig({ autoModel: Boolean(values["auto-model"]) });
  }

  let prompt = first === "run" ? positionals.slice(1).join(" ") : positionals.join(" ");

  if (values.preset) {
    const presetObj = store.config.presets?.find(p => p.name === values.preset);
    if (!presetObj) error(`Orden predefinida "${values.preset}" no encontrada.`);
    prompt = presetObj.prompt + (prompt ? "\n" + prompt : "");
    if (!values.agent && presetObj.agentId) {
      const a = store.config.agents.find(x => x.id === presetObj.agentId);
      if (a) values.agent = a.name;
    }
    if (!values.model && presetObj.model) {
      values.model = presetObj.model;
    }
  }

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

  let projectId = "";
  if (values.project) {
    const p = store.config.projects.find(x => x.name.toLowerCase() === String(values.project).toLowerCase());
    if (!p) error(`Proyecto "${values.project}" no encontrado.`);
    projectId = p.id;
  } else {
    let targetDir = values.workspace ? path.resolve(String(values.workspace)) : process.cwd();
    let p = store.config.projects.find(x => path.resolve(x.workspaceDir) === targetDir);
    if (!p) {
      const pName = path.basename(targetDir) || "Proyecto";
      store.addProject({ name: pName, workspaceDir: targetDir });
      p = useAppStore.getState().config.projects.find(x => path.resolve(x.workspaceDir) === targetDir);
    }
    projectId = p!.id;
  }
  store.setCurrentProject(projectId);

  if (values["max-rounds"]) store.setMaxRounds(parseInt(String(values["max-rounds"]), 10));

  const printedLengths = new Map<string, number>();

  useAppStore.subscribe((state, prevState) => {
    if (state.messages.length > prevState.messages.length || state.messages !== prevState.messages) {
      for (const msg of state.messages) {
        if (msg.projectId && msg.projectId !== projectId) continue;
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

    if (prevState.activeTaskRunId[projectId] && !state.activeTaskRunId[projectId]) {
      if (!values.json) process.stdout.write("\n");
      const errs = state.messages.find(m => m.projectId === projectId && m.kind === "error" && m.text.includes("No se encontró el CLI"));
      const isError = errs || state.runs[prevState.activeTaskRunId[projectId] as string]?.status === "error";
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

  await useAppStore.getState().submitPrompt(prompt, agentId, projectId, { model: values.model as string | undefined });
}

main().catch(e => {
  console.error(e);
  process.exit(2);
});
