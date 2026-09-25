// Habla ACP con el adaptador real de Claude y muestra los ParsedEvent que salieron.
//
// Es la única prueba de que el cliente de `src/lib/acp/` funciona contra un agente de verdad: las
// unitarias de `npm test` corren contra un agente falso, que no puede desmentir un supuesto sobre
// el protocolo. Esta gasta cuota del usuario y necesita red, así que vive fuera de la suite y se
// corre a mano.
//
//   node scripts/acp-smoke.mjs [--prompt "..."] [--agent "npx -y @agentclientprotocol/claude-agent-acp"]
//
// El módulo está escrito en TypeScript y se importa desde el renderer, así que lo carga vite en
// modo SSR en vez de compilarlo aparte: lo que se prueba acá es exactamente lo que corre la app.
import { createServer } from "vite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 180_000;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const prompt = argOf("--prompt", "Respondé solamente OK, sin nada más.");
const agentCommand = argOf("--agent", "npx -y @agentclientprotocol/claude-agent-acp");

/**
 * `npx` en Windows es un `.cmd`, y spawnearlo sin shell falla. El script que hay detrás se puede
 * correr con el node que ya está corriendo esto, que es lo mismo sin pasar por cmd.exe.
 */
function resolveAgent(command) {
  const [program, ...rest] = command.split(" ").filter(Boolean);
  if (program === "npx") {
    const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
    return { program: process.execPath, args: [npxCli, ...rest] };
  }
  return { program, args: rest };
}

const server = await createServer({
  configFile: false,
  root,
  logLevel: "warn",
  server: { middlewareMode: true, watch: null },
  resolve: { alias: { "@": path.join(root, "src") } },
});

const cwd = mkdtempSync(path.join(tmpdir(), "ainess-acp-"));
const runId = `acp-smoke-${Date.now()}`;
let transport;
let code = 0;

try {
  const { nodeTransport } = await server.ssrLoadModule("/src/lib/transport-node.ts");
  const { setTransport } = await server.ssrLoadModule("/src/lib/transport.ts");
  const { runAcpPrompt } = await server.ssrLoadModule("/src/lib/acp/index.ts");
  transport = nodeTransport;
  setTransport(nodeTransport);

  const agent = resolveAgent(agentCommand);
  console.log(`Agente:  ${agent.program} ${agent.args.join(" ")}`);
  console.log(`Carpeta: ${cwd}`);
  console.log(`Prompt:  ${prompt}\n`);

  await transport.spawnRun({ runId, program: agent.program, args: agent.args, cwd, keepStdinOpen: true });

  const started = Date.now();
  const timer = setTimeout(() => {
    console.error(`\nSe pasó de ${TIMEOUT_MS / 1000} s sin terminar; mato la corrida.`);
    void transport.killRun(runId);
  }, TIMEOUT_MS);

  const events = [];
  const result = await runAcpPrompt({
    runId,
    cwd,
    prompt,
    clientVersion: JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8")).version,
    onEvent: (event) => {
      events.push(event);
      console.log(`[${String(Date.now() - started).padStart(6)} ms] ${JSON.stringify(event)}`);
    },
  });
  clearTimeout(timer);

  console.log(`\n${events.length} eventos. stopReason=${result.stopReason} sessionId=${result.sessionId}`);
  console.log(`Respuesta:\n${result.text.trim()}`);
} catch (e) {
  console.error(`\nFalló: ${e?.stack || e}`);
  code = 1;
} finally {
  try { await transport?.killRun(runId); } catch { /* ya no está */ }
  await server.close();
  try { rmSync(cwd, { recursive: true, force: true }); } catch { /* la deja el sistema */ }
}

process.exit(code);
