# Núcleo de orquestación: providers, orchestrator y store

Repo: C:\Users\matia\Desktop\projects\ais
Rama: la activa (main), sin cambiar de rama ni crear otras

## Objetivo
Que existan `src/lib/providers.ts`, `src/lib/orchestrator.ts` y `src/store.ts` implementando el ciclo de delegación descrito en `PLAN.md`, y que `npx tsc --noEmit` pase sin errores.

## Contexto
- Leer `PLAN.md` completo: secciones "Providers", "Protocolo de delegación", "Ciclo (orchestrator.ts)" y "Store". Es la fuente de verdad; este plan solo agrega detalles.
- `src/types.ts`: todos los tipos compartidos (no modificar).
- `src/lib/tauri.ts`: wrappers `ipc.spawnRun/killRun/runningRuns/loadConfig/saveConfig/detectBinaries`, `onRunOutput`, `onRunExit`, `isTauri` (no modificar).
- `src-tauri/src/runner.rs`: emite `run-output` `{ runId, stream, line }` por cada línea y `run-exit` `{ runId, code, killed }` al terminar. Los eventos son globales; se identifican por `runId`.
- Dependencias ya instaladas: `zustand@5`, `@tauri-apps/api@2`.
- tsconfig es `strict` con `noUnusedLocals` y `noUnusedParameters`. Alias `@/` → `src/`.

## Cambios
1. `src/lib/providers.ts` (nuevo):
   - `interface ProviderSpec { id: ProviderId; label: string; defaultModels: string[]; supportsSessions: boolean; promptVia: "stdin" | "arg"; note?: string; buildCommand(input: BuildInput): Omit<SpawnOptions, "runId">; parseLine(line: string, stream: "stdout" | "stderr"): ParsedEvent[] }`
     con `interface BuildInput { agent: AgentConfig; prompt: string; systemPrompt: string; sessionId?: string; cwd?: string; binaryPath: string }`.
   - `export const PROVIDERS: Record<ProviderId, ProviderSpec>`.
   - Modelos por defecto: antigravity `["gemini-3.1-pro-high","gemini-3.8-flash-high","claude-sonnet-4-6","claude-opus-4-6-thinking"]`; claude `["sonnet","opus","haiku"]`; el resto `[]`.
   - `buildCommand` sigue EXACTAMENTE los flags de PLAN.md. Claude: prompt por stdin; agy/copilot/gemini/codex: prompt como argumento. Antigravity no tiene flag de system prompt: el prompt final es `## Instrucciones del sistema\n${systemPrompt}\n\n## Tarea\n${prompt}`. Copilot/gemini/codex tampoco: mismo esquema de prefijo. `custom`: `agent.customCommand.program` y `args` con `{prompt}` reemplazado; si ningún arg contiene `{prompt}`, mandarlo por stdin. Si `sessionId` está y el provider `supportsSessions`, agregar `--resume`/`--conversation`. Siempre `env: { NO_COLOR: "1" }`.
   - `parseLine`: para claude y antigravity intentar `JSON.parse`; si falla → `{ type: "raw", text }`. Mapear según PLAN.md: claude `system/init` → `session`; `assistant` → un `text` por bloque de texto y un `tool` por `tool_use` (`name`, `detail` = JSON del input truncado a 200 chars); `result` → `result` con `text = result` y `sessionId = session_id`; `user` → ignorar. Antigravity: `init` → `session` (conversation_id); `step_update` con `text_delta` → `text`; `step_update` cuyo `step_type` no sea `agent_response`/`user_input` → `tool` con `name = step_type` (y `tool_name` o `tool_call.name` si existen); `result` → `result` con `text = result.response`, `sessionId = result.conversation_id`; si `result.status !== "SUCCESS"` y hay `result.error`, emitir además `error`. Texto plano (copilot/gemini/codex/custom): cada línea stdout → `text`. stderr no vacío → `error` (para claude y agy solo si no parsea como JSON).
   - `export function finalOutputFromLines(lines: string[]): string` (une stdout crudo, para providers sin evento `result`).
   - `export function buildSystemPrompt(agent: AgentConfig, children: AgentConfig[]): string` en español según "Protocolo de delegación". Para `planner` listar los hijos como `- ${name} (${role}): ${description ?? ""}` y explicar el bloque ```delegate. Si un planner no tiene hijos, decirle que responda directamente. Para `implementer`, `reviewer` y `custom` según el plan. Siempre agregar `agent.systemPrompt` al final si existe.
   - `export function parseDelegations(text: string): Delegation[]`: regex `/```delegate\s*\n([\s\S]*?)```/g`, `JSON.parse` tolerante (devolver `[]` si falla, sin tirar). Aceptar `{ tasks: [...] }` o un array directo. Filtrar entradas sin `agent` o sin `task` string.
2. `src/lib/orchestrator.ts` (nuevo): implementa el ciclo de PLAN.md. Sugerencia de estructura (podés ajustar nombres internos, pero mantener estos exports):
   - `export function attachListeners(): Promise<void>` idempotente (guardar promesa/unlisten en módulo).
   - `export async function submitPrompt(text: string, targetAgentId: string): Promise<void>`
   - `export async function instructAgent(agentId: string, text: string): Promise<void>`
   - `export async function stopAgent(agentId: string): Promise<void>`
   - `export async function stopAll(): Promise<void>`
   - Internos: `startRun({ agentId, prompt, parentRunId, round, resume })`, `handleOutput(e)`, `handleExit(e)`, `onRunFinished(run)`, `maybeContinueParent(parentRunId)`.
   - Acceder al store con `import { useAppStore } from "@/store"` dentro de funciones (no en top-level) para evitar problemas de import cíclico, o pasar `get/set`. Elegí una y sé consistente.
   - Reglas: si `binaries[provider]` es null/undefined → no spawnear; crear el run en estado `error`, mensaje `error` "No se encontró el CLI de <label>. Instalalo o configurá un comando custom." y tratarlo como terminado (propaga hacia arriba). El `cwd` es `config.workspaceDir ?? undefined`. Mensajes `text` de un mismo run se acumulan en UN solo `CommMessage` (id estable por run) para no llenar el feed con deltas. El `output` final del run es el `result` si hubo, si no `finalOutputFromLines(stdout)`. Al terminar, si el agente tiene hijos y el output tiene delegaciones → crear runs hijos (parentRunId = run.id, round = run.round), agente padre en `waiting`, mensaje `delegation` (from padre, to hijo, text = task). Si una delegación nombra un agente que no es hijo → mensaje `error` y se ignora. Si no hay delegaciones: run raíz → mensaje `result` con `toAgentId: "user"`, `activeTaskRunId = null`; run con padre → cuando todos los `childRunIds` del run padre terminaron (`done`/`error`/`killed`), armar `Resultados de tus agentes:\n\n### <nombre>\n<output>` y lanzar run de continuación del agente padre con `resume: true`, `parentRunId = padre.parentRunId`, `round = padre.round + 1`; si `round >= maxRounds` → mensaje `system` "Se alcanzó el máximo de rondas" y tratar como terminado sin continuar. Continuación: si el padre está `working` (otro run en curso) esperar a que termine (encolar). `stopAgent`: `ipc.killRun(runId)`; en `handleExit` con `killed: true` → run `killed`, output "[detenido por el usuario]", propagar como resultado normal. `instructAgent`: idle → run directo con `resume: true`, `parentRunId: null`, mensaje `instruction` from `user`; working → push a `queuedInstructions` y al terminar el run actual lanzar la instrucción como continuación con el mismo `parentRunId`. Estados del agente: `working` mientras corre, `waiting` con hijos activos, `idle` al terminar OK, `error` si exit code ≠ 0 sin resultado, `stopped` si killed.
3. `src/store.ts` (nuevo): `export const useAppStore = create<AppState>()(...)` con EXACTAMENTE la interfaz `AppState` de PLAN.md (sección "Store"), exportando también `AppState`. `init()` idempotente: `loadConfig()` → si null usa el seed (`Claude` planner raíz provider claude color `#d97757`; `Antigravity` implementer provider antigravity model `gemini-3.1-pro-high` color `#4f8cff` description "Implementa cambios de código en el workspace usando Antigravity (Gemini)"; `Copilot` implementer provider copilot color `#8b5cf6` description "Implementa cambios de código usando GitHub Copilot CLI"; hijos de Claude; `autoApprove: true` en los implementadores, `false` en el planner; `maxRounds: 6`, `workspaceDir: null`, `version: 1`) y lo guarda; luego `detectBinaries()`, `attachListeners()`, inicializa `runtime` por agente. Si `!isTauri()`: seed, `binaries = {}`, sin listeners, sin guardar. Persistencia con debounce 300 ms en `upsertAgent`, `removeAgent` (reasigna hijos al abuelo), `setWorkspaceDir`, `setMaxRounds`. Exponer también helpers de selección puros en el mismo archivo: `selectChildren(state, agentId)`, `selectRoots(state)`, `selectAgent(state, id)`.
   - Los ids se generan con `crypto.randomUUID()`.

## Casos borde y decisiones ya tomadas
- Un run que termina con exit code ≠ 0 pero con un `result` parseado se considera `done` (agy a veces devuelve status raro).
- Nunca lanzar dos runs simultáneos para el mismo agente; si pasa, encolar.
- Limitar `run.rawLines` a las últimas 2000 líneas.
- Mensajes `tool` sí van al feed (uno por tool call), truncados a 300 chars.
- No tocar `src/App.tsx`, `src/components/**`, `src/types.ts`, `src/lib/tauri.ts`, `src-tauri/**`, `package.json`.

## Fuera de alcance
- UI (otro plan). Tests.

## Verificación
Desde la raíz del repo:
```
npx tsc --noEmit
```
Debe pasar sin errores. Commitear con mensajes en inglés. No hacer push.
