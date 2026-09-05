import { parseArgs } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { useAppStore, selectRoots } from "@/store";
import { setTransport } from "@/lib/transport";
import { nodeTransport, killAllSync } from "@/lib/transport-node";

async function main() {
  setTransport(nodeTransport);
  await useAppStore.getState().init();

  const { values, positionals } = parseArgs({
    options: {
      agent: { type: "string", short: "a" },
      workspace: { type: "string", short: "w" },
      json: { type: "boolean" },
      quiet: { type: "boolean", short: "q" },
      "max-rounds": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log("Uso: ais [opciones] <prompt>");
    console.log("  -a, --agent <nombre>   Agente a usar");
    console.log("  -w, --workspace <dir>  Directorio de trabajo");
    console.log("  --json                 Salida en JSON por mensaje");
    console.log("  -q, --quiet            Solo imprimir resultado");
    console.log("  --max-rounds <n>       Rondas máximas");
    console.log("  agents                 Listar agentes");
    process.exit(0);
  }

  const store = useAppStore.getState();

  if (positionals[0] === "agents") {
    for (const a of store.config.agents) {
      const parent = a.parentId ? store.config.agents.find(x => x.id === a.parentId)?.name || a.parentId : "root";
      const bin = store.binaries[a.provider];
      const binInfo = bin && bin.path ? `${bin.path} (${bin.version || "unknown"})` : "No detectado";
      console.log(`- ${a.name} [${a.role}]`);
      console.log(`  Provider: ${a.provider}`);
      console.log(`  Parent: ${parent}`);
      if (a.model) console.log(`  Model: ${a.model}`);
      console.log(`  CLI: ${binInfo}`);
      console.log("");
    }
    process.exit(0);
  }

  // A lone lowercase word that is not a known subcommand is almost certainly a typo:
  // refuse it instead of sending it as a prompt to the planner (which costs tokens).
  const KNOWN = new Set(["run", "agents"]);
  const first = positionals[0];
  if (first && !KNOWN.has(first) && positionals.length === 1 && /^[a-z][a-z0-9-]{0,24}$/.test(first)) {
    console.error(`Subcomando desconocido: "${first}". Subcomandos: ${[...KNOWN].join(", ")}. Para mandar un prompt usá: ais run "<texto>"`);
    process.exit(2);
  }

  let prompt = first === "run" ? positionals.slice(1).join(" ") : positionals.join(" ");

  if (!prompt && !process.stdin.isTTY) {
    prompt = fs.readFileSync(0, "utf-8").trim();
  }
  
  if (!prompt) {
    console.error("Falta el prompt");
    process.exit(2);
  }

  let agentId = "";
  const roots = selectRoots(store);
  
  if (values.agent) {
    const a = store.config.agents.find(x => x.name.toLowerCase() === values.agent!.toLowerCase());
    if (!a) {
      console.error(`Agente "${values.agent}" no encontrado.`);
      process.exit(2);
    }
    agentId = a.id;
  } else {
    const planner = roots.find(r => r.role === "planner");
    agentId = (planner || roots[0])?.id;
    if (!agentId) {
      console.error("No hay agentes configurados.");
      process.exit(2);
    }
  }

  if (values.workspace) {
    useAppStore.getState().setWorkspaceDir(path.resolve(values.workspace), false);
  } else {
    useAppStore.getState().setWorkspaceDir(process.cwd(), false);
  }

  if (values["max-rounds"]) {
    useAppStore.getState().setMaxRounds(parseInt(values["max-rounds"], 10));
  }

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
                if (msg.kind === "error" || msg.kind === "stderr") colorPrefix = "\x1b[31m"; // red
                else if (msg.kind === "delegation") colorPrefix = "\x1b[33m"; // yellow
                else if (msg.kind === "tool") colorPrefix = "\x1b[90m"; // gray
                else if (msg.kind === "result") colorPrefix = "\x1b[32m"; // green
                
                const agent = store.config.agents.find(a => a.id === msg.fromAgentId);
                const agentColor = agent?.color ? `\x1b[36m` : `\x1b[34m`; // fallback cyan/blue for agents

                const header = `${date}  ${agentColor}${fromName}\x1b[0m ${toName ? `→ ${toName}` : ""}  [${msg.kind}]`;
                
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
      // Done
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
  // If stdout goes away (e.g. piped into `head`), stop the agents instead of orphaning them.
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") { killAllSync(); process.exit(0); }
  });
  // Last resort: never leave CLI children running after this process ends.
  process.on("exit", () => killAllSync());

  await useAppStore.getState().submitPrompt(prompt, agentId);
}

main().catch(e => {
  console.error(e);
  process.exit(2);
});
