# Conversación en tiempo real: ver qué hace el agente mientras trabaja (texto, herramientas, delegaciones) y markdown

Repo: C:\Users\matia\Desktop\projects\ais (único repo)
Rama: la que esté activa (`main`), sin cambiar de rama ni crear otras

## Objetivo
Mientras un agente trabaja, el hilo del Orquestador y los chats muestran en vivo lo que está haciendo, como
la UI de Claude Code: el texto que va escribiendo, cada herramienta que usa ("Edit src/lib/x.ts", "Bash npm
test"), las delegaciones y lo que hacen los agentes hijos. Nada de "Trabajando…" a secas. Cuando termina, la
respuesta final se muestra renderizada como markdown y la actividad queda plegada para revisarla.

## Contexto
Leer `PLAN.md` ("UI", "Ciclo (orchestrator.ts)") antes de empezar. Stack: React 19 + TS estricto
(`noUnusedLocals`) + Tailwind 4 + shadcn. Iconos `lucide-react`. UI en español, código en inglés.

Cómo está hoy:
- `src/lib/orchestrator.ts` `handleOutput`: por cada `ParsedEvent` del provider: `text` → `appendCommText`
  (un `CommMessage` con id `text-<runId>` que crece con cada delta), `tool` → `addMessage({ kind: "tool",
  text: "<name>: <detail>" })` (`detail` es JSON truncado a 200 chars), `result` → `run.output`, `error` →
  mensaje `error`. Las delegaciones generan mensajes `delegation` (`fromAgentId` → `toAgentId`) y runs hijos
  (`parentRunId`, `rootRunId`). `Run.rawLines` guarda la salida cruda.
- `src/lib/providers.ts` `ParsedEvent` (`src/types.ts:272`): `{ type: "tool"; name; detail? }`. Claude:
  `item.name`/`item.input` (`Edit`, `Read`, `Bash`, `Grep`, `Glob`, `Write`, `WebFetch`, `Task`…); Antigravity:
  `tool_name`/`tool_info.parameters`; Copilot: `req.name`/`req.arguments` (`view`, `create`, `edit`,
  `powershell`, `grep`, `glob`, `web_fetch`…).
- `src/components/shell/OrchestratorThread.tsx` `RunBubble`: mientras `run.status === "running"` muestra
  "Trabajando… m:ss"; al terminar `run.output` en texto plano (colapsado a 12 líneas) y chips de los runs
  hijos directos (`parentRunId === run.id`) con `StatusDot`.
- `src/components/shell/ChatThread.tsx` `ChatBubble`: el mensaje pendiente del agente (`status: "pending"`,
  `text: ""`) muestra un badge "escribiendo…"; `src/lib/chat.ts` crea ese `pendingMsg` y llama `startRun(...)`
  (`kind: "chat"`) justo después; `ChatMessage` ya tiene `runId?` (`src/types.ts:264`) pero no se setea en el
  pendiente. `onChatRunFinished` reemplaza el texto con `run.output`.
- `src/components/CommunicationPanel.tsx` + `MessageItem.tsx`: feed crudo de `messages` (queda como está).
- `src/components/RunDetailDialog.tsx`: muestra prompt, salida y `rawLines` de un run.
- Store: `messages: CommMessage[]` (`{ id, ts, runId?, projectId?, fromAgentId, toAgentId?, kind, text }`).

## Cambios

### 1. Eventos de herramienta más ricos
- `ParsedEvent` tool: agregar `input?: unknown` (el objeto completo). Providers: claude `item.input`,
  antigravity `tool_info?.parameters`, copilot `req.arguments`. Mantener `detail`.
- `CommMessage`: agregar `meta?: { tool: string; summary: string; input?: unknown }`.
- `src/lib/tool-summary.ts` (nuevo, puro, testeable): `summarizeTool(name, input): string` → una línea corta
  y legible por nombre de herramienta, sin importar el provider: `file_path`/`path`/`filePath`/`notebook_path`
  → ruta relativa al workspace si se puede (`Edit src/lib/x.ts`), `command` → `Bash npm test` (truncado a 80),
  `pattern`/`query` → `Grep "foo"`, `url` → `WebFetch example.com`, `prompt`/`description` (Task) → primeros
  60 chars, sin claves conocidas → `name` + primer valor string. Y `toolIcon(name)` → icono lucide
  (`FilePen` edit/create/write, `FileText` read/view, `Terminal` bash/powershell/command, `Search` grep/glob,
  `Globe` web, `Bot` task/agent, `Wrench` default). `orchestrator.handleOutput` guarda `meta` en el mensaje
  tool usando `summarizeTool` con el workspace del proyecto.

### 2. Componente de actividad en vivo (`src/components/shell/RunActivity.tsx`, nuevo)
`RunActivity({ runId, compact?: boolean })`: lee `messages` del store y filtra por `runId` con `useMemo`
(nunca un selector que devuelva arrays nuevos). Renderiza en orden cronológico:
- el texto en curso (`text-<runId>`) como markdown (ver §4) mientras crece;
- cada `tool` como fila compacta: icono + `meta.summary` (o `text`), `font-mono text-xs text-muted-foreground`;
  si hay más de 30 filas seguidas, plegar las anteriores en "… N pasos más";
- cada `delegation` como una tarjeta anidada: "→ {agente}: {tarea truncada}" + `<RunActivity runId={hijo}
  compact/>` del run hijo (buscar el run hijo por `parentRunId === runId && agentId === toAgentId`, el más
  reciente), con su propio `StatusDot` y estado final;
- `error` en rojo;
- pie fijo mientras `run.status === "running"`: punto verde pulsante + "{última herramienta o 'Pensando…'}" +
  cronómetro `m:ss`.
En `compact` (hijos) se muestran solo las últimas 6 filas con "Ver todo" que expande.

### 3. Hilo del orquestador y chat
- `RunBubble`: mientras corre, en lugar de "Trabajando…" mostrar `<RunActivity runId={run.id}/>`. Al terminar:
  la respuesta final (`run.output`) en markdown, y arriba un desplegable "Actividad (N pasos · m:ss)" plegado
  por defecto que muestra el mismo `RunActivity` (sin pie). Los chips de hijos actuales se pueden quitar (la
  actividad ya los muestra anidados) o dejar solo como resumen de estado: dejarlos.
- Autoscroll del hilo: seguir al fondo mientras llegan deltas si el usuario ya estaba abajo (la lógica de
  "Nuevos mensajes ↓" existente), sin saltos por cada delta (usar `requestAnimationFrame`/throttle 100 ms).
- Chat: `chat.ts` setea `runId` en el `pendingMsg` (actualizar el mensaje con `setState` apenas `startRun`
  devuelve el id). `ChatBubble` con `status === "pending"` y `runId` → `<RunActivity runId compact={false}/>`
  dentro de la burbuja (texto en vivo + herramientas), sin el badge "escribiendo…" (reemplazado por el pie de
  `RunActivity`). Al terminar, el texto final en markdown.
- `ChatThread`: quitar el indicador "Escribiendo…" del final (redundante).

### 4. Markdown
Instalar `react-markdown` (10.x) y `remark-gfm` (4.x). `src/components/shell/Markdown.tsx`: envoltorio con
`remarkPlugins={[remarkGfm]}` y estilos Tailwind propios (sin `@tailwindcss/typography`): párrafos con
`mb-2`, listas con `list-disc pl-5`, `code` inline `bg-background/60 rounded px-1 font-mono text-[0.9em]`,
bloques `pre` con scroll horizontal y `font-mono text-xs`, tablas con bordes, links `text-primary underline`
que se abren con `openUrl` del plugin opener cuando `isTauri()` (si no, `target=_blank`). Usarlo en la
respuesta final del `RunBubble`, en `ChatBubble` (mensajes del agente; los del usuario siguen en texto plano)
y en el texto en vivo de `RunActivity`. Los bloques ```delegate se muestran como una tarjeta "Delegación"
con la lista de tareas, no como código crudo (parsear con `parseDelegations` de `providers.ts`).

### 5. Tests y docs
- `src/lib/__tests__/tool-summary.test.ts`: Edit con `file_path` absoluto dentro del workspace → ruta
  relativa; Bash con `command` largo → truncado; herramienta desconocida con objeto → nombre + primer string;
  input `undefined` → solo el nombre.
- `PLAN.md`: sección "UI" → describir `RunActivity`, `meta` en `CommMessage`, `tool-summary`, markdown.

## Casos borde y decisiones ya tomadas
- Un run puede producir muchos deltas por segundo: el `useMemo` de `RunActivity` filtra por `runId` sobre
  `messages`; si se nota lento, indexar `messagesByRun` en el store (derivado en `addMessage`/`appendCommText`),
  pero solo si hace falta.
- Los mensajes `text` de runs hijos NO se mezclan en el padre: cada `RunActivity` muestra solo su `runId`.
- `RunDetailDialog` sigue existiendo (salida cruda).
- Página remota y CLI sin cambios (el CLI ya imprime tools en el feed).
- No tocar `src/components/shell/Terminal*`, `RightDock`, el dock ni `src-tauri/*`.

## Fuera de alcance
- Resaltado de sintaxis en bloques de código; edición de mensajes; streaming en la página remota.

## Verificación
Desde la raíz del repo:
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
```
No correr `npm run tauri dev` (puerto 1420 ocupado por la app del usuario).
