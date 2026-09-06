# ainess — Orquestador local de agentes de IA

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
       (role planner ? --allowedTools Read Grep Glob LS WebSearch WebFetch "Bash(git:*)" "Edit(.claude/**)" "Write(.claude/**)" "MultiEdit(.claude/**)" : nada)
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

**Dónde se ve la cuota**: `summarizeAgentQuota` (`src/lib/quota-summary.ts`, puro y testeado)
reduce el `ProviderQuota` de un proveedor a lo que le queda a **un agente**: se queda con los items
globales del proveedor más los de su modelo (matchea el id exacto, la familia —`opus`/`sonnet` de
las ventanas de Claude— y el pool de Antigravity vía `poolOf`) y devuelve `{ fraction, label,
detail, status }`. Prioridad de cálculo: `remaining`/`entitlement` sumados → promedio de
`percentRemaining` → `1 - usedPercent/100` de la ventana más ajustada → todos `unlimited` = `∞`.
Sin números (los pools de Antigravity, que solo dicen "Agotado"/"Disponible") `fraction` queda en
`null` y el anillo se ve apagado; `fraction <= 0` es `status: "exhausted"`. Con `config.autoModel`
en true el modelo lo elige el orquestador, así que el resumen usa `allModels` (los modelos que
reportó el proveedor en `store.models`, con respaldo en `PROVIDERS[provider].defaultModels`): lo que
queda sobre el total de todos los modelos de ese agente.

`QuotaRing` (`src/components/QuotaRing.tsx`, SVG a mano, sin dependencias) dibuja el arco —verde
arriba de 50%, ámbar entre 20% y 50%, rojo abajo— y exporta el hook `useAgentQuota(agent)`, que lee
lo que ya está en el store y **nunca** dispara un fetch. Se muestra en dos lugares: en cada nodo de
la jerarquía (`AgentNode.tsx`, al lado del estado, con el `label` y el `detail` en el tooltip) y al
final de la fila de selects del `Composer` (`QuotaIndicator.tsx`, con el agente destino), donde el
click abre un popover con una fila por agente y un botón "Actualizar" que llama a `refreshQuota` de
cada proveedor involucrado: ese botón es el único punto de la vista que pega a las APIs.

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

Los eventos `tool` de cada provider llevan además del `detail` truncado el `input` completo
(claude `item.input`, antigravity `tool_info.parameters`, copilot `req.arguments`). El
orquestador guarda en el mensaje `meta: { tool, summary, input }`, donde `summary` sale de
`src/lib/tool-summary.ts#summarizeTool(name, input, { workspaceDir })`: una línea corta e igual
para todos los providers ("Edit src/lib/x.ts", "Bash npm test", `Grep "foo"`, "WebFetch
example.com"), con la ruta relativa al workspace cuando cae adentro. El mismo módulo exporta
`toolIcon(name)` (icono lucide por familia de herramienta) para la UI.

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
  addAgent(projectId: string, agent: AgentConfig): void;
  updateAgent(projectId: string, agentId: string, patch: Partial<AgentConfig>): void;
  removeAgent(projectId: string, agentId: string): void;
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

## Agentes por proyecto y formaciones (config version 10)

Los agentes **no** son una lista global: cada proyecto lleva su propio equipo en `Project.agents`,
con su propia jerarquía. Las plantillas de equipo viven en `AppConfig.formations: Formation[]`
(`{ id, name, description?, agents }`), con `defaultFormationId` marcando la que se preselecciona al
crear un proyecto. `AppConfig.agents` ya no existe.

- Selectores: `selectProjectAgents(state, projectId)` (el equipo de un proyecto),
  `selectAllAgents(state)` (la unión de todos, cacheada por identidad de `config.projects`, para los
  lugares que solo tienen un id: mensajes, runs, cuota), `selectAgent(state, id)` (busca en todos los
  proyectos, los ids son únicos), `selectProjectOfAgent`, `selectChildren(state, projectId, agentId)`
  y `selectRoots(state, projectId)`.
- Acciones: `addAgent`/`updateAgent`/`removeAgent` por proyecto (al borrar, los hijos pasan a colgar
  del padre del borrado y se limpia su runtime), `addProject(project, opts?)` (copia la formación
  elegida —o la predeterminada— con `cloneAgents`, que renumera ids y remapea `parentId`),
  `applyFormation`, `upsertFormation`, `removeFormation`, `setDefaultFormation` y
  `saveProjectAsFormation(projectId, name)`.
- Migración 9 → 10: cada proyecto recibe una copia del equipo global; el proyecto de `lastProjectId`
  (o el primero) **conserva los ids originales**, así el `runtime`, el historial y los `enabledFor`
  de skills/MCP siguen apuntando a algo. El equipo global además se guarda como la formación
  "Mi equipo", que queda de predeterminada.
- El equipo se gestiona desde la **jerarquía del proyecto** (agregar, duplicar, editar, eliminar,
  "Guardar como formación"); Configuración → Agentes es detección de CLIs + formaciones.
- Dos agentes del mismo provider en un proyecto son válidos (dos Claude con roles distintos); lo
  único único dentro del equipo es el **nombre** (case-insensitive), que es lo que resuelve el
  bloque `delegate`.

Seed por defecto (primer arranque): la formación "Mi equipo" con `Claude` (planner, provider claude,
raíz), `Antigravity` (implementer, provider antigravity, hijo de Claude, model
`gemini-3.1-pro-high`) y `Copilot` (implementer, provider copilot, hijo de Claude), marcada como
predeterminada. `maxRounds = 6`.

## Worktrees por agente (src/lib/worktree.ts)

Un agente con `AgentConfig.worktree === true` trabaja en **su propio git worktree** del repo del
proyecto: su rama, su carpeta. Así dos agentes implementan en paralelo sin pelearse el índice de
git. La app nunca mergea sola: cuando el agente termina, el usuario decide.

- Nombres (puros, testeados): `worktreePath(workspaceDir, agentName)` → `<workspace>-wt-<slug>`
  (carpeta hermana), `worktreeBranch(agentName)` → `ainess/<slug>`. El slug es minúsculas, sin
  acentos, con guiones. `parseWorktreeList(stdout)` lee `git worktree list --porcelain`.
- `ensureWorktree(project, agent, onStep?, known?)`: exige que el workspace sea un repo git, reusa
  el worktree que ya esté registrado y preparado, si no hace `git worktree add [-b <rama>] <path>`
  desde la rama actual y —cuando el repo tiene `package.json`— corre `npm install` adentro
  (timeout 600 s). **Nunca** se enlaza `node_modules` al del repo principal: `git worktree remove`
  sigue el enlace y borra el original. `onStep` es lo que la UI narra en vivo.
- `removeWorktree(project, worktree, { deleteBranch })` y `mergeWorktree(project, worktree)`. El
  merge se **niega** si el workspace o el worktree tienen cambios sin commitear, y un merge con
  conflictos se informa, no se deshace: se resuelve a mano en la carpeta del proyecto.
- Estado: `AppState.worktrees: Record<projectId, AgentWorktree[]>`
  (`{ agentId, path, branch, base, createdAt, readyAt? }`), con `setWorktree` / `forgetWorktree` y
  los selectores `selectProjectWorktrees` / `selectWorktree`. Se persiste en el archivo de
  historial del proyecto (`src/lib/history.ts`); el disco solo siembra la lista la primera vez, así
  un worktree que el usuario borró no revive.
- Orquestador: `startRun` resuelve el `cwd` antes de lanzar (`resolveCwd`). Si preparar el worktree
  falla, el run queda en error y no arranca. Mientras tanto `AgentRuntime.preparing` lleva el paso
  ("Creando el worktree…", "Instalando dependencias…"), que muestran el nodo y el inspector.
- UI: switch "Trabajar en su propio worktree" en `AgentDialog` (deshabilitado si el proyecto no es
  un repo), la rama en monoespaciada bajo el nombre del agente, y el panel `WorktreePanel`
  (botón "Worktrees" en la jerarquía) con abrir carpeta, mergear y eliminar. Todo lo destructivo
  confirma antes.
- Apagar el switch **no** borra nada: la carpeta queda y sigue apareciendo en el panel.

## UI (src/App.tsx + src/components/)

Shell tipo "Claude desktop", sin pestañas. `App.tsx` es `div.h-screen.flex.flex-col`:
`<TitleBar/>` + una fila `flex-1` con `<Sidebar/>` + columna principal + `<RightDock/>`
opcional, más `<SettingsDialog/>`, `<SearchPalette/>` y `<ShortcutsDialog/>` (modales, siempre montados). Encima flotan
`<Island />` de `@/components/ui/island` (cuántos agentes están trabajando) y `<Toaster />` de
`@/components/ui/toast` (delegación enviada, error de un agente, tarea terminada).

La navegación vive en el store: `screen` ("home" | "project"), `projectMode` ("chat" | "graph"),
`commPanelOpen`, `termPanelOpen`, `dockSplit` (0.3–0.8), `settingsOpen` (booleano, no persistido:
Configuración es un modal, no una pantalla), `settingsSection`, `sidebarCollapsed`, `sidebarOpen`,
`searchOpen` (no persistido), `navHistory`/`navIndex` (no persistidos), con las acciones `openHome`,
`openProject(projectId, chatId?)`, `openSettings(section?)` (abre el modal), `closeSettings()`,
`setProjectMode`, `toggleCommPanel`, `toggleTermPanel(open?)`, `setDockSplit(value)`,
`toggleSidebarProject`, `toggleSidebar(open?)`, `toggleSearch(open?)`, `goBack()` y `goForward()`. Lo persistible va a `localStorage` bajo la clave
`ais.ui` (con guard `typeof localStorage`, porque el CLI importa el store en node).

**Barra de título** — `components/shell/TitleBar.tsx` (`h-10`, `bg-card border-b`). La ventana usa
`"decorations": false` en `tauri.conf.json`, así que la barra es propia: el contenedor y el título
llevan `data-tauri-drag-region` (arrastre y doble click para maximizar), los botones no. A la
izquierda `PanelLeft` (colapsa el sidebar, `Ctrl+B`), `Search` (paleta, `Ctrl+K`) y las flechas
atrás/adelante; al centro el nombre "ainess"; a la derecha, solo con `isTauri()`, los controles de
ventana de 46x40 (`minimize()`, `toggleMaximize()` con icono de restaurar cuando está maximizada, y
`close()`, que respeta la bandeja). Permisos en `capabilities/default.json`:
`core:window:allow-minimize|maximize|unmaximize|toggle-maximize|close|start-dragging|is-maximized`.

**Historial de navegación** — `navHistory: NavEntry[]` (`{ screen, projectId, chatId, projectMode }`)
con `navIndex`. `openHome`, `openProject`, `setProjectMode` y `setCurrentChat` pasan por `pushNav`,
que corta el futuro, ignora la entrada idéntica consecutiva y guarda 50 como máximo. `goBack`/
`goForward` aplican la entrada con `applyNav` (sin pushear; si el proyecto ya no existe cae a
"home"). Configuración es un modal y no entra en el historial. Selectores `canGoBack`/`canGoForward`.

**Paleta de búsqueda** — `components/shell/SearchPalette.tsx`: `Dialog` arriba (`top-[15%]`) con un
input autofocus y resultados agrupados en Proyectos / Chats / Agentes / Configuración, filtrados por
substring sin acentos ni mayúsculas. Flechas para moverse, Enter o click para abrir (proyecto →
`openProject(id, null)`, chat → `openProject(projectId, chatId)`, agente → abre su proyecto en la
vista de jerarquía, sección → `openSettings(id)`). Además busca **tareas** del proyecto actual (abre
su detalle: `openProject(projectId, null)` + `setProjectMode("tasks")` + `focusTask(id)`, que
`TasksView` consume y limpia) y ofrece dos **acciones**: "Crear tarea: «lo tipeado»" (`addTask` en
`backlog`, solo cuando hay proyecto actual y ninguna tarea coincide exacto) y "Atajos de teclado"
(`toggleShortcuts(true)`).

**Atajos de teclado** — la tabla única está en `src/lib/shortcuts.ts`: `SHORTCUTS`
(`{ id, keys, descriptionKey, group, global }`), `SHORTCUT_GROUPS`
(`general | project | composer | terminal`), `matchesShortcut`, `resolveGlobalShortcut`,
`formatShortcut(keys, platform)` (Ctrl en Windows/Linux, ⌘ ⌥ ⇧ en macOS) y `shortcutPlatform()`.
`App.tsx` resuelve los globales de esa tabla (Ctrl+K paleta, Ctrl+, Configuración, Ctrl+/ atajos,
Ctrl+B sidebar, Ctrl+` terminales) y `components/shell/ShortcutsDialog.tsx` (Ctrl+/, store
`shortcutsOpen`/`toggleShortcuts`) documenta todos, agrupados, con `<kbd>` a la izquierda. Los que
no son globales los sigue manejando su componente (`Composer.tsx`, `lib/terminal-registry.ts`), pero
la tabla es la única documentación: agregar un atajo allí es lo que lo hace visible.

**Scrollbars** — `src/index.css` define barras finas (`scrollbar-width: thin` y
`::-webkit-scrollbar` de 10px con thumb `color-mix(in oklch, var(--foreground) 22%, transparent)`,
redondeado y con `background-clip: content-box`) fuera de `@layer` para que ganen; `body` va con
`overflow: hidden` porque el scroll lo maneja la app. El thumb del `ScrollArea` de shadcn usa el
mismo color.

1. **Sidebar** — `components/shell/Sidebar.tsx` (260px, colapsable a `w-0` con `sidebarOpen`,
   persistido): cabecera "ainess"; botones Inicio y Nuevo proyecto; lista de
   proyectos colapsables (punto de color, nombre, badge naranja con agentes trabajando, menú
   contextual Editar / Nuevo chat / Eliminar) y, dentro de cada uno, "Orquestador", los chats del
   proyecto (`config.chats` filtrados por `projectId`) y "+ Nuevo chat". Al pie: "N trabajando",
   badge ámbar de aprobaciones pendientes y el engranaje de Configuración.
2. **Inicio** — `components/shell/HomeScreen.tsx`: grilla de cards de proyecto con carpeta, estado
   de actividad (agentes trabajando con su tarea, o la última tarea raíz con su estado y "hace X"),
   tareas activas, runs guardados y botones Abrir / Editar / Eliminar.
3. **Proyecto** — `components/shell/ProjectScreen.tsx`: barra superior (proyecto, toggle
   Chat ↔ Jerarquía, "N trabajando", Comunicación, Terminal, Detener), `ApprovalsPanel`, el cuerpo y el
   `Composer` siempre abajo. El cuerpo es:
   - `OrchestratorThread.tsx` — la conversación principal: cada run raíz (`parentRunId === null`,
     `kind !== "chat"`) como burbuja del usuario + respuesta del agente, con `RunActivity` en vivo
     mientras corre, chips de delegaciones hijas y botón Detalles (`RunDetailDialog`). Al terminar,
     la respuesta va en markdown (`Markdown.tsx`, colapsada con "Ver más" si pasa de 12 líneas) y
     arriba queda un desplegable "Actividad (N pasos · m:ss)", plegado, con el mismo `RunActivity`
     sin pie. Los runs con `round > 0` son continuaciones automáticas y no muestran burbuja de
     usuario. Mientras algo corre, el hilo sigue el fondo con un timer de 150 ms dentro de un
     `requestAnimationFrame` (nunca un scroll por delta) y respeta "Nuevos mensajes ↓".
   - `RunActivity.tsx` — lo que el agente está haciendo, leído de `messages` filtrado por `runId`
     (`useMemo`, nunca un selector que devuelva arrays nuevos): el texto en curso (`text-<runId>`)
     en markdown, cada `tool` como fila `icono + meta.summary` en mono, los `error` en rojo, los
     `system` en itálica, y cada `delegation` como tarjeta anidada (agente + tarea + `StatusDot`)
     con el `RunActivity compact` del run hijo (`parentRunId === runId && agentId === toAgentId`,
     el más reciente). Pliega los pasos viejos ("… N pasos más"; 30 filas, 6 en `compact` con
     "Ver todo") sin esconder nunca el texto, y mientras el run corre cierra con un pie de punto
     verde pulsante + última herramienta (o "Pensando…") + cronómetro `m:ss` (`showFooter`).
     Exporta `useActivityCount(runId)` para el encabezado del desplegable.
   - `Markdown.tsx` — `react-markdown` + `remark-gfm` con estilos Tailwind propios (sin
     `@tailwindcss/typography`): párrafos `whitespace-pre-wrap`, listas, `code` inline, bloques
     `pre` con scroll horizontal, tablas con bordes y links `text-primary underline` que se abren
     con `openUrl` del plugin opener cuando `isTauri()`. Los bloques ```delegate se muestran como
     una tarjeta "Delegación" con la lista de tareas (parseadas con `parseDelegations`), no como
     código crudo. Se usa en la respuesta final del run, en los mensajes del agente en el chat y
     en el texto en vivo de `RunActivity`; los mensajes del usuario siguen en texto plano.
   - `ChatThread.tsx` — el hilo de un chat individual/compartido (`chatMessages[chatId]`). El
     mensaje pendiente del agente lleva `runId` (lo setea `lib/chat.ts` apenas `startRun` devuelve
     el id) y muestra `RunActivity` dentro de la burbuja: no hay badge "escribiendo…" ni indicador
     "Escribiendo…" al final del hilo.
   - `HierarchyGraph.tsx` con `@xyflow/react` (importar `@xyflow/react/dist/style.css`), envuelto en
     `ReactFlowProvider`: árbol por `parentId` con layout propio (`layoutAgents`, exportada y
     testeada) — `y` por profundidad y `x` centrando cada grupo de hijos bajo su padre a partir del
     ancho del subárbol (`NODE_WIDTH` 260, `GAP_X` 40, `GAP_Y` 90); huérfanos y ciclos caen como
     raíces extra. `fitView` con `padding: 0.2`, zoom 0.4–1.5, nodos arrastrables pero no
     conectables, `deleteKeyCode` nulo, y re-`fitView` cuando cambia la cantidad de agentes o el
     ancho del contenedor (`ResizeObserver`). Edges `smoothstep` (`borderRadius` 12) del color del
     hijo, `strokeOpacity` 0.7, más gruesos y `animated` cuando trabaja, `markerEnd` de flecha y
     label "delegado" mientras el hijo está `working`/`waiting`. Sin `<Controls/>`: arriba a la
     izquierda un resumen ("N trabajando / esperando / inactivos") y arriba a la derecha una toolbar
     de iconos (Ajustar vista, Centrar en el activo, Acercar, Alejar) que se esconde con el
     inspector abierto, más "Agregar agente" (abre `AgentDialog` sobre el proyecto actual) y
     "Guardar como formación". Sin agentes, `EmptyState` con CTA a "Agregar agente".
     - Nodo custom `AgentNode.tsx` (260px, borde superior del color del agente, `ring` si está
       seleccionado): avatar con la inicial, nombre, "{provider} · {rol}", `StatusDot` (pulso si
       trabaja) y `AlertTriangle` si falta el CLI; una línea de estado con cronómetro
       ("Trabajando · 2:14", desde el `startedAt` del `currentRunId`, tick de 1 s solo si está
       activo), badge ámbar "en {proyecto}" si está ocupado en otro, la tarea actual en dos líneas y
       la última herramienta del run (`meta.summary` + `toolIcon`). Abajo, acciones solo de icono con
       tooltip: Detener, Indicar (`InstructDialog.tsx`), Ver salida (`RunDetailDialog.tsx` del último
       run) y Chatear, más un menú con Reiniciar sesión y Editar agente.
     - `shell/AgentInspector.tsx` — panel de 360px dentro del área del grafo
       (`absolute right-3 top-3 bottom-3`) que se abre al clickear un nodo y se cierra con la X, con
       click en el fondo o con `Escape` (lleva `data-inspector`, que el `Composer` ignora para no
       detener la tarea): cabecera con estado, la tarea actual completa, `RunActivity` del run en
       curso ("Actividad en vivo") o las últimas 3 tareas del agente en el proyecto con su hora,
       estado y "Ver", y las mismas acciones con texto.
     - `agent-actions.tsx` — `useAgentActions(agent)` y `AgentActionDialogs`, la semántica compartida
       por el nodo y el inspector (`stopAgent`, `instructAgent`, último run, chat individual,
       `resetSession`, editar el agente con `AgentDialog`, duplicarlo y eliminarlo).
     - Los estilos de React Flow viven en `src/index.css` sobre los tokens del tema (variables
       `--xy-*` y reglas `.react-flow__*`), sin duplicar reglas para `.dark`.
   - `Composer.tsx` — textarea (Ctrl+Enter para enviar, flecha arriba recupera el último prompt).
     Sin chat abierto manda `submitPrompt` con selects de destino, modelo y órdenes predefinidas;
     con un chat abierto manda `sendChatMessage`. Mientras algo corre, el botón pasa a Detener.
4. **Dock derecho** — `components/shell/RightDock.tsx` (380px a la derecha, se superpone bajo
   1100px) aloja dos secciones y se muestra si `(commPanelOpen || termPanelOpen) && screen ===
   "project"`. Con una sola abierta ocupa todo el alto; con las dos, una columna con la sección de
   Comunicación (alto `dockSplit`), un divisor de 6px `cursor-row-resize` (arrastre con
   `pointerdown/move/up`, límites 0.3–0.8, persistido) y la de Terminales.
   - **Comunicación** — `components/shell/CommDockSection.tsx` envuelve `CommunicationPanel.tsx`:
     feed de `messages` con filtros por agente y por tipo, cada mensaje con badge del agente
     (color), hora, tipo; los `delegation` resaltados; auto-scroll al final. Botón limpiar.
   - **Terminales** — `components/shell/TerminalDockSection.tsx` (ver la sección "Terminales").
5. **Configuración** — `components/settings/SettingsDialog.tsx`: modal (`Dialog`, `showCloseButton`
   `false`) con un sidebar interno de secciones y un router `SETTINGS_SECTIONS: SettingsSectionDef[]`
   (`id`, `label`, `help`, `icon`, `component`, `actions?`, `provider?`). Cada sección es su propio
   componente en `components/settings/` con su cuerpo (`component`) y, si necesita botones
   específicos, un componente de acciones (`actions`) que `SettingsDialog` renderiza en el header,
   a la derecha del título/ayuda y antes del botón de cerrar (separados por un `Separator`
   vertical). El header tiene su propio botón de cerrar (`X`, `aria-label="Cerrar"` → `closeSettings()`);
   el `X` por defecto del `Dialog` está oculto. Cuando el cuerpo y las acciones de una sección
   comparten estado (p. ej. el diálogo de "nuevo/editar X"), la sección expone un `provider` (un
   contexto chico creado con `createDialogContext`/`createToggleContext` de
   `components/settings/section-context.tsx`) que `SettingsDialog` monta alrededor de ambos.
   Abierto/cerrado con `store.settingsOpen`/`openSettings(section?)`/`closeSettings()` (atajo
   `Ctrl+,`).
   - **General** (`GeneralSection.tsx`, sin acciones): card "Segundo plano" (tray y notificaciones,
     ver abajo) y card "Orquestación" (`maxRounds`, auto-selección de modelos, aprobar
     delegaciones).
   - **Agentes** (`AgentsSection.tsx` + `AgentsSectionActions` + `AgentsSectionProvider`): ya no
     lista agentes (eso vive en la jerarquía de cada proyecto). Arriba, **IAs instaladas**: una card
     por provider detectable con logo, si está detectado y dónde, la versión, la cuota
     (`QuotaRing` + `summarizeAgentQuota`), "Cargar a mano"/"Limpiar override" y "Actualizar cuota";
     acción del header "Autodetectar" (`detectBinaries()` + toast resumen). Abajo, **Formaciones**:
     cada equipo guardado con su resumen (cuántos agentes y de qué providers), Editar, Duplicar,
     Predeterminada y Eliminar, más "Nueva formación" en el header. `FormationDialog` edita nombre,
     descripción y la lista de agentes reusando `AgentDialog.tsx` en modo controlado (`agents` +
     `onSave`, sin tocar el store): nombre, provider, rol, padre, modelo —`Select` con la lista real
     de modelos del proveedor y la cuota que le queda (skeleton mientras se cargan modelos/cuota la
     primera vez; el `Select` se reemplaza por un placeholder "Cargando modelos…" deshabilitado),
     más "Otro…" para un id libre—, autoApprove, descripción, systemPrompt, comando custom, y una
     sección "Ejecutable" con la ruta detectada y "Cargar a mano"/"Limpiar override".
   - **Perfil** (`ProfileSection.tsx` + acción "Guardar" en el header): nombre/sobre vos/preferencias
     en un borrador local que se persiste solo al guardar.
   - **Órdenes** (`PresetsSection.tsx` + acción "Nueva orden"), **Skills** (`SkillsSection.tsx` +
     acciones "Sugeridos"/"Nueva skill") y **MCP** (`McpSection.tsx` + acción "Nuevo MCP" y un
     `DropdownMenu` con "Sugeridos"/"Sincronizar con Antigravity"): listas de cards con `EmptyState`
     cuando están vacías (el CTA de Skills/MCP abre "Sugeridos"). "Sugeridos"
     (`SuggestedDialog.tsx` + catálogo curado en `src/lib/suggested.ts`: `SUGGESTED_MCP`,
     `SUGGESTED_SKILLS`) es un picker con checkbox por ítem (ya agregados, por nombre, quedan
     deshabilitados con badge "Agregado") y un botón "Agregar N seleccionados" que hace
     `upsertMcpServer`/`upsertSkill` con `id: crypto.randomUUID()`, `enabledFor: "all"`.
   - **Hooks** (`HooksSection.tsx` + acción "Nuevo hook") y **Contexto** (`ContextSection.tsx` +
     acción "Guardar", mismo patrón de borrador local que Perfil).
   - **Remoto** (`RemoteSection.tsx`, sin acciones, antes `RemotePanel.tsx`): switch, puerto, QR y
     URL; skeleton mientras se lee el estado remoto por primera vez al abrir la sección.
   - `components/ui/empty-state.tsx` (`EmptyState({ icon, title, description, action? })`) se usa
     además fuera de Configuración: Inicio sin proyectos, hilo de un chat sin mensajes, hilo del
     orquestador sin tareas y el feed de Comunicación sin actividad. Los skeletons (`ui/skeleton.tsx`)
     cubren, además de Agentes y `AgentDialog`: Inicio mientras `!loaded`, `ChatThread` mientras
     `store.chatLoading[chatId]` (seteado por `lib/chat.ts#loadChatMessages` en la primera carga) y
     el hilo del orquestador mientras `store.historyLoading[projectId]` (seteado por
     `lib/history.ts#loadHistory` en la primera carga del proyecto).
   - `src/index.css` agrega, dentro de `@layer base`, reglas de `cursor: pointer` para todo elemento
     clickeable (`button`, `[role="button"]`, `a[href]`, `label[for]`, `select`, `summary`, y los
     `data-slot` de select/dropdown/tabs/switch) y `cursor: not-allowed` para `button:disabled`.

## Terminales

Terminales reales dentro del dock derecho, con pestañas. Backend `src-tauri/src/pty.rs` sobre el
crate `portable-pty = "0.9"` (ConPTY en Windows), estado `PtyState { sessions: Mutex<HashMap<String,
PtySession>> }` (`master` + `writer` + `child`) `manage`d en `lib.rs`.

Comandos: `pty_spawn(id, shell, cwd?, cols?, rows?)` (valida que el shell exista, cae al home si el
cwd no está), `pty_write(id, data)`, `pty_resize(id, cols, rows)` (no-op si la sesión ya murió),
`pty_kill(id)` y `pty_list_shells() -> ShellInfo[]` (`{ id, label, path }`; en Windows busca `pwsh`
en el PATH y en WindowsApps, `powershell.exe`, `cmd.exe` y Git Bash en Program Files o
`%LOCALAPPDATA%\Programs\Git`; en otros SO `$SHELL`, `/bin/bash`, `/bin/sh`). Un hilo lector por
sesión emite `pty-output` `{ id, data }` y, al cerrarse el pipe, `pty-exit` `{ id, code }` y quita
la sesión. `pty::shutdown` mata todo en `RunEvent::Exit` (también al salir desde la bandeja).

En el front, `Transport` agrega `ptySpawn/ptyWrite/ptyResize/ptyKill/ptyListShells/onPtyOutput/
onPtyExit`; fuera de la app de escritorio `ptyListShells` devuelve `[]` y el resto tira
"Las terminales solo están disponibles en la app de escritorio". El store guarda `terminals:
TerminalTab[]` (`{ id, title, shellId, shellPath, cwd, projectId, exited }`), `activeTerminalId` y
`shells` (cargados una vez en `runInit`, solo con `isTauri()`), con `openTerminal({ shellId?, cwd? })`
(cwd por defecto: el workspace del proyecto actual; máximo `MAX_TERMINALS = 8`), `closeTerminal`,
`setActiveTerminal`, `renameTerminal` y `markTerminalExited`. Las terminales viven solo en memoria.

`TerminalDockSection.tsx` tiene la cabecera ("Terminales", `+`, chevron con `DropdownMenu` de shells,
cerrar), la barra de pestañas scrolleable (icono, título, punto rojo si terminó, `X` al hover, doble
click para renombrar inline) y el cuerpo, con todos los `TerminalView` montados y solo el activo
visible para no perder el scrollback. `TerminalView.tsx` monta `@xterm/xterm` + `@xterm/addon-fit`
(13px, `Cascadia Code`, tema tomado de los tokens `--card`/`--foreground`/`--accent` convertidos a
hex con `src/lib/color.ts`), se suscribe a su sesión por `src/lib/pty-bus.ts` (un solo `listen` para
toda la app, que bufferea lo que llega antes de que la vista se monte para no perder el prompt),
hace `ptySpawn` una sola vez, `onData → ptyWrite`, `ResizeObserver →
fit() + ptyResize`, y escribe el error en rojo si el spawn falla. Copiar y pegar con
`Ctrl+Shift+C`/`Ctrl+Shift+V` (`Ctrl+C` va al proceso); `Escape` dentro de `.xterm` no dispara el
"detener" global del `Composer`. Se abre y cierra con el botón "Terminal" de la barra del proyecto o
con `` Ctrl+` ``, que además abre una terminal si no hay ninguna.

## Bandeja y notificaciones

`Cargo.toml` agrega la feature `tray-icon` a `tauri` y la dependencia `tauri-plugin-notification`.
`src-tauri/src/tray.rs`: `TrayState { enabled: AtomicBool }` (default `true`, `manage`d en
`lib.rs`), comando `set_tray_enabled`, `setup_tray(app)` (icono + menú "Mostrar AIS"/"Salir") y
`on_window_event` (con la bandeja prendida, cerrar la ventana la oculta en vez de cerrarla;
"Salir" hace `app.exit(0)` de verdad). Capability `notification:default` en
`capabilities/default.json`.

En el front, `AppConfig.tray: { enabled, notifyApprovals, notifyResults }` (default: los tres
prendidos, migración a `version: 8`); `store.updateConfig` invoca `Transport.setTrayEnabled` (solo
en Tauri) cuando cambia `tray.enabled`, y `runInit` lo hace una vez al arrancar. El hook
`src/hooks/useSystemNotifications.ts` (montado en `App.tsx`) se suscribe al store y dispara
notificaciones del sistema (`@tauri-apps/plugin-notification`, importado dinámicamente y solo
dentro de `isTauri()` para no romper el CLI) cuando aparece una nueva aprobación pendiente o
termina una tarea, en cualquier proyecto (no solo el actual).

### Centro de notificaciones (la campanita)

Aparte de los toasts (del momento) y de las notificaciones del sistema (fuera de la app), el
historial de lo que pidió atención vive en el store: `notifications: AppNotification[]`
(`NotificationKind` = approval | task-done | task-failed | interrupted | tunnel | update | info),
en memoria, nunca en disco, tope 200 y las más nuevas primero. La lógica pura está en
`src/lib/notifications.ts` (`pushNotification` deduplica contra la no leída del mismo `kind` sobre
el mismo `approvalId`/`runId`, `markAllRead`, `markRead`, `markApprovalRead`, `unreadCount`,
`unreadBadge`), con tests en `src/lib/__tests__/notifications.test.ts`. Acciones del store:
`notify`, `markNotificationsRead`, `markNotificationRead`, `markApprovalNotificationsRead`,
`dismissNotification`, `clearNotifications`, `toggleNotifications`.

Quién notifica: `orchestrator.requestApproval` (aprobación pedida; `settleApproval` marca leída la
suya cuando el usuario decide), `orchestrator` en las ramas de `task.finished`/`task.failed` (las
corridas que el usuario detuvo no dicen nada), `history.mergeFromDisk` (corridas que quedaron
`running` de un proceso muerto), `store.refreshTunnelStatus` (cuando se cae) y
`hooks/useUpdateCheck` (versión nueva). `src/components/shell/NotificationBell.tsx` la muestra en
la barra de ventana, a la izquierda del botón remoto: badge hasta "9+", `Popover` de 360 px con
scroll a 70vh, "Marcar todas como leídas" y "Vaciar", y cada fila lleva al proyecto y al detalle
del run.

Helpers de formato en `src/lib/format.ts`: `formatTimeAgo`, `formatElapsed`, `truncate`,
`formatClock`.

Componentes disponibles en `@/components/ui/`: button, badge, card, input, textarea, label,
switch, separator, dialog, tooltip, select, tabs, scroll-area, alert, island, toast, progress,
skeleton, avatar, dropdown-menu. Iconos: `lucide-react`. Helper `cn` en `@/lib/utils`.
Tema oscuro por defecto: poner `class="dark"` en `<html>` (index.html).

## Logging

Todo lo que pasa por `console.log/info/warn/error/debug`, los errores no capturados y los
`unhandledrejection` del front, más los eventos del backend, se escriben en
`<app_log_dir>/ainess-YYYY-MM-DD.log` (en Windows `%LOCALAPPDATA%\com.ainess\logs`, el mismo
lugar para la app y para el CLI). Formato de línea:

```
2026-09-05T14:03:22.123Z [info] [runner] run 8bc8af51 inicia: claude.exe -p
```

`src-tauri/src/logging.rs`: `LogState { file: Mutex<Option<(String /*fecha*/, File)>> }` (`manage`d
en `lib.rs`), `append(app, level, source, message)` (crea la carpeta, rota al cambiar el día,
enmascara `token=…` / `"token":"…"` / `Bearer …` con `***`, trunca a 10 kB y nunca propaga un
error), `prune_old(app)` (borra archivos de más de 14 días, se llama en `setup`) y los comandos
`log_append`, `logs_dir`, `open_logs_dir` (usa `tauri_plugin_opener::open_path`, así el scope del
plugin no cambia) y `read_recent_logs`. Loguean desde Rust: arranque y cierre de la app con la
versión, spawn y exit de cada run (`runner.rs`), fallas de `exec_capture` y de `http_*`,
`remote_start`/`remote_stop`, los eventos de la bandeja y todo el ciclo del túnel.

`src/lib/logger.ts`: `log.debug/info/warn/error(source, ...args)` formatea (`JSON.stringify` para
objetos, `name: message` + stack para `Error`), enmascara secretos, trunca a 10 kB, guarda las
últimas 500 líneas en memoria (`getRecentLogs()`, lo usa "Copiar diagnóstico") y manda todo por
`Transport.logAppend(level, source, message)`. En Tauri es `invoke("log_append")`; en el CLI el
`nodeTransport` escribe el mismo archivo con `fs.appendFileSync` (y poda a los 14 días); en el
navegador es no-op. `installConsoleCapture()` envuelve `console.*` (los originales siguen
imprimiendo) y engancha `window.onerror` + `unhandledrejection` (en node,
`uncaughtExceptionMonitor`, que observa sin cambiar el exit code); se llama en `src/main.tsx` y en
`src/cli/main.ts`. El logger nunca usa `console`, para no recursar.

Nivel mínimo: `AppConfig.logLevel` (`"debug" | "info" | "warn" | "error"`, default `"info"`), switch
"Registrar detalles (debug)" en Configuración → General; `store.updateConfig` y `runInit` llaman a
`setLogLevel`.

## Acerca de y actualizaciones

Sección `about` (última de `SETTINGS_SECTIONS`, icono `Info`,
`src/components/settings/AboutSection.tsx`): nombre y versión, autor con link al perfil de GitHub
(`tauri_plugin_opener`), tecnologías, "Buscar actualizaciones" (resultado inline: al día / versión
nueva con notas y botón "Descargar e instalar" con `Progress` / "No se pudo consultar: …"), "Abrir
carpeta de logs" (`open_logs_dir`, deshabilitado fuera de Tauri) y "Copiar diagnóstico" (versión,
entorno, binarios detectados y las últimas 50 líneas del buffer del logger).

La versión sale de `getVersion()` de `@tauri-apps/api/app` en la app y de la constante
`__APP_VERSION__` (inyectada con `define` en `vite.config.ts` y `vite.cli.config.ts`, declarada en
`src/vite-env.d.ts`) en el CLI y en el preview.

Updater oficial de Tauri 2: `tauri-plugin-updater` + `tauri-plugin-process` en `Cargo.toml` y en
npm, registrados en `lib.rs`, con las capabilities `updater:default` y `process:default`.
`tauri.conf.json` tiene `bundle.createUpdaterArtifacts: true` y
`plugins.updater { pubkey, endpoints: ["https://github.com/Matias-Obezzi/ainess/releases/latest/download/latest.json"] }`.
`src/lib/updates.ts` expone `appVersion()` y `checkForUpdate()`, que nunca lanza: devuelve
`{ available: false }`, `{ available: false, unsupported: true }` fuera de Tauri, `{ available:
false, error }` si falla la consulta, o `{ available: true, version, body, install }` (descarga con
progreso y `relaunch()`). El hook `src/hooks/useUpdateCheck.ts` (montado en `App.tsx`) consulta 5 s
después de `loaded` si `config.autoUpdateCheck` está prendido y muestra un toast persistente
"ainess X.Y.Z disponible" con botón "Instalar".

Releases: `.github/workflows/release.yml` corre en cada push a `main` (windows-latest), verifica que
las versiones de `package.json`, `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml` coincidan
(`npm run release:check` → `scripts/release-check.mjs`), saltea si ya existe el tag `v<versión>` y,
si no, usa `tauri-apps/tauri-action@v0` para publicar el instalador NSIS, su firma y `latest.json`.
Único requisito del repo: el secret `TAURI_SIGNING_PRIVATE_KEY`. `.github/workflows/ci.yml` corre en
PRs y en pushes a ramas que no son `main`: typecheck, tests, `npm run build`, `npm run build:cli`,
`release:check` y `cargo check`.

## Diagnóstico del sistema

`src/lib/diagnostics.ts` corre seis chequeos de solo lectura y devuelve
`{ id, level: "ok" | "warn" | "error", title, detail, hint? }` por cada uno: `clis` (qué CLIs se
detectaron y cuáles usan los agentes sin estar instalados → eso es error), `quota` (si se pudo leer
la de cada proveedor en uso y el motivo si no), `remote` (si el servidor escucha y en qué dirección,
o si el puerto está libre cuando está apagado), `tunnel` (cloudflared/ngrok instalados y si ngrok
tiene authtoken y API key), `logs` (carpeta escribible y su tamaño) y `data` (proyectos, agentes,
tareas, corridas y tamaño del historial).

Cada `check*(input, t)` es puro: recibe un `DiagnosticsInput` ya recolectado y un traductor con la
firma de `useT()`, así la UI sale traducida y el CLI en español (`translate(es, es, …)`).
`collectDiagnosticsInput()` es la única parte con I/O. **Nunca imprime tokens ni claves**: el input
lleva booleanos para las credenciales de ngrok, la dirección del servidor se arma como `ip:puerto`
(nunca la URL, que lleva el token) y `formatDiagnosticsReport` pasa todo por `maskSecrets`.
`runDiagnostics` devuelve la lista y `worstLevel` el peor nivel.

Un chequeo que no se puede correr acá sale como aviso con el motivo, no como error: sin backend
(preview del navegador, celular) `storageStat` devuelve `null` y eso apaga la detección de binarios
y de túnel; el servidor remoto solo se puede observar desde la app (`canObserveRemote`), así que
`ais doctor` avisa en vez de fallar cuando está prendido en la configuración.

Dos comandos Rust nuevos, en `src-tauri/src/diagnostics.rs`, más sus métodos de `Transport`:

```
storage_stat(scope: "logs" | "config", relative_path?) -> StorageStat  // { path, exists, writable, files, bytes }
port_available(port: u16) -> bool
```

`storage_stat` no crea carpetas y prueba la escritura con un archivo `.ainess-write-check` que borra
enseguida; camina como mucho 4 niveles. En `nodeTransport` son `fs` y `net.createServer`; en los
transports del navegador y del celular devuelven `null`.

UI: `src/components/settings/DiagnosticsSection.tsx`, sección `diagnostics` de `SETTINGS_SECTIONS`
(grupo `app`, icono `Stethoscope`), con "Volver a chequear" y "Copiar informe". CLI: `ais doctor
[--json]` imprime el mismo informe en español y termina con código 1 si hay algún error.

## Acceso remoto (celular)

La página que se abre desde el QR **es la misma app React**, en layout de una columna. Vive en
`src/remote/` y se compila aparte con `vite.remote.config.ts` (`npm run build:remote`): mismo
`react`/`tailwind`/alias `@` que `vite.config.ts`, `root: "src/remote"` y `vite-plugin-singlefile`
+ `assetsInlineLimit`/`cssCodeSplit: false` para que salga **un solo** `dist-remote/index.html` con
el JS y el CSS adentro (~650 kB, ~206 kB gzip). Ese archivo lo incrustan los dos servidores
(`include_str!` en `src-tauri/src/remote.rs`, `?raw` en `src/lib/remote-node.ts`), así que es una
dependencia de compilación: `npm run build` lo genera al final, `build:cli` lo genera primero y
`beforeDevCommand` es `npm run build:remote && npm run dev`. `src-tauri/build.rs` escribe un
placeholder en `dist-remote/index.html` cuando falta, para que un clon limpio pase `cargo check`.
`dist-remote/` está en `.gitignore`.

Piezas:

- `src/remote/index.html`: el tema sigue a `prefers-color-scheme` (script inline que pone la clase
  `dark` en `<html>`), `viewport-fit=cover`.
- `src/remote/main.tsx`: instala `remoteTransport` **antes** de tocar el store y monta `RemoteApp`.
  No hay `installConsoleCapture()`: en el celular no hay archivo de log.
- `src/lib/transport-remote.ts`: `Transport` inerte (como `transport-null.ts`) salvo `httpGet`/
  `httpPost`, que son `fetch` reales. Nada spawnea, lee ni persiste: el orquestador vive en la PC.
- `src/remote/remote-client.ts`: `getToken()` (de `?token=`, guardado en `sessionStorage` y borrado
  de la URL con `history.replaceState`), `api(path, body?)` (fetch con `Authorization: Bearer`,
  tira `RemoteError` con el status), `connectEvents()` (EventSource sobre `/api/events` con backoff
  1→10 s), `hydrate(snapshot)` (vuelca el snapshot en el store con `setState`, respetando
  `currentProjectId`/`currentChatId` del celular) e `installRemoteActions()`, que **sobrescribe en
  el store** las acciones que ejecutan algo: `submitPrompt`/`instructAgent`/`stopAll`/`stopAgent`/
  `approve`/`reject`/`sendChatMessage`/`stopChat` pasan a ser POSTs y muestran `toast.error` con el
  `error` que devuelva la PC. `saveConfig` y `loadChatMessages` quedan en no-op; `createChat`/
  `updateChat`/`removeChat` avisan que eso se edita desde el escritorio.
- `src/remote/RemoteApp.tsx`: pantallas de conexión (sin token / token inválido / conectando) y
  banner "Reconectando…" arriba mientras el SSE está caído. **Inicio**: lista de proyectos (color,
  nombre, última tarea, "N trabajando") y botón con las aprobaciones pendientes. **Proyecto**:
  cabecera fija (volver, nombre, puntitos de estado) y pestañas inferiores fijas — Orquestador
  (`OrchestratorThread` + `Composer`), Chats (lista → `ChatThread` + `Composer`), Aprobaciones
  (`ApprovalsPanel` o empty state) y Agentes (avatar, rol, estado, tarea, Detener e Indicar con
  `InstructDialog`). Los componentes se reusan **sin tocarlos**; no hay sidebar, terminales,
  jerarquía ni configuración.

Snapshot (`RemoteSnapshot` en `src/lib/remote.ts`) — todo lo que los componentes necesitan para
renderizar sin leer el disco: `projects` (con `activeTaskRunId` y `running`), `agents` (los de todos
los proyectos, cada uno con su `projectId`), `runtime`,
`messages` (últimos 800, con `meta` y `runId`, texto recortado a 8000), `approvals` pendientes con
`payload`, `runs` (últimos 60 por proyecto, sin `rawLines`, `prompt`/`output` a 20 000), `chats`,
`chatMessages` (últimos 200 por chat cargado), `binaries` (solo `path`) y `activeChats`. Si el JSON
pasa 1 MB se rearma con 400 mensajes y 30 runs por proyecto; el tamaño se loguea en nivel `debug`.
`attachRemote` pushea con throttle de 300 ms cuando cambian `runs`, `messages`, `runtime`,
`approvals`, `activeTaskRunId`, `chatMessages`, `binaries` o `config`.

`isChatActive` (`src/lib/chat.ts`) vive en la memoria del proceso que corre los turnos, así que en
el celular consulta además `useAppStore.getState().remoteActiveChats`, campo del store que solo
llena la hidratación del remoto (en la app queda `[]` y nada cambia).

Protocolo HTTP (mismas rutas en `src-tauri/src/remote.rs` y `src/lib/remote-node.ts`, ambos solo
pasan el JSON; todo exige `Authorization: Bearer <token>` o `?token=`):

```
GET  /                 la página (dist-remote/index.html)
GET  /api/state        el snapshot
GET  /api/events       SSE, evento `state` con el snapshot entero
POST /api/prompt       { projectId, agentId?, text, model? }
POST /api/instruct     { projectId, agentId, text, model? }
POST /api/stop         { projectId, agentId? } | { chatId }
POST /api/approve      { approvalId, decision: "approve" | "reject", note? }
POST /api/chat         { chatId, text }
```

Errores: `{ error }` con 400; token inválido, 401. El token nunca se loguea (`maskSecrets`) ni
queda en la barra de direcciones.

## Túnel público

`AppConfig.remote.tunnel: { provider: "cloudflared" | "ngrok"; enabled: boolean; domain?: string;
tunnelName?: string }` (migración a `version: 9`, junto con `logLevel` y `autoUpdateCheck`; default
`{ provider: "cloudflared", enabled: false }`). `domain` y `tunnelName` son opcionales y no
bumpean la versión: una config vieja sigue arrancando igual, con URL efímera.

Dos formas de tener **URL fija** (la misma siempre, en vez de la efímera de cada arranque), las dos
soportadas y sin dependencias nuevas:

- **ngrok con dominio estático**: el plan gratis incluye un (1) dominio estático
  (`algo.ngrok-free.app`) reclamado en dashboard.ngrok.com → Domains. Alcanza con cargar `domain`;
  se lanza como `ngrok http <port> --log=stdout --log-format=json --url https://<domain>`.
- **cloudflared con named tunnel**: requiere cuenta de Cloudflare y un dominio propio. El usuario
  corre una vez `cloudflared tunnel login`, `cloudflared tunnel create <tunnelName>` y
  `cloudflared tunnel route dns <tunnelName> <domain>`; hacen falta **los dos** campos (`domain` y
  `tunnelName`) para que cuente como fija — si falta `tunnelName` se comporta como quick tunnel. Se
  lanza como `cloudflared tunnel --url http://127.0.0.1:<port> run <tunnelName>` y no imprime
  ninguna URL: se detecta que quedó arriba con una línea de conexión registrada
  (`/registered tunnel connection/i` o `/connection [0-9a-f-]{8,} registered/i`) y se devuelve
  `https://<domain>` normalizado.

El quick tunnel de cloudflared (`trycloudflare.com`) no puede tener URL fija por diseño: sigue
siendo el modo por defecto cuando no hay `domain`/`tunnelName` configurados.

`src/lib/tunnel.ts` tiene la parte compartida y testeada: `normalizeDomain(input)` (saca esquema,
espacios, path y barra final, pasa a minúsculas), `hasFixedUrl(provider, opts)` y
`fixedUrl(provider, opts)` (con `opts: { domain?, tunnelName? }`), `tunnelArgs(provider, port,
opts?)`, `extractTunnelUrl(provider, line, opts?)`, `tunnelBinary`, `tunnelInstallCommand`,
`tunnelDescription`. `src/lib/tunnel-node.ts` es la misma lógica con `child_process` para
`ais serve --tunnel`.

`src-tauri/src/tunnel.rs`: `TunnelState { child, url, provider, fixed }` (`Mutex`), comandos
`tunnel_start(provider, port, domain, tunnel_name)`, `tunnel_stop()`, `tunnel_status()` (con
`fixed: bool` para que la UI lo muestre) y `tunnel_detect()`. `tunnel_start` es `async` y hace el
trabajo bloqueante en `spawn_blocking`: resuelve el binario con `detect::find_path` (PATH + carpetas
de winget), arma los argumentos igual que `tunnelArgs`, lo lanza oculto (`CREATE_NO_WINDOW`), lee
stdout y stderr en hilos y espera a que aparezca la URL pública (o, en un named tunnel, la línea de
conexión registrada) con el mismo `extract_url` espejo de la versión TS. El timeout es 30 s, salvo
para un named tunnel de cloudflared que sube a 45 s (tarda más en registrar las conexiones). Si el
proceso muere antes, devuelve el error con las últimas líneas y una pista según el caso: authtoken
de ngrok, dominio no reclamado en la cuenta de ngrok (`domain` + `not found`/`not
authorized`/`ERR_NGROK_3200`), o falta de `cloudflared tunnel login`/`tunnel create` (menciones de
`origincertificate`, `cert.pem`, `credentials file` o `tunnel credentials`). `tunnel_status` detecta
con `try_wait` que el túnel se cayó solo, para que la UI muestre "Se cayó el túnel" con botón
"Reintentar". `tunnel::shutdown` se llama en `RunEvent::Exit`, así no queda ningún proceso huérfano
al salir por la bandeja.

Comandos y parsing (sin URL fija, el caso por defecto):

- cloudflared: `cloudflared tunnel --url http://127.0.0.1:<port>`, imprime la URL en **stderr**
  (`https://<algo>.trycloudflare.com`). Sin cuenta; la URL cambia cada vez.
- ngrok: `ngrok http <port> --log=stdout --log-format=json`, la URL sale en el campo `url` del
  evento `started tunnel`. Necesita `ngrok config add-authtoken …`. Para el dominio fijo, la bandera
  depende de la versión del agente: `--domain <host>` hasta 3.15 y `--url <url>` de 3.16 en adelante
  (`--domain` sigue andando pero está deprecada). Pasar la que no es aborta el túnel con
  `unknown flag`, así que antes de lanzar se lee `ngrok http --help` y se elige: `ngrokDomainFlag`
  en `src/lib/tunnel.ts` (`TunnelOptions.ngrokFlag`), `help_has_url_flag`/`ngrok_domain_flag` en
  `src-tauri/src/tunnel.rs` y `probeNgrokFlag` en `src/lib/tunnel-node.ts`. Si la sonda falla, se usa
  la sintaxis vieja.

`src/lib/remote.ts` agrega `startTunnel()` (exige que el servidor local esté corriendo, si no lanza
"Prendé primero el acceso remoto local"; pasa `{ domain, tunnelName }` de la config al transport),
`stopTunnel()` y `tunnelUrl(publicUrl, token)`. `Transport.tunnelStart(provider, port, opts?)` recibe
las mismas opciones; `transport-tauri.ts` las manda como `domain`/`tunnelName` al comando Tauri
(camelCase, sin `rename_all` porque Tauri ya mapea así por defecto). El store tiene `tunnelStatus` y
las acciones `startTunnel/stopTunnel/refreshTunnelStatus`; `stopRemote` apaga el túnel primero y
`runInit` lo levanta al arrancar si `remote.enabled && remote.tunnel.enabled`.

`RemoteSection` suma el bloque "Acceso desde afuera (túnel)": select de proveedor con su
explicación, estado de detección del binario con el `winget install …` y botón "Volver a detectar",
y después un formulario en una sola tarjeta, con filas (etiqueta a la izquierda, control y ayuda a la derecha, componente local Field) que cambian según el proveedor. Con **ngrok** manda el select "Tipo de dominio"
(`TunnelConfig.domainType`, que en una config vieja se deduce de si hay `domain`): en *dinámico* el
campo "Dominio" es un input deshabilitado que muestra el host que generó ngrok en esta corrida; en
*estático* aparecen las filas de authtoken y API key (estado, editor inline y link al dashboard, en
el componente local `NgrokCredential`) y el campo "Dominio" pasa a ser
un select con los dominios de la cuenta, que se traen solos apenas hay API key. Sin API key el campo
queda deshabilitado con la leyenda "Autenticate para configurar". Con **cloudflared** sigue el bloque
"URL fija (opcional)" con nombre de túnel + hostname y los tres comandos de referencia. Además:
switch deshabilitado (con tooltip) si el acceso local está apagado o falta el binario, badge "URL
fija" con la URL que va a quedar, URL pública con QR y Copiar, y el aviso de seguridad. Cambiar el
dominio o el nombre del túnel mientras el túnel está corriendo lo reinicia solo (stop + start),
mostrando el mismo indicador `tunnelBusy` que usa el switch. La página remota usa rutas relativas, así que funciona igual detrás
del túnel.

Instalación desde la app: cuando ngrok no está, la fila Proveedor ofrece "Instalar ngrok", que corre
`winget install ngrok -s msstore --accept-package-agreements --accept-source-agreements
--disable-interactivity` (el comando que documenta ngrok; el paquete de la Store deja un alias en
`%LOCALAPPDATA%\Microsoft\WindowsApps`, que la detección ahora mira explícitamente y acepta aunque
pedirle metadata falle, como pasa con los alias de ejecución), con timeout de 300 s vía el parámetro
de `Transport.exec`, y después vuelve a detectar. El botón vive al lado de "Volver a detectar" y va
narrando las fases (`installNgrok(onPhase)`: instalando → detectando). Un "already installed" de
winget no cuenta como error. **No** corre el actualizador después de instalar: el paquete de la Store
no puede reemplazarse a sí mismo (`in-place upgrades are not supported`) y la Store ya lo mantiene al
día, así que `ngrokUpdateOutcome` trata ese mensaje como "ya está al día" y no como falla.

Estado remoto sincronizado: `useRemoteSync` (montado en `App`) refresca `remoteStatus` y
`tunnelStatus` cada 4 s para toda la app, no solo con el modal de configuración abierto; antes el
store quedaba viejo al cerrarlo y el switch aparecía apagado con el servidor andando. El switch se
liga a `remoteStatus.running` (la realidad) y no a `config.remote.enabled` (la intención, que es lo
que hace que arranque solo). `toggleRemote(enabled)` vive en el store y lo comparten el switch y el
botón nuevo de la barra de ventana (`RemoteButton` en `TitleBar`), con `remoteBusy` para que los dos
se deshabiliten mientras tanto. En `runInit`, si el servidor ya está levantado (recarga del front),
se adopta ese estado en vez de intentar arrancar otro.

Actualización automática del agente: ngrok rechaza la conexión cuando la versión es menor que el
mínimo que pide la cuenta (`ERR_NGROK_121`) y el paquete de winget queda atrasado, así que la app
corre `ngrok update` sola. `ensureNgrokUpToDate` (en `ngrok-account.ts`) lo hace una vez por sesión,
cacheando la promesa salvo que falle; `App.tsx` la dispara al arrancar apenas `tunnelDetect`
encuentra el binario, y `RemoteSection` muestra "Actualizando ngrok a la última versión…" mientras
pasa y después la versión (con "recién actualizado" si cambió) o el error. El parseo está en
`ngrok.ts` (`parseNgrokVersion`, `ngrokUpdateOutcome`) y testeado.

Cuenta de ngrok (`src/lib/ngrok.ts` puro + `src/lib/ngrok-account.ts` con I/O). ngrok usa dos
credenciales distintas: el **authtoken**, con el que el agente se conecta, y la **API key**, que solo
sirve para consultar la API de la cuenta. Las dos viven en el `ngrok.yml` del usuario
(`%LOCALAPPDATA%
grok
grok.yml` en Windows), nunca en la config de ainess. `ngrokAccountStatus`
corre `ngrok config check` (imprime `Valid configuration file at <ruta>`), lee el archivo con
`Transport.readFileAbs` (comando Tauri `read_file_abs`, con `readHomeFile` como respaldo) y reporta
solo si cada clave está presente, nunca su valor; no hay archivo todavía es estado normal, no error.
`saveNgrokCredential` corre `ngrok config add-authtoken|add-api-key <valor>`. `ngrokReservedDomains`
saca la API key del archivo y pega en `GET https://api.ngrok.com/reserved_domains` con
`Authorization: Bearer …` y `ngrok-version: 2`. La app **no** valida el authtoken contra el servidor:
eso solo se sabe al prender el túnel. En `RemoteSection`, con proveedor ngrok, el bloque "Cuenta de
ngrok" muestra el estado de cada credencial, deja cargarlas en un input `type="password"` y ofrece
"Traer mis dominios" para elegir el dominio de un select en vez de tipearlo. Las credenciales no se
loguean nunca: `maskSecrets` además tapa `authtoken`/`api_key` por las dudas.

CLI: `ais serve --tunnel [cloudflared|ngrok] [--tunnel-domain <dominio>] [--tunnel-name <nombre>]`
levanta el túnel junto con el servidor e imprime la URL pública (los overrides se guardan en la
config, igual que `--tunnel <prov>`); `ais remote url --tunnel` devuelve la URL pública del túnel de
ese proceso.

## Verificación

```
npx tsc --noEmit               # frontend
npm test                       # unit tests (vitest)
npm run build                  # bundle web + dist-remote/index.html
npm run build:remote           # solo la página del celular
npm run build:cli              # bundle del CLI (incrusta la página del celular)
npm run release:check          # las tres versiones coinciden
cd src-tauri && cargo check    # backend
cd src-tauri && cargo test     # unit tests de Rust (logging, tunnel)
npm run tauri dev              # app completa
```
