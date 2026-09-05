# Informe — 022 Vista de Jerarquía (nodos compactos, inspector, toolbar)

## Qué se hizo

**1. Nodo (`src/components/AgentNode.tsx`, reescrito)**
- Card de 260px (`rounded-xl border bg-card shadow-sm`) con borde superior de 3px del color del
  agente y `ring-2 ring-primary/60` cuando está seleccionado.
- Cabecera: avatar circular de 28px con la inicial sobre el color del agente, nombre en
  `font-semibold`, `"{provider} · {rol}"` en `text-[11px] text-muted-foreground`, `StatusDot` de
  10px (con `animate-pulse` si `working`) y `AlertTriangle` rojo con tooltip
  "CLI no encontrado: configuralo en Agentes" cuando el binario no está detectado.
- Línea de estado: "Trabajando · 2:14" (cronómetro desde el `startedAt` del `currentRunId`, con
  tick de 1 s solo mientras está working/waiting), "Esperando a sus hijos", "Inactivo",
  "Detenido" y "Error" (el texto en rojo, con `lastError` en tooltip). Badge ámbar discreto
  "en {proyecto}" cuando el agente está ocupado en otros proyectos (tooltip con la lista completa).
- Tarea actual en `line-clamp-2` con tooltip del texto completo.
- Última herramienta del run en curso (solo `working`): icono de `toolIcon` + `meta.summary` en
  `font-mono text-[11px] truncate`.
- Acciones solo de icono (`ghost h-7 w-7`, con tooltip): Detener (`Square`, destructivo, solo si
  working/waiting), Indicar (`MessageSquareText`), Ver salida (`FileText`, deshabilitado sin runs),
  Chatear (`MessageCircle`) y un `DropdownMenu` (`MoreHorizontal`) con "Reiniciar sesión" y
  "Editar agente". La fila lleva `nodrag nopan` y frena la propagación del click para que tocar un
  botón no abra el inspector ni arrastre el nodo.
- Handles `Top`/`Bottom` de 8px en `var(--muted-foreground)`.

**2. Grafo (`src/components/HierarchyGraph.tsx`, reescrito)**
- `layoutAgents()` exportada y pura: ancho de subárbol recursivo
  (`max(NODE_WIDTH, Σ hijos + gaps)`), hijos repartidos y centrados bajo el padre, `y` por nivel
  (`NODE_WIDTH` 260, `GAP_X` 40, `GAP_Y` 90, alto de fila 190+90). Huérfanos (padre inexistente) y
  ciclos se colocan como raíces extra; el árbol queda centrado en `x = 0`.
- Edges `smoothstep` con `pathOptions.borderRadius = 12`, `stroke` del color del hijo con
  `strokeOpacity 0.7`, `strokeWidth` 1.5 (2.5 si trabaja), `animated` si trabaja,
  `markerEnd: ArrowClosed` y label "delegado" (en tokens del tema) cuando el hijo está
  `working`/`waiting`.
- `fitView` con `padding: 0.2`, `minZoom 0.4`, `maxZoom 1.5`, `nodesDraggable`,
  `nodesConnectable={false}`, `deleteKeyCode={null}`, `hideAttribution`. Todo envuelto en
  `ReactFlowProvider`; re-`fitView` cuando cambia la cantidad de agentes o el ancho del contenedor
  (`ResizeObserver`, con umbral de 8px para no dispararse de más).
- Click en un nodo selecciona y abre el inspector; `onPaneClick` deselecciona.
- Overlay arriba a la izquierda con el resumen ("N trabajando" en verde con pulso si > 0,
  "N esperando" en ámbar, "N inactivos" en muted). Arriba a la derecha (oculto con el inspector
  abierto) la toolbar: Ajustar vista, Centrar en el activo (deshabilitado sin agentes trabajando),
  Acercar y Alejar. Se quitó `<Controls/>`.
- `Background variant="dots" gap={20} size={1}` con el color derivado del tema.
- Sin agentes: `EmptyState` con CTA "Crear un agente" → `openSettings("agents")`.

**3. Inspector (`src/components/shell/AgentInspector.tsx`, nuevo)**
Panel de 360px `absolute right-3 top-3 bottom-3` dentro del área del grafo, `bg-card border
rounded-xl shadow-lg`, con botón de cerrar. Cabecera con avatar/nombre/provider/rol/estado; aviso
si falta el CLI; "Último error" si lo hay; "Tarea actual" completa (`whitespace-pre-wrap`);
`RunActivity` del run en curso bajo "Actividad en vivo" si está trabajando, y si no las últimas 3
tareas del agente en el proyecto (hora, estado, prompt truncado y "Ver" → `RunDetailDialog` de ese
run). Abajo, las mismas acciones con texto más "Reiniciar sesión" y "Editar agente". Se cierra con
`Escape`; el panel lleva `data-inspector` y toma el foco al abrirse.

**4. Comportamiento compartido (`src/components/agent-actions.tsx`, nuevo)**
`useAgentActions(agent)` + `AgentActionDialogs`: estado del runtime, runs del agente en el proyecto
ordenados, y las acciones (`stopAgent`, `instructAgent` vía `InstructDialog`, `RunDetailDialog`,
chat individual, `resetSession`, `openSettings("agents")`). Lo usan el nodo y el inspector, así la
semántica no se bifurca.

**5. Tema (`src/index.css`)**
Se borraron las reglas `.dark .react-flow__*` (incluidas las de minimapa y controles, ya sin uso) y
se reemplazaron por variables `--xy-*` sobre `.react-flow` más reglas `.react-flow__background`,
`__edge-path`, `__edge.selected __edge-path`, `__edge-textbg`, `__edge-text`, `__handle`,
`__node:focus` (sin outline) y `__attribution` oculto, todas en tokens y válidas en ambos temas.

**6. Otros**
- `src/components/shell/Composer.tsx`: `Escape` ahora también ignora `[data-inspector]`.
- `PLAN.md`: sección "UI" → Jerarquía reescrita (nodo, inspector, toolbar, layout, tema).
- `src/components/__tests__/HierarchyGraph.test.ts`: 5 tests de `layoutAgents` (niveles por
  profundidad, padre centrado sobre sus hijos, subárboles hermanos sin superponerse, huérfanos y
  ciclos, roster vacío).

## Commits

| Hash | Mensaje |
| --- | --- |
| `1d3d922` | Hierarchy view: compact nodes with icon actions, side inspector and toolbar |
| `93b316b` | PLAN.md: document the new hierarchy view (node, inspector, toolbar, layout) |

## Verificación

Todo desde la raíz del repo, en `main`, sin push:

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | OK, sin errores |
| `npm test` | 8 archivos, 67 tests, todos pasan (5 nuevos) |
| `npm run build` | OK (`✓ built in 3.22s`) |
| `npm run build:cli` | OK (`✓ built in 285ms`) |

Verificación visual en `http://localhost:1420` (vite dev del usuario, transporte nulo), sembrando
estado con `window.__ais.setState`, sin persistir nada y restaurando el estado original al final:
- Árbol de 3 agentes con uno `working` (cronómetro corriendo), uno `waiting` y uno en `error`:
  nodos, badges de resumen, edge "delegado" y flechas correctos.
- Click en un nodo abre el inspector con la tarea completa y la actividad en vivo; `Escape` lo
  cierra sin detener la tarea (los estados del runtime quedaron intactos).
- Árbol de 7 agentes en 3 niveles: cada padre queda centrado sobre sus hijos y los subárboles
  hermanos no se pisan.
- Tema claro y oscuro: fondo, puntos, labels de edge y nodos correctos en ambos.
- Estado vacío (0 agentes): `EmptyState` con el CTA.

## Decisiones tomadas

- **Handles con `style` en vez de clases `!w-2 !h-2 …`**: Tailwind 4 cambió el modificador
  `!important` de prefijo a sufijo, así que las clases del plan no aplicarían. Se usó `style`
  inline con las mismas medidas y `var(--muted-foreground)`, que es equivalente y a prueba de
  versiones.
- **Archivo nuevo `src/components/agent-actions.tsx`** (no estaba en el plan): el nodo y el
  inspector comparten seis acciones y dos diálogos; duplicarlas era el camino seguro a que se
  desincronizaran. No toca `src/lib/*`.
- **Contador "inactivos"**: el plan nombra tres badges (trabajando / esperando / inactivos), así
  que `stopped` y `error` se cuentan como inactivos. El estado real igual se ve en el nodo.
- **Layout tras arrastrar un nodo**: al cambiar la lista de agentes se recalculan las posiciones
  (se pierde el arrastre manual). Es lo conservador: si no, un agente nuevo quedaría encima de
  otro. Entre cambios de roster el arrastre se mantiene.
- **`selected` lo maneja React Flow** (vía `useNodesState`/`onNodesChange`); el grafo solo guarda
  `selectedAgentId` para el inspector y limpia la selección al cerrarlo o al clickear el fondo.
- **Escape con el foco fuera del inspector**: el panel toma el foco al abrirse, así que `Escape`
  llega desde `[data-inspector]` y el `Composer` lo ignora. Si el usuario mueve el foco a otro
  lado (por ejemplo al canvas) y hay algo corriendo, `Escape` cierra el inspector y además detiene
  la tarea, como antes de este cambio. Se dejó así porque el plan pedía exactamente el selector
  ignorado y no un cambio de semántica del `Composer`.
- **Color de fondo de los puntos**: en vez de calcular `--border` con `tokenColor()` (que habría
  que recalcular al cambiar de tema) se sobreescribe la variable
  `--xy-background-pattern-dots-color-default` en CSS, así sigue al tema sola.

## Pendientes o dudas

- Fuera de alcance por el plan y sin hacer: editar la jerarquía arrastrando edges.
- El badge de resumen dice "1 inactivos" en singular; se respetó el texto literal del plan
  (`"{n} inactivos"`). Si molesta, es un cambio de una línea en `CountBadge`.
- La consola del dev server del usuario muestra un error viejo de HMR
  (`Failed to reload /src/components/HierarchyGraph.tsx`) de cuando `AgentInspector.tsx` todavía no
  existía; tras recargar la página no se reproduce y `npm run build` pasa limpio.
- No se corrió `cargo check` (no se tocó `src-tauri/`) ni `npm run tauri dev` (puerto ocupado).
