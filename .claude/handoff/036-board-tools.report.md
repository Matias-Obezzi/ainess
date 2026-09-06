# Informe — 036 Tablero: búsqueda, prioridad, archivado automático, tarea desde un mensaje y exportar

Repo: `C:\Users\matia\Desktop\projects\ais-wt-board` (worktree, rama `feat/board`). Sin push.

## Qué se hizo

### 1. Buscar y filtrar en el tablero

- `TaskFilter`, `EMPTY_TASK_FILTER`, `isFiltering` y `filterTasks` en `src/lib/tasks.ts`: filtro puro
  por texto (título + detalle, sin acentos ni mayúsculas, misma normalización que
  `SettingsDialog.tsx`) y por agente.
- `TasksView.tsx` es el dueño del filtro (estado local, no se persiste) y lo pasa al tablero y al
  grafo. Barra nueva bajo la toolbar: campo de búsqueda con lupa, select de agente ("Todos" por
  defecto), botón "Limpiar" que sólo aparece cuando hay algo filtrado, y el botón de exportar.
- `TaskBoard.tsx`: el contador de cada columna muestra `3 / 12` cuando hay filtro y el total cuando
  no. Una columna vacía por el filtro dice "Nada coincide" en vez de ofrecer crear una tarea.
- `TaskGraph.tsx`: mismo filtro, y estado vacío propio cuando el filtro no deja nada.
- Arrastrar sigue andando con el filtro puesto: `DropTarget` guarda dos índices, el que se dibuja
  (sobre las tarjetas visibles) y el que se le pasa a `moveTask` (sobre la columna entera).

### 2. Prioridad

- `TaskPriority = "low" | "normal" | "high"` y `Task.priority?` en `src/types.ts`. Sin valor =
  normal; "normal" se guarda como ausencia de valor, así una tarea vieja no se toca.
- `createTask` valida la prioridad que venga del archivo y descarta cualquier otra cosa.
- `sortColumn` pone las altas primero y entre iguales manda el `order` de siempre (con test).
- Tarjeta: una marca `ChevronsUp` ámbar a la izquierda del título, sólo en las altas.
- Detalle y menú contextual de la tarjeta: se puede cambiar la prioridad.

### 3. Archivado automático

- `config.autoArchiveDoneDays: number | null` (default `null`), versión de config **11 → 12** con su
  migración (`autoArchiveDoneDays ?? null`, no toca nada más).
- `tasksToAutoArchive(tasks, days, now)` en `src/lib/tasks.ts`: función pura, con test del límite
  justo y de tareas en otras columnas.
- `src/hooks/useAutoArchive.ts`: barre al montar el tablero de un proyecto, cada vez que cambian sus
  tarjetas y una vez por hora mientras la app está abierta. Sólo marca `archived`, nunca borra.
- Configuración → General: tarjeta "Tablero de tareas" con un select Nunca / 7 / 14 / 30 / 90 días,
  registrado también en el buscador de Configuración (`settings.option.general.autoArchive`).

### 4. Crear una tarea desde un mensaje

- `src/lib/task-from-message.ts`: título = primera línea con contenido recortada a 80 caracteres
  (`taskTitleFromText`, pura y testeada), detalle = el mensaje entero, `runId` si lo hay, agente si
  el mensaje es de un agente. Nace en `backlog` y avisa con un toast con acción "Ir al tablero".
- Enganchado en el menú contextual del hilo (`OrchestratorThread`) y del chat (`ChatThread`), con la
  misma clave `message.createTask`.

### 5. Exportar el tablero

- `boardMarkdown(tasks, labels)` en `src/lib/tasks.ts`: pura, una sección por columna, `[x]` en
  Hecho y `[ ]` en el resto, agente entre paréntesis, rama y "bloqueada por: …" después del guion.
  Saltea columnas vacías y el archivo.
- Botón "Copiar como markdown" en la barra del tablero, con `copyText` de `src/lib/clipboard.ts`.

### 6. i18n

23 claves nuevas en los **siete** diccionarios (`es en pt zh ja fr de`), con las mismas claves, los
mismos placeholders y el mismo orden. Script nuevo `scripts/check-i18n-order.mjs` que verifica
claves faltantes, sobrantes y el orden respecto de `es.ts`.

## Commits

- `2c3056d` Priority, a board filter, auto-archiving and a markdown export, as pure logic
- `27e3562` The board bar, the priority marks and a task written from a message
- `26f0703` One separator, not two, above "Crear tarea con esto"

## Verificación

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | sin errores |
| `npm test` | 18 archivos, 217 tests, todo verde (21 tests nuevos) |
| `npm run build` | ok (`tsc && vite build && build:remote`) |
| `node scripts/check-i18n-order.mjs` | 7 diccionarios, 805 claves, mismo orden |

Tests nuevos en `src/lib/__tests__/tasks.test.ts`: orden por prioridad en `sortColumn` (y que "low"
no se hunde, y que una prioridad inválida se descarta), `tasksToAutoArchive` (límite exacto, otras
columnas, ya archivadas, apagado), `filterTasks` (acentos, agente, sin resultados),
`taskTitleFromText` y `boardMarkdown` (incluido el ejemplo del plan al pie de la letra).
`store-agents.test.ts` ahora espera versión 12 y comprueba que la migración deja el archivado en
`null`.

## Decisiones

- **"low" no baja nada.** El plan dice "las bajas, nada especial", así que `sortColumn` sólo sube las
  altas: `low` y `normal` conviven por `order`. Queda como etiqueta para el que lee.
- **"Normal" se guarda como nada.** Elegir "Normal" borra el campo en vez de escribir `"normal"`,
  para que el archivo de tareas no cambie de forma cuando nadie pidió una prioridad.
- **El archivado se elige de una lista** (Nunca / 7 / 14 / 30 / 90) en vez de un campo numérico
  libre: menos ambigüedad sobre qué es un valor válido y sobre qué significa vaciarlo.
- **Justo en el límite no se archiva.** Una tarea con exactamente N días de antigüedad se considera
  fresca; recién con más se archiva. Es la opción que nunca archiva de más.
- **El botón de exportar está en la barra en las dos vistas** (tablero y grafo): copia el tablero,
  que es el mismo dato en las dos.
- **Arrastrar con filtro puesto sigue permitido**, traduciendo el índice visible al índice real de
  la columna. La alternativa (bloquear el drag mientras hay filtro) parecía más sorpresiva.
- **El menú del chat no ofrece "Crear tarea" si el chat no tiene proyecto**: no habría tablero donde
  ponerla.
- **Se quitó el separador de "Ver detalle"** en los dos menús de mensaje, porque con el ítem nuevo
  quedaban dos líneas seguidas.
- **La vista del celular (`src/remote/**`) no se tocó**, como pedía el plan; `priority` es opcional
  así que sigue leyendo el mismo archivo sin cambios.

## Pendientes

- No se probó la app corriendo (`npm run tauri dev`): la verificación fue typecheck, tests y build,
  que es lo que pedía el plan. Vale una mirada visual a la barra nueva y a la marca de prioridad.
- La versión de config saltó a 12. Si otro worktree en paralelo también sube la versión, hay que
  reconciliar los números al mergear.
- `NewTaskDialog` todavía no deja elegir prioridad al crear (el plan sólo pedía el detalle y el menú
  contextual); se cambia en dos clics desde la tarjeta.
