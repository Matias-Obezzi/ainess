# Informe: tablero de tareas, grafo de dependencias y home del proyecto

Repo: `C:\Users\matia\Desktop\projects\ais-wt-board`, rama `feat/task-board` (sin push).

## Qué se hizo

### Modelo y lógica (`src/types.ts`, `src/lib/tasks.ts`)

- `TaskStatus` y `Task` como pide el plan, más un campo opcional `approvalId` (ver Decisiones).
- `src/lib/tasks.ts` con todo lo puro y testeable: `createTask`, `sortColumn`, `moveTask`,
  `canStart`, `blockedBy`, `hasCycle`, `linkDependency`, `unlinkDependency`, `removeTask`,
  `layoutTaskGraph` y las constantes de tamaño del nodo. Ninguna toca el store ni el disco.

### Persistencia (`src/lib/task-store.ts`)

- Un archivo por proyecto en `tasks/<projectId>.json`, con el mismo patrón que `history.ts`:
  suscripción única al store, guardado con debounce de 500 ms, `flushTasks`, `forgetTasks`.
- Tope de 500 tareas: al pasarse se descartan primero las archivadas más viejas y después las
  más viejas en general, limpiando las referencias que quedan colgando en `dependsOn`.
- Al leer se sanea el archivo (estados inválidos, ids repetidos, dependencias a tareas que ya no
  están), así un JSON editado a mano no rompe el tablero.

### Store (`src/store.ts`)

- `tasks: Record<projectId, Task[]>` y `taskView: "board" | "graph"` (persistido en `ais.ui`
  junto con `projectMode`, que ahora acepta `"tasks"` y es el valor por defecto).
- Acciones: `loadTasks`, `addTask`, `updateTask`, `moveTask`, `removeTask`, `archiveTask`,
  `setTaskView`, `linkTaskDependency` (devuelve `false` si haría un ciclo) y
  `unlinkTaskDependency`. Selector `selectTasks`.
- Ciclo de vida: se cargan al abrir el proyecto y en `init`, se olvidan al borrarlo.

### Seguir lo que pasa de verdad (`src/lib/task-sync.ts` + `src/lib/orchestrator.ts`)

- `submitPrompt` crea la tarea raíz en `working` con la primera línea del prompt como título.
- Cada delegación crea una tarea que `dependsOn` la raíz de esa corrida: nace en `working`, o en
  `needs-you` si quedó esperando aprobación (y pasa a `working` al aprobarse).
- `handleExit` mueve la tarea de esa corrida a `in-review` si hay algún agente con rol `reviewer`,
  a `ready` si no, y a `needs-you` con el error en el detalle si falló.
- Al terminar toda la tarea del usuario, la raíz pasa a `ready` (o `needs-you` si falló).
- Todo el módulo está envuelto en try/catch: el tablero nunca puede frenar una corrida.

### UI (`src/components/tasks/`)

- `TasksView.tsx`: barra propia con el switcher chico Tablero/Grafo, el contador y "Nueva tarea".
- `TaskBoard.tsx`: seis columnas con scroll propio, encabezado con punto de color, nombre y
  contador; arrastrar y soltar entre columnas y dentro de una con los eventos nativos de HTML5
  (sin librerías), con línea de inserción; sección "Archivo" plegada al pie.
- `TaskCard.tsx`: avatar del agente, título en dos líneas, rama en monoespaciada, estado con su
  punto y tiempo relativo, chapita "Bloqueada por N", y menú de click derecho (Mover a / Asignar a
  como submenús, Archivar, Eliminar con `confirmDelete`).
- `TaskGraph.tsx`: `@xyflow/react` con el mismo look que `HierarchyGraph` (fondo punteado, sin
  marca de agua, sin minimapa, misma barra de zoom); borde del nodo según el estado, arista del
  prerrequisito hacia la tarea, `onConnect` para encadenar arrastrando (rechaza ciclos con un
  toast).
- `TaskDetailDialog.tsx`: título, rama, estado, agente, detalle en markdown con modo edición,
  dependencias (agregar y quitar), enlace a `RunDetailDialog` y botones de archivar y eliminar.
- `NewTaskDialog.tsx`: título, detalle, columna y agente.
- `ProjectScreen.tsx`: switcher de tres opciones (Tareas / Chat / Jerarquía) y el composer sólo en
  modo Chat. Abrir un proyecto desde el sidebar o el inicio entra en Tareas.

### Rendimiento

Columnas, tareas archivadas, el mapa de bloqueos y el layout del grafo se calculan con `useMemo`
sobre `tasks`; `TaskCard` está memoizado y `selectTasks` devuelve un array vacío estable.

## Commits

```
35334ee Add the task model, pure task logic and per-project persistence
11b32d7 Test the task logic and the layered graph layout
91f02bb Create and advance tasks from real orchestrator runs
c1602d6 Add the task board, dependency graph and task detail to the project screen
e63292c Flush the board to disk when the CLI exits
0021472 Keep the empty task list stable above its selector
```

## Verificación

- `npx tsc --noEmit` — sin errores.
- `npm test` — 13 archivos, 143 tests. `src/lib/__tests__/tasks.test.ts` suma 25: `moveTask`
  (reordena, renumera y clampea), `canStart`/`blockedBy`, `hasCycle` (directo, indirecto y
  diamante permitido), `linkDependency`/`unlinkDependency`, `removeTask` y el layout por capas.
- `npm run build` y `npm run build:cli` — OK.
- Prueba manual en el navegador (vite en un puerto libre, transporte nulo), con el store sembrado
  desde `window.__ais`:
  - el tablero dibuja las seis columnas, las tarjetas y el "Archivo";
  - arrastrar entre columnas y dentro de una columna reordena y renumera bien (incluido el caso de
    soltar una tarjeta más abajo en su propia columna);
  - el menú de click derecho abre con sus submenús;
  - el grafo dibuja las capas, los colores por estado y las flechas del prerrequisito a la tarea;
  - el diálogo de detalle muestra dependencias y "Bloqueada por 1 tarea sin terminar";
  - `submitPrompt` crea la tarea raíz y, al fallar la corrida (no hay CLI en el navegador), la deja
    en "Necesita tu atención" con el error en el detalle.
  - Consola sin errores (sólo el aviso de atribución de React Flow, que ya estaba).

## Decisiones tomadas

- **`approvalId` en `Task`**: el plan pide que una delegación gateada nazca en `needs-you` y pase a
  `working` al aprobarse, pero la tarea todavía no tiene `runId` para reencontrarla. Se agregó el
  campo opcional `approvalId`, que se limpia al decidirse la aprobación.
- **Delegación rechazada**: el plan no lo cubre. La tarea vuelve a `backlog` con
  "[rechazada por el usuario]" agregado al detalle, en vez de quedar trabada en `needs-you`.
- **"Algún agente con rol reviewer"**: en este código los agentes son globales, no por proyecto, así
  que se mira el roster de `config.agents`.
- **Corridas raíz vs. delegadas**: `handleExit` sólo cierra tareas de corridas con `parentRunId`.
  La tarea raíz se cierra cuando termina toda la tarea del usuario (incluidas las rondas de
  continuación), que es lo que el plan pide para ella.
- **Modo al abrir un proyecto**: `openProject(id, null)` entra en Tareas y `openProject(id, chatId)`
  en Chat; con `chatId` sin especificar (por ejemplo el botón de aprobaciones del sidebar) se
  respeta el modo actual, para no sacar al usuario de donde estaba.
- **Archivadas fuera del grafo**: el grafo sólo muestra las tareas vivas; el archivo es cosa del
  tablero.
- **Sin merge desde disco al guardar**: a diferencia de `history.ts`, `saveTasks` no re-lee el
  archivo antes de escribir. Es el último escritor el que gana por proyecto. Ver Pendientes.
- **Diálogo, no panel lateral**, para el detalle: el plan dejaba elegir y así el tablero y el grafo
  comparten exactamente la misma pantalla.

## Pendientes o dudas

- **Concurrencia app + CLI**: si la app y `ais run` tocan el mismo proyecto a la vez, el último que
  guarda pisa lo que hizo el otro desde que cargó el archivo. `history.ts` resuelve esto mergeando
  en cada guardado; para tareas haría falta decidir qué pasa con una tarea borrada en un proceso y
  presente en el archivo del otro, así que se dejó fuera. Si aparece en la práctica, es un plan
  chico aparte.
- **Sub-planificador que delega**: si una tarea delegada a su vez delega, su tarjeta pasa a
  `in-review`/`ready` cuando termina su primera corrida, no cuando terminan sus hijos. El plan pide
  explícitamente que `handleExit` sea el que mueve la tarea, así que se dejó así.
- **`branch` nunca se llena solo**: el modelo lo tiene y el detalle lo deja editar a mano, pero nada
  en el orquestador sabe hoy en qué rama trabajó un agente.
- Sin tocar `src/remote/**`, i18n ni sincronización con GitHub, como pedía el plan.
