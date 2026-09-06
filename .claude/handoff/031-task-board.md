# Tareas: tablero, grafo de dependencias y home del proyecto

Repo: C:\Users\matia\Desktop\projects\ais-wt-board (worktree, rama `feat/task-board`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

Que cada proyecto tenga un **tablero de tareas** al estilo kanban como pantalla principal, con un
**grafo de dependencias** como vista alternativa y un switcher entre las dos. Al abrir un proyecto,
eso es lo primero que se ve; el chat y la jerarquía siguen a un click.

Las tareas no son una lista decorativa: las que nacen de una delegación del planificador se crean
solas y siguen el estado real de la corrida.

## Contexto

Leé `PLAN.md` antes de empezar.

- `src/components/shell/ProjectScreen.tsx` es la pantalla del proyecto. Hoy tiene un switcher entre
  `chat` y `jerarquía` (`projectMode` en el store) y el composer abajo.
- `src/components/HierarchyGraph.tsx` ya dibuja un grafo con `@xyflow/react`, con `layoutAgents`
  para acomodar los nodos y `proOptions={{ hideAttribution: true }}`. **Leelo antes de escribir el
  grafo nuevo**: el de tareas tiene que verse hermano de ese, no de otra app.
- Persistencia: `getTransport().writeTextFile(rel, content)` / `readTextFile(rel)` guardan bajo la
  carpeta de datos de la app. `src/lib/quota.ts` y `src/lib/history.ts` son los dos ejemplos a
  seguir (history además tiene el patrón de suscribirse al store y guardar con debounce).
- Delegaciones y ciclo de vida de las corridas: `src/lib/orchestrator.ts` (`startRun`, `handleExit`,
  el bloque donde se procesan las delegaciones y donde se emiten los hooks).
- Componentes disponibles: `Card`, `Badge`, `Tooltip`, `Popover`, `EmptyState`, `Skeleton`,
  `ContextMenu` (menú de click derecho), `AgentAvatar` (`src/components/ProviderLogo.tsx`),
  `Markdown` (`src/components/shell/Markdown.tsx`), `confirmDelete` (`src/lib/confirm.ts`).

## Cambios

### 1. Modelo (`src/types.ts`)

```ts
export type TaskStatus = "backlog" | "working" | "needs-you" | "in-review" | "ready" | "done";

export interface Task {
  id: string;
  projectId: string;
  title: string;
  /** Detalle largo, en markdown. */
  detail?: string;
  status: TaskStatus;
  /** Agente a cargo. */
  agentId?: string;
  /** Tareas que tienen que terminar antes que esta. */
  dependsOn: string[];
  /** Corrida que la está ejecutando (o la ejecutó). */
  runId?: string;
  /** Rama en la que se trabaja, si se sabe. */
  branch?: string;
  createdAt: number;
  updatedAt: number;
  /** Posición dentro de su columna. */
  order: number;
  archived: boolean;
}
```

Etiquetas de las columnas, en español: Pendiente, Trabajando, Necesita tu atención, En revisión,
Listo, Hecho. Las archivadas no aparecen en el tablero salvo en la sección "Archivo".

### 2. `src/lib/tasks.ts` (lógica pura y testeada)

- `createTask(partial): Task` con valores por defecto sanos.
- `moveTask(tasks, id, status, index): Task[]` que reordena dentro de la columna y renumera `order`.
- `canStart(task, tasks): boolean` — false si alguna dependencia no está en `ready` o `done`.
- `blockedBy(task, tasks): Task[]` — las dependencias que faltan.
- `hasCycle(tasks, from, to): boolean` para no dejar crear una dependencia circular.
- `sortColumn(tasks, status): Task[]`.

### 3. Persistencia (`src/lib/task-store.ts` o dentro de `tasks.ts`, como te quede mejor)

Un archivo por proyecto: `tasks/<projectId>.json`. Cargar al abrir el proyecto, guardar con debounce
al cambiar, igual que `history.ts`. Tope de 500 tareas por proyecto; al pasarse, se descartan las
archivadas más viejas.

### 4. Store

- `tasks: Record<projectId, Task[]>` y `taskView: "board" | "graph"` (persistido con las
  preferencias de UI, como `projectMode`).
- Acciones: `loadTasks(projectId)`, `addTask(projectId, partial)`, `updateTask(id, patch)`,
  `moveTask(id, status, index)`, `removeTask(id)`, `archiveTask(id)`, `setTaskView(view)`,
  `linkTaskDependency(id, dependsOnId)` y `unlinkTaskDependency(id, dependsOnId)` (rechazando ciclos
  con `hasCycle`).

### 5. Que las tareas sigan lo que pasa de verdad

En `src/lib/orchestrator.ts`:

- Cuando el planificador delega (donde hoy se emite `emitHookEvent("delegation", …)`), creá una tarea
  en `working` con el título de la tarea delegada (primera línea, recortada), `agentId` del hijo y
  `runId` de la corrida que arranca. Si la delegación quedó esperando aprobación, la tarea nace en
  `needs-you` y pasa a `working` cuando se aprueba.
- En `handleExit`: la tarea de esa corrida pasa a `in-review` si el proyecto tiene algún agente con
  rol `reviewer`, y a `ready` si no. Si la corrida falló, pasa a `needs-you` y el detalle guarda el
  error.
- Cuando el usuario manda un prompt al orquestador (`submitPrompt`), creá una tarea raíz en
  `working` con el texto del prompt como título, y las tareas delegadas de esa corrida dependen de
  ella (`dependsOn`). Al terminar la corrida raíz, pasa a `ready`.
- Nada de esto puede romper el flujo si falla: envolvé en try/catch y seguí.

### 6. Tablero (`src/components/tasks/TaskBoard.tsx`)

- Columnas horizontales con scroll propio, encabezado con el nombre y el contador, como en un kanban.
- Tarjeta: avatar del agente, título en dos líneas como mucho, la rama en tipografía monoespaciada si
  hay, y abajo el estado con su punto de color y el tiempo relativo. Si la tarea tiene dependencias
  sin cumplir, una chapita "Bloqueada por N".
- Arrastrar y soltar entre columnas y dentro de la columna, con los eventos nativos de HTML5
  (`draggable`, `onDragStart`, `onDragOver`, `onDrop`): **no** agregues librerías.
- Click en la tarjeta abre un panel lateral o diálogo con el detalle en markdown, el agente, las
  dependencias (agregar y quitar), el run asociado (con enlace a `RunDetailDialog` si existe) y los
  botones de archivar y borrar (con `confirmDelete`).
- Click derecho en la tarjeta: mover a cada columna, asignar agente, archivar, borrar.
- Botón "Nueva tarea" en el encabezado del tablero.
- Una sección "Archivo" colapsada al pie con las archivadas.

### 7. Grafo (`src/components/tasks/TaskGraph.tsx`)

- `@xyflow/react`, mismo estilo que `HierarchyGraph`: sin marca de agua, sin minimapa, con los mismos
  tokens de color.
- Un nodo por tarea, con el color del borde según el estado y el avatar del agente; una arista por
  cada dependencia, del prerrequisito hacia la tarea.
- Layout automático por capas: las tareas sin dependencias arriba, y cada una debajo de la más
  profunda de sus dependencias. Escribí ese cálculo como función pura y testeala.
- Se pueden crear dependencias arrastrando de un nodo a otro (`onConnect`), rechazando ciclos.
- Click en un nodo abre el mismo detalle que el tablero.

### 8. Home del proyecto

- `projectMode` suma el valor `"tasks"`, y es el modo por defecto al abrir un proyecto.
- El switcher del encabezado pasa a tener tres opciones: **Tareas**, **Chat**, **Jerarquía**.
  Dentro de Tareas, un segundo switcher chico entre tablero y grafo (`taskView`).
- El composer sigue abajo en el modo Chat. En Tareas y Jerarquía no se muestra.
- Al abrir un proyecto desde el sidebar o desde el inicio, se entra en Tareas.

## Casos borde y decisiones ya tomadas

- Borrar una tarea saca su id de los `dependsOn` de las demás.
- Una tarea sin agente es válida (la escribió el usuario y todavía no la tomó nadie).
- El tablero tiene que aguantar 200 tareas sin trabarse: nada de recalcular layouts en cada render,
  usá `useMemo`.
- Los textos de la UI en español; el código y los comentarios en inglés.
- No agregues dependencias nuevas.

## Fuera de alcance

- La vista remota (`src/remote/**`).
- Sincronizar tareas con GitHub Issues o con PRs.
- i18n: no traduzcas nada, viene en otro plan.
- Nada de push: solo commits locales.

## Verificación

```
npx tsc --noEmit
npm test
npm run build
```

Tests obligatorios en `src/lib/__tests__/tasks.test.ts`: `moveTask` (reordena y renumera),
`canStart`/`blockedBy` (con dependencias sin terminar), `hasCycle` (dependencia circular rechazada) y
el layout por capas del grafo.
