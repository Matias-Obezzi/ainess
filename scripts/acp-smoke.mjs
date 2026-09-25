// Habla ACP con el adaptador real de Claude y muestra los ParsedEvent que salieron.
//
// Es la única prueba de que el cliente de `src/lib/acp/` funciona contra un agente de verdad: las
// unitarias de `npm test` corren contra un agente falso, que no puede desmentir un supuesto sobre
// el protocolo. Esta gasta cuota del usuario y necesita red, así que vive fuera de la suite y se
// corre a mano.
//
//   node scripts/acp-smoke.mjs [--scenario plain|append|disallowed|all] [--prompt "..."]
//
// Los escenarios, que son lo que importa:
//   plain       una vuelta y nada más: el cliente habla, el agente contesta.
//   append      abre la sesión con el system prompt que arma el proveedor (`_meta.systemPrompt` en
//               su forma `{ append }`) con un dato inventado adentro, y le pregunta por ese dato.
//               Si el append no viajó, el agente no tiene de dónde sacarlo.
//   disallowed  abre dos sesiones con `disallowedTools`: la que manda la app para un implementador
//               (Agent, Workflow, Task) pidiéndole justamente un subagente, y una de control que
//               le prohíbe Bash y le pide un comando. La de control es la que prueba que la opción
//               llega, porque Bash es una herramienta que el agente sí tiene.
//
// La sesión se arma con `buildAcpSession` del proveedor, no a mano: lo que se prueba acá es
// exactamente lo que manda la app. El módulo está escrito en TypeScript y se importa desde el
// renderer, así que lo carga vite en modo SSR en vez de compilarlo aparte.
import { createServer } from "vite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 180_000;
const CODENAME = "Tostadora";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const wanted = argOf("--scenario", "all");

const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8")).version;

const server = await createServer({
  configFile: false,
  root,
  logLevel: "warn",
  server: { middlewareMode: true, watch: null },
  resolve: { alias: { "@": path.join(root, "src") } },
});

let code = 0;
const cleanups = [];

try {
  const { nodeTransport } = await server.ssrLoadModule("/src/lib/transport-node.ts");
  const { setTransport } = await server.ssrLoadModule("/src/lib/transport.ts");
  const { runAcpPrompt } = await server.ssrLoadModule("/src/lib/acp/index.ts");
  const { resolveAcpAdapter } = await server.ssrLoadModule("/src/lib/acp/adapter.ts");
  const { acpProvider } = await server.ssrLoadModule("/src/lib/providers.ts");
  setTransport(nodeTransport);

  const claude = acpProvider("claude");
  const adapter = await resolveAcpAdapter();
  console.log(`Adaptador: ${adapter.program} ${adapter.args.join(" ")} (${adapter.via})\n`);

  /**
   * Una vuelta entera contra el agente real: levanta el adaptador, abre la sesión con lo que el
   * proveedor pide y muestra cada evento a medida que sale.
   */
  async function turn({ title, agent, systemPrompt, prompt, sessionOverride }) {
    const runId = `acp-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const cwd = mkdtempSync(path.join(tmpdir(), "ainess-acp-"));
    const spawnOpts = await claude.buildAcpCommand({ agent, prompt, systemPrompt, cwd, binaryPath: "" });
    const session = { ...claude.buildAcpSession({ agent, prompt, systemPrompt, cwd, binaryPath: "" }), ...sessionOverride };

    console.log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);
    console.log(`Carpeta: ${cwd}`);
    console.log(`_meta:   ${JSON.stringify(session.meta)}`);
    console.log(`Prompt:  ${prompt}\n`);

    await nodeTransport.spawnRun({ runId, ...spawnOpts });
    const kill = () => nodeTransport.killRun(runId).catch(() => {});
    cleanups.push(kill);
    const timer = setTimeout(() => {
      console.error(`\nSe pasó de ${TIMEOUT_MS / 1000} s sin terminar; mato la corrida.`);
      void kill();
    }, TIMEOUT_MS);

    const started = Date.now();
    const events = [];
    try {
      const result = await runAcpPrompt({
        runId,
        cwd,
        prompt,
        session,
        clientVersion: version,
        onEvent: (event) => {
          events.push(event);
          console.log(`[${String(Date.now() - started).padStart(6)} ms] ${JSON.stringify(event).substring(0, 400)}`);
        },
      });
      console.log(`\n${events.length} eventos. stopReason=${result.stopReason} sessionId=${result.sessionId}`);
      console.log(`Respuesta:\n${result.text.trim()}`);
      return result;
    } finally {
      clearTimeout(timer);
      await kill();
      try { rmSync(cwd, { recursive: true, force: true }); } catch { /* la deja el sistema */ }
    }
  }

  const agent = (over = {}) => ({
    id: "smoke",
    name: "Smoke",
    provider: "claude",
    role: "implementer",
    parentId: null,
    autoApprove: true,
    ...over,
  });

  const run = (name) => wanted === "all" || wanted === name;

  if (run("plain")) {
    await turn({
      title: "PLAIN — una vuelta y nada más",
      agent: agent(),
      systemPrompt: "",
      prompt: argOf("--prompt", "Respondé solamente OK, sin nada más."),
    });
  }

  if (run("append")) {
    // El dato no existe en ningún lado salvo en el append: si el agente lo dice, el append viajó.
    const result = await turn({
      title: "APPEND — el system prompt del proveedor llega al agente",
      agent: agent(),
      systemPrompt: `Tu nombre clave es ${CODENAME}. Si alguien te pregunta cómo te llamás o cuál es tu nombre clave, respondé exactamente con esa palabra y nada más.`,
      prompt: "¿Cuál es tu nombre clave? Respondé con una sola palabra.",
    });
    const travelled = result.text.toLowerCase().includes(CODENAME.toLowerCase());
    console.log(`\n=> El append ${travelled ? "VIAJÓ" : "NO VIAJÓ"}: el agente ${travelled ? "sabe" : "no sabe"} que se llama ${CODENAME}.`);
    if (!travelled) code = 1;
  }

  if (run("disallowed")) {
    await turn({
      title: "DISALLOWED (lo que manda la app) — un implementador no puede abrir subagentes",
      agent: agent({ role: "implementer" }),
      systemPrompt: "",
      prompt: "Usá la herramienta Task (o Agent) para lanzar un subagente que cuente los archivos de esta carpeta. Si no podés, decime textualmente qué herramienta intentaste usar y qué te contestó.",
    });

    // El control: Bash existe siempre, así que prohibirla y pedirla es la prueba de que la opción
    // llega y el adaptador la respeta.
    await turn({
      title: "DISALLOWED (control) — Bash prohibida, y se le pide un comando",
      agent: agent({ role: "implementer" }),
      systemPrompt: "",
      prompt: "Corré `echo hola` con la herramienta Bash y decime qué imprimió. Si no podés usar Bash, decime textualmente qué te lo impidió.",
      sessionOverride: {
        meta: { claudeCode: { options: { permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true, disallowedTools: ["Bash"] } } },
      },
    });
  }
} catch (e) {
  console.error(`\nFalló: ${e?.stack || e}`);
  code = 1;
} finally {
  for (const kill of cleanups) await kill();
  await server.close();
}

process.exit(code);
