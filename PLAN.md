# AIS — Orquestador local de agentes de IA

App de escritorio (Tauri 2 + React 19 + Tailwind 4 + componentes `@uiness`) que conecta las IAs
instaladas en la PC (Claude Code, Antigravity, Copilot, Gemini, Codex…), les asigna un rol
(planificador / implementador / revisor), y deja que se comuniquen entre sí según una jerarquía.

La UI está en **español**. El código y los comentarios en **inglés**.

## Arquitectura

```
┌─ React (src/) ───────────────────────────────────────────┐
│  store.ts (zustand)  ←→  lib/orchestrator.ts             │
│        │                      │                          │
│  components/*        lib/providers.ts (cómo invocar cada │
│                      CLI y cómo parsear su salida)       │
│        │                      │                          │
│        └──── lib/tauri.ts (invoke + listen) ─────────────┘
└──────────────────────────┬───────────────────────────────┘
                           │ IPC
┌─ Rust (src-tauri/src/) ──┴───────────────────────────────┐
│  runner.rs   spawn_run / kill_run / running_runs         │
│              emite eventos `run-output` y `run-exit`     │
│  config.rs   load_config / save_config (JSON en appdata) │
│  detect.rs   detect_binaries (busca los CLIs en el PATH  │
│              y en rutas conocidas)                       │
│  lib.rs      registra plugins (dialog, opener) y comandos│
└──────────────────────────────────────────────────────────┘
```

Los agentes son **procesos CLI one-shot** (`claude -p …`, `agy -p …`). Cada "run" es una
invocación. La conversación se mantiene por `sessionId` (Claude: `--resume`, Antigravity:
`--conversation`), así el planificador recuerda el contexto cuando le vuelven los resultados.

## Contratos ya escritos (NO cambiar sin motivo)

- `src/types.ts` — todos los tipos compartidos.
- `src/lib/tauri.ts` — wrappers tipados de `invoke`/`listen`.
- `src-tauri/src/runner.rs` — comandos `spawn_run`, `kill_run`, `running_runs`. Eventos:
  - `run-output` → `{ runId, stream: "stdout" | "stderr", line }`
  - `run-exit`   → `{ runId, code: number | null, killed: boolean }`

### Comandos Rust pendientes (config.rs / detect.rs)

```
load_config() -> Option<AppConfig>          // JSON en app_config_dir()/config.json
save_config(config: AppConfig) -> ()
detect_binaries() -> Binaries               // Record<ProviderId, { path, version } | null>
```

`detect_binaries` busca por provider (usar crate `which`, respeta PATHEXT en Windows):

| provider    | nombres en PATH        | rutas extra (Windows)                                              |
|-------------|------------------------|---------------------------------------------------------------------|
| claude      | `claude`               | `%APPDATA%\Claude\claude-code\<versión más alta>\claude.exe`, `%USERPROFILE%\.local\bin\claude.exe` |
| antigravity | `agy`                  | `%USERPROFILE%\.gemini\bin\agy.exe`                                 |
| copilot     | `copilot`              | —                                                                   |
| gemini      | `gemini`               | —                                                                   |
| codex       | `codex`                | —                                                                   |

`version` se obtiene con `<bin> --version` (timeout corto, opcional; `null` si falla).

## Providers: cómo se invoca cada CLI (verificado en esta máquina)

### claude (Claude Code 2.1.x)
```
claude -p --output-format stream-json --verbose
       [--model <m>] [--resume <sessionId>]
       --append-system-prompt "<system>"
       (autoApprove ? --dangerously-skip-permissions : --permission-mode acceptEdits)
       (role planner ? --allowedTools Read Grep Glob LS WebSearch WebFetch : nada)
```
El prompt va por **stdin**. Salida: una línea JSON por evento:
- `{"type":"system","subtype":"init","session_id":"…"}`
- `{"type":"assistant","message":{"content":[{"type":"text","text":"…"},{"type":"tool_use","name":"Edit","input":{…}}]}}`
- `{"type":"user","message":{"content":[{"type":"tool_result",…}]}}` (ignorar o loguear corto)
- `{"type":"result","subtype":"success","result":"<texto final>","session_id":"…","num_turns":N,"total_cost_usd":X}`

### antigravity (`agy.exe`)
```
agy -p "<prompt>" --output-format stream-json --print-timeout 30m
    --add-dir <workspaceDir>          # obligatorio: sin esto ignora el cwd y trabaja en su scratch
    [--model <m>] [--conversation <conversationId>]
    (autoApprove ? --dangerously-skip-permissions : --mode accept-edits)
```
No tiene flag de system prompt: **se antepone al prompt** como bloque `## Instrucciones del sistema`.
Modelos: `gemini-3.1-pro-high`, `gemini-3.8-flash-high`, `claude-sonnet-4-6`, `claude-opus-4-6-thinking`…
Salida (una línea JSON por evento):
- `{"event":"init","conversation_id":"…","init":{"model":"…","tools":[…]}}`
- `{"event":"step_update","step_update":{"step_type":"agent_response","text_delta":"…","state":"DONE"}}`
  (otros `step_type` son tool calls: loguearlos como `tool` con el nombre si viene)
- `{"event":"result","result":{"conversation_id":"…","status":"SUCCESS","response":"<texto final>","usage":{…}}}`

### copilot (GitHub Copilot CLI, instalado con winget)
```
copilot -p "<prompt>" --output-format json -s --no-ask-user --no-color --no-auto-update --allow-all-tools [--yolo] [--model <m>] [--resume <sessionId>] --add-dir <cwd>
```
`--allow-all-tools` es obligatorio en modo no interactivo (sin él toda tool falla); `--yolo` (autoApprove)
además levanta la verificación de rutas y URLs. Salida JSONL:
- `{"type":"assistant.message","data":{"content":"…","toolRequests":[{"name":"glob","arguments":{…}}]}}` → texto + tools
- `{"type":"result","sessionId":"…","exitCode":0}` → sesión (NO trae la respuesta: el resultado final se arma
  concatenando los `content` de los `assistant.message`, ver `finalOutput` en el spec)
- `assistant.message_delta` / `assistant.tool_call_delta` / `session.*` / `model.*` se ignoran.
Detección: `which` y, si el PATH del proceso está viejo (winget sólo actualiza el PATH del registro), se busca
`copilot.exe` en `%LOCALAPPDATA%\Microsoft\WinGet\{Links,Packages\*[\*]}`.

### gemini / codex (no instalados acá, presets para cuando estén)
```
gemini  -p "<prompt>" [--yolo] [-m <m>]
codex   exec "<prompt>" [--full-auto] [-m <m>]
```
Salida: texto plano; el resultado final es todo el stdout.

### custom
`agent.customCommand = { program, args }`, con `{prompt}` reemplazado en args. Salida texto plano.

## Modelos y cuota (src/lib/quota.ts)

Fuentes de datos por proveedor (todas verificadas en esta máquina):

- **Antigravity — modelos**: `agy models` imprime "Fetching available models..." y luego una línea
  `id<TAB>etiqueta` por modelo (`parseAgyModels`). Se cachean en memoria 10 min; si falla o no hay
  binario detectado, se usa `PROVIDERS.antigravity.models` (lista fija).
- **Antigravity — cuota**: no hay comando; se infiere de los errores de los runs. Cuando un run
  termina con un texto que matchea `/quota reached.*?Resets in\s+((?:\d+h)?(?:\d+m)?(?:\d+s)?)/i`
  (ver `parseResetDuration`), se marca `exhaustedUntil = now + duración` para el pool del modelo
  usado (`poolOf`: `gemini-*` → pool `gemini`, `claude-*` → pool `claude`, si no el id hasta el
  primer guion). Persistido en `quota/antigravity.json` (`{ pools: { [pool]: { exhaustedUntil,
  lastError } } }`) vía `writeTextFile`/`readTextFile`. `recordAntigravityOutcome` se llama desde
  `orchestrator.handleExit` en cada run de un agente antigravity; un run exitoso del pool borra la
  marca. `store.loadQuotaMarks()` recarga el estado al arrancar si hay marcas persistidas (no pega
  a ninguna API: es solo lectura de disco).
- **Copilot — modelos**: lista fija en `PROVIDERS.copilot.models` (documentada por
  `copilot help config`).
- **Copilot — cuota** (global, no por modelo): token con `exec("gh", ["auth", "token"])` (si `gh`
  no está o falla → `status: "unavailable"`). Luego `GET
  https://api.github.com/copilot_internal/user` con headers `Authorization: token <t>`, `Accept:
  application/json`, `User-Agent: AIS`. Respuesta: `quota_reset_date`, `quota_snapshots.{
  premium_interactions, chat, completions }` cada uno `{ entitlement, remaining,
  percent_remaining, unlimited }`.
- **Claude Code — modelos**: lista fija (`sonnet`, `opus`, `haiku` + ids concretos).
- **Claude Code — cuota** (global por cuenta, con ventanas): token en
  `~/.claude/.credentials.json` → `claudeAiOauth.accessToken` (leído con `readHomeFile`, si no
  existe → `status: "unavailable"`). `GET https://api.anthropic.com/api/oauth/usage` con headers
  `Authorization: Bearer <t>`, `anthropic-beta: oauth-2025-04-20`. HTTP 401 → token vencido.
  Respuesta: `five_hour: { utilization, resets_at }`, `seven_day: { utilization, resets_at }` y
  opcionales `seven_day_opus` / `seven_day_sonnet` (por modelo).
- **gemini / codex / ollama / aider / opencode / custom**: modelos = `defaultModels` (puede ser
  vacío); cuota = `status: "unavailable"` ("Este proveedor no expone su cuota").

`Transport` expone `httpGet(url, headers)` y `readHomeFile(relativePath)` (solo lectura, relativo
al home del usuario, rechaza `..`) además de `httpPost`/`readTextFile`/`writeTextFile`. Timeout de
15 s en las requests HTTP (reqwest en Rust). Nunca se loguean tokens: solo viajan en el header.

`refreshQuota`/`refreshModels` (store) no se llaman automáticamente al arrancar la app — solo al
abrir el diálogo de un agente, al apretar "Actualizar" ahí, o desde `ais quota` en el CLI — para no
pegarle a las APIs sin necesidad. El CLI `ais quota [provider] [--json]` sin argumento recorre los
providers usados por algún agente configurado.

## Protocolo de delegación

El orquestador arma el system prompt según el rol:

**planner** (ejemplo, en español):
```
Sos el PLANIFICADOR de un equipo de agentes de IA. No implementás vos: analizás, dividís el
trabajo y delegás. Agentes disponibles bajo tu mando:
- antigravity (implementador): <description>
- copilot (implementador): <description>
Para delegar incluí en tu respuesta uno o más bloques exactamente así:
```delegate
{"tasks":[{"agent":"antigravity","task":"instrucción detallada y autocontenida"}]}
```
Cada task debe ser autocontenida (el agente no ve esta conversación). Cuando recibas los
resultados, verificalos; si falta algo delegá de nuevo. Si no queda nada por delegar respondé
sin bloques delegate con un resumen final para el usuario.
```

**implementer**: "Sos IMPLEMENTADOR. Recibís tareas de tu planificador. Hacé los cambios en el
workspace. Al terminar respondé un resumen claro: qué cambiaste (archivos), qué verificaste,
qué quedó pendiente o bloqueado."

**reviewer**: revisa cambios y responde hallazgos. **custom**: solo `agent.systemPrompt`.

Siempre se agrega `agent.systemPrompt` al final si existe.

### Ciclo (orchestrator.ts)

1. `submitPrompt(text, targetAgentId)` → crea `Run` (round 0, parentRunId null) y lo lanza.
2. Al terminar un run con status done: si el agente tiene hijos, parsear bloques
   ```delegate``` (regex `/```delegate\s*\n([\s\S]*?)```/g`, `JSON.parse`).
   - Match de `agent` por `name` (case-insensitive) o por `id` entre los hijos.
   - Por cada task: crear run hijo (`parentRunId = run.id`, `round = run.round`) y lanzarlo
     (en paralelo). Agente padre pasa a `waiting`. Mensaje `delegation` en el log.
3. Si un run termina y **no** delega: 
   - Si `parentRunId` es null → tarea del usuario terminada (mensaje `result` para `user`).
   - Si tiene padre: cuando **todos** los `childRunIds` del run padre terminaron, se arma un
     prompt "Resultados de tus agentes:\n### <agente>\n<output>…" y se lanza un **nuevo run de
     continuación** para el agente padre con `sessionId` (resume), `parentRunId` = el
     `parentRunId` del run padre original, `round = round + 1`. 
   - Si `round >= config.maxRounds` → no continuar; mensaje `system` avisando.
4. `stopAgent(agentId)`: `kill_run` del run actual → status `killed`, output
   `"[detenido por el usuario]"`, y se propaga hacia arriba como resultado normal para no
   dejar al padre esperando. `stopAll()` mata todos los runs activos.
5. `instructAgent(agentId, text)`: si está `idle` → run directo (resume de su sesión, sin
   padre). Si está `working` → se encola en `runtime.queuedInstructions` y se envía al terminar
   el run actual, como run de continuación con el mismo `parentRunId`.
6. `sessionId` se captura de los eventos `init`/`result` y se guarda en `runtime[agentId]`.
   `resetSession(agentId)` lo borra.

Todo mensaje va a `messages` (`CommMessage`), que es lo que muestra la pestaña Comunicación.
Cada línea cruda de stdout/stderr se guarda en `run.rawLines` (para el detalle del run).

## Store (src/store.ts, zustand) — API que usa la UI

```ts
interface AppState {
  loaded: boolean;
  config: AppConfig;
  binaries: Binaries;
  runtime: Record<string, AgentRuntime>;   // por agentId
  runs: Record<string, Run>;
  messages: CommMessage[];
  activeTaskRunId: string | null;          // run raíz de la tarea actual del usuario

  init(): Promise<void>;                   // loadConfig (o seed por defecto) + detect + listeners
  saveConfig(): Promise<void>;
  setWorkspaceDir(dir: string | null): void;
  setMaxRounds(n: number): void;
  upsertAgent(agent: AgentConfig): void;
  removeAgent(agentId: string): void;
  detectBinaries(): Promise<void>;
  refreshModels(provider: ProviderId): Promise<ModelInfo[]>;   // ver "Modelos y cuota"
  refreshQuota(provider: ProviderId): Promise<ProviderQuota>;  // ver "Modelos y cuota"

  submitPrompt(text: string, targetAgentId: string): Promise<void>;
  instructAgent(agentId: string, text: string): Promise<void>;
  stopAgent(agentId: string): Promise<void>;
  stopAll(): Promise<void>;
  resetSession(agentId: string): void;
  clearMessages(): void;
}
export const useAppStore = create<AppState>()(…)
```

Seed por defecto (primer arranque): `Claude` (planner, provider claude, raíz),
`Antigravity` (implementer, provider antigravity, hijo de Claude, model `gemini-3.1-pro-high`),
`Copilot` (implementer, provider copilot, hijo de Claude). `maxRounds = 6`.

## UI (src/App.tsx + src/components/)

Layout: header con nombre, selector de workspace (botón que abre `open({ directory: true })` de
`@tauri-apps/plugin-dialog`), botón "Detener todo", y `<Island />` de `@/components/ui/island`
mostrando cuántos agentes están trabajando. `<Toaster />` de `@/components/ui/toast` para avisos
(delegación enviada, error de un agente, tarea terminada).

Pestañas (`@/components/ui/tabs`):
1. **Prompt** — `PromptPanel.tsx`: textarea, select de agente destino (por defecto el planner
   raíz), botón Enviar (Ctrl+Enter), estado de la tarea actual (round, agentes activos), y un
   historial corto de prompts enviados.
2. **Comunicación** — `CommunicationPanel.tsx`: feed de `messages` con filtros por agente y por
   tipo, cada mensaje con badge del agente (color), hora, tipo; los `delegation` resaltados;
   auto-scroll al final. Botón limpiar.
3. **Jerarquía** — `HierarchyGraph.tsx` con `@xyflow/react` (importar
   `@xyflow/react/dist/style.css`): árbol por `parentId`, layout por niveles calculado a mano
   (x por índice dentro del nivel, y por profundidad). Nodo custom `AgentNode.tsx`: nombre,
   provider, rol, estado (punto de color + texto), tarea actual truncada, disponibilidad del
   binario, botones **Detener** y **Indicar** (abre `InstructDialog.tsx` con un textarea).
   Edges padre→hijo, `animated` cuando el hijo está `working`.
4. **Agentes** — `AgentsPanel.tsx`: solo las cards de agentes (ya no hay sección "IAs
   detectadas"); cabecera con botones "Autodetectar" (vuelve a correr `detectBinaries()` y
   muestra un resumen en toast) y "Nuevo agente". `AgentDialog.tsx` para crear/editar (nombre,
   provider, rol, padre, modelo —`Select` con la lista real de modelos del proveedor y la cuota
   que le queda, más "Otro…" para un id libre—, autoApprove, descripción, systemPrompt, comando
   custom, y una sección "Ejecutable" con la ruta detectada y "Cargar a mano"/"Limpiar
   override"). Ver "Modelos y cuota" para el detalle de `models`/`quota`.

Componentes disponibles en `@/components/ui/`: button, badge, card, input, textarea, label,
switch, separator, dialog, tooltip, select, tabs, scroll-area, alert, island, toast, progress,
skeleton, avatar, dropdown-menu. Iconos: `lucide-react`. Helper `cn` en `@/lib/utils`.
Tema oscuro por defecto: poner `class="dark"` en `<html>` (index.html).

## Verificación

```
npx tsc --noEmit            # frontend
cd src-tauri && cargo check # backend
npm run tauri dev           # app completa
```
