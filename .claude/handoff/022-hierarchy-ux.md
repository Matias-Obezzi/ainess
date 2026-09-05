# Vista de Jerarquía: nodos compactos con acciones por icono, estado vivo, edges con sentido, inspector lateral y toolbar

Repo: C:\Users\matia\Desktop\projects\ais (único repo)
Rama: la que esté activa (`main`), sin cambiar de rama ni crear otras

## Objetivo
Que la Jerarquía sea un tablero útil y lindo, no una lista de cards con cuatro botones: de un vistazo se ve
quién trabaja, en qué, hace cuánto y quién delegó a quién; cada nodo tiene acciones por icono con tooltip;
al clickear un nodo se abre un inspector lateral con su actividad en vivo; hay una toolbar para ajustar la
vista; y el grafo respeta el tema.

## Contexto
Leer `PLAN.md` ("UI") antes de empezar. Stack: React 19 + TS estricto (`noUnusedLocals`) + Tailwind 4 +
shadcn (`src/components/ui`: button, badge, card, tooltip, dropdown-menu, separator…) + `@xyflow/react`
(ya instalado; `HierarchyGraph.tsx` importa `@xyflow/react/dist/style.css`). Iconos `lucide-react`. UI en
español, código en inglés. Sin dependencias nuevas.

Cómo está hoy:
- `src/components/HierarchyGraph.tsx`: calcula posiciones a mano por niveles (`nodeWidth = 280`,
  `nodeHeight = 260`), `nodeTypes = { agent: AgentNode }`, edges `animated` cuando el hijo está `working`,
  `Background` + `Controls`, `proOptions.hideAttribution`, sin minimapa.
- `src/components/AgentNode.tsx`: `Card` de 220px con borde izquierdo del color del agente, nombre, badges
  provider/rol, `StatusDot` + `statusLabel`, badge "ocupado en: <otros proyectos>", tarea actual (2 líneas),
  y 4 botones de texto (Detener, Indicar → `InstructDialog`, Ver salida → `RunDetailDialog` del último run,
  Chatear → `openProject(projectId, chatId)`). Tooltip `AlertTriangle` si el CLI no está detectado.
- Estado: `runtime[projectId][agentId]` = `{ status: idle|working|waiting|stopped|error, currentTask,
  currentRunId, lastError }`; `runs` (con `startedAt`, `parentRunId`, `rootRunId`, `status`); `messages`
  (feed con `runId`, `kind` text/tool/delegation/result/error, `meta.summary` en tools). `RunActivity`
  (`src/components/shell/RunActivity.tsx`, `RunActivity({ runId, compact?, showFooter? })`) ya muestra la
  actividad en vivo de un run. Helpers: `formatElapsed`, `truncate` (`src/lib/format.ts`), `statusLabel`,
  `roleLabel`, `runDotStatus` (`src/lib/labels.ts`), `StatusDot`.
- `src/index.css:77-81`: overrides `.dark .react-flow__*` para fondo, controles y minimapa.
- `ProjectScreen.tsx` renderiza `<HierarchyGraph/>` en el cuerpo con el `Composer` abajo; el dock derecho
  (`RightDock`) puede estar abierto y quita 380px.

## Cambios

### 1. Nodo (`src/components/AgentNode.tsx`, reescribir)
Card de 260px, `rounded-xl border bg-card shadow-sm`, borde superior de 3px con el color del agente:
- **Cabecera**: avatar circular de 28px con la inicial del nombre sobre el color del agente, nombre en
  `font-semibold`, debajo en `text-[11px] text-muted-foreground` "{provider} · {rol}"; a la derecha
  `StatusDot` grande (10px) con `animate-pulse` si `working`, y si el CLI no está detectado un `AlertTriangle`
  rojo con tooltip "CLI no encontrado: configuralo en Agentes".
- **Estado**: una línea: "Trabajando · 2:14" (cronómetro desde `startedAt` del `currentRunId`, tick 1 s solo
  si working/waiting), "Esperando a sus hijos", "Inactivo", "Error" (con `lastError` en tooltip). Si está
  ocupado en otros proyectos, badge chico ámbar "en {proyecto}" (como hoy pero más discreto).
- **Tarea actual**: 2 líneas `line-clamp-2` en `text-xs`, con tooltip del texto completo; oculta si no hay.
- **Última herramienta** (solo working): última `messages` `kind === "tool"` del `currentRunId` →
  `meta.summary` en `font-mono text-[11px] text-muted-foreground truncate` con su icono (`toolIcon` de
  `src/lib/tool-summary.ts`).
- **Acciones**: fila de iconos `ghost` `h-7 w-7` con `Tooltip`: Detener (`Square`, destructivo, solo si
  working/waiting), Indicar (`MessageSquareText`), Ver salida (`FileText`, disabled sin runs), Chatear
  (`MessageCircle`); y un `DropdownMenu` (`MoreHorizontal`) con "Reiniciar sesión" (`resetSession`) y
  "Editar agente" (`openSettings("agents")`). Sin botones de texto.
- Nodo seleccionado (`selected` prop de React Flow): `ring-2 ring-primary/60`.
- Handles: `Top` target y `Bottom` source, chicos (`!w-2 !h-2 !bg-muted-foreground !border-0`).

### 2. Edges y layout (`src/components/HierarchyGraph.tsx`)
- `type: "smoothstep"`, `pathOptions: { borderRadius: 12 }`, color: `stroke: agent.color` con opacidad
  (`strokeOpacity: 0.7`), `strokeWidth: 1.5` (2.5 si el hijo está working), `animated` si working,
  `markerEnd: { type: MarkerType.ArrowClosed, color }`. Label del edge solo cuando el hijo está working o
  waiting: `label: "delegado"` con `labelStyle`/`labelBgStyle` en tokens del tema (fondo `var(--card)`,
  texto `var(--muted-foreground)`, 10px).
- Layout: mantener el algoritmo por niveles pero centrar cada grupo de hijos debajo de su padre (calcular el
  ancho del subárbol recursivamente: `subtreeWidth(node) = max(nodeWidth, sum(children widths) + gaps)`, y
  posicionar hijos repartidos bajo el centro del padre). `nodeWidth = 260`, `gapX = 40`, `gapY = 90`.
- `fitView` con `padding: 0.2`, `minZoom 0.4`, `maxZoom 1.5`, `nodesDraggable`, `nodesConnectable={false}`,
  `deleteKeyCode={null}`, `proOptions.hideAttribution`. Re-`fitView` (vía `useReactFlow().fitView`) cuando
  cambia la cantidad de agentes o el ancho del contenedor (`ResizeObserver`) — envolver en
  `ReactFlowProvider`.
- Click en un nodo → `selectedAgentId` (estado local del grafo) y abre el inspector (§3). Click en el fondo
  (`onPaneClick`) lo deselecciona.

### 3. Inspector lateral (`src/components/shell/AgentInspector.tsx`, nuevo)
Panel de 360px a la derecha **dentro** del área del grafo (`absolute right-3 top-3 bottom-3`, `bg-card border
rounded-xl shadow-lg`, con botón cerrar), no toca el dock derecho. Contenido: cabecera con avatar/nombre/
provider/rol/estado; "Tarea actual" completa (`whitespace-pre-wrap`); `RunActivity runId={currentRunId}` si
está working (título "Actividad en vivo"); si no, los últimos 3 runs del agente en este proyecto como lista
(hora, estado, prompt truncado, "Ver" → `RunDetailDialog`); y abajo los mismos botones de acción del nodo
(con texto acá). Se cierra con `Escape` (sin disparar el "detener" del Composer: el listener de `Composer`
ya ignora `[role=dialog]`; agregarle `[data-inspector]` a la lista de selectores ignorados).

### 4. Toolbar y overlays (`HierarchyGraph.tsx`)
- Arriba a la izquierda, overlay `absolute left-3 top-3 flex gap-1`: resumen con badges: "{n} trabajando"
  (verde, pulso si > 0), "{n} esperando" (ámbar), "{n} inactivos" (muted).
- Arriba a la derecha (si no está el inspector): botones `ghost` con tooltip: "Ajustar vista" (`Maximize2`
  → `fitView`), "Centrar en el activo" (`Crosshair` → `fitView({ nodes: [working ids] })`, disabled si no hay),
  y acercar/alejar (`ZoomIn`/`ZoomOut`). Quitar el `<Controls/>` de React Flow.
- `Background variant="dots" gap={20} size={1}` con `color` derivado de `--border`.
- Estado vacío (sin agentes): `EmptyState` con CTA "Crear un agente" → `openSettings("agents")`.

### 5. Tema (`src/index.css`)
Reemplazar las reglas `.dark .react-flow__*` por reglas sin `.dark` basadas en tokens (funcionan en ambos
temas): `.react-flow__background`, `.react-flow__edge-path`, `.react-flow__edge.selected .react-flow__edge-path`
(stroke `var(--primary)`), `.react-flow__edge-textbg` (`fill: var(--card)`), `.react-flow__edge-text`
(`fill: var(--muted-foreground)`), `.react-flow__attribution` oculto, `.react-flow__node` sin outline por
defecto (`.react-flow__node:focus { outline: none }`), `.react-flow__handle` en tokens. Borrar las de
minimapa/controles que ya no se usan.

### 6. `PLAN.md`
Sección "UI" → Jerarquía: describir nodo, inspector, toolbar y layout.

## Casos borde y decisiones ya tomadas
- Con muchos agentes (10+) el layout sigue siendo por niveles con scroll/zoom; no hace falta paginación.
- El inspector muestra el estado del **proyecto actual**; el badge "en {proyecto}" es lo único que mira otros.
- Las acciones no cambian de semántica: Detener = `stopAgent(agentId, projectId)`, Indicar = `InstructDialog`,
  Ver salida = `RunDetailDialog` del último run del agente en el proyecto, Chatear = crea/abre el chat
  individual (misma lógica que hoy en `AgentNode.openChat`).
- No tocar `OrchestratorThread`, `Composer` (salvo el selector ignorado por Escape), el dock, `src/lib/*`
  ni `src-tauri/*`.

## Fuera de alcance
- Editar la jerarquía arrastrando edges (cambiar padres desde el grafo).

## Verificación
Desde la raíz del repo:
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
```
No correr `npm run tauri dev` (puerto 1420 ocupado por la app del usuario).
