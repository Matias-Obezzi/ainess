# Una sola lista de secciones, prioridad al crear una tarea, y una campanita que recuerda

Repo: C:\Users\matia\Desktop\projects\ais-wt-ui (worktree, rama `feat/ui-polish`)
Rama: la que esté activa en ese worktree. **No cambiar de rama ni crear otras.** Las dependencias ya
están instaladas (`npm install` corrido). No tocar el repo principal (`.../projects/ais`).

## Objetivo

Tres arreglos chicos e independientes de la app de escritorio:

1. **B-12** — `SearchPalette` mantiene su propia copia de la lista de secciones de Configuración. Ya
   se desincronizó una vez. Que haya **una sola** lista.
2. **B-13** — `NewTaskDialog` no deja elegir prioridad al crear la tarea; hay que crearla y después
   cambiársela desde la tarjeta.
3. **B-14** — Las notificaciones de la campanita viven sólo en memoria: al reiniciar la app la
   campanita arranca vacía y lo que pasó mientras no mirabas se pierde.

## Contexto

Leé `PLAN.md` antes de empezar (arquitectura y contratos).

### B-12 — las dos listas

- `src/components/settings/SettingsDialog.tsx:60` exporta `SETTINGS_SECTIONS: SettingsSectionDef[]`.
  Cada entrada tiene `id`, `labelKey`, `helpKey`, `group`, `optionKeys`, `icon` y además
  `component` / `actions` / `provider`, que son los componentes React de cada sección.
- `src/components/shell/SearchPalette.tsx:10` tiene su propia
  `const SETTINGS_SECTIONS: Array<{ id: SettingsSection; labelKey: string }>` con un comentario que
  dice que no la importa porque el otro archivo era de otro cambio. Ese motivo ya no existe.
- **Cuidado**: importar `SettingsDialog.tsx` desde la paleta arrastraría los componentes de las once
  secciones al bundle de la paleta. Por eso la solución no es importar y listo.
- `src/store.ts:417` tiene `VALID_SETTINGS_SECTIONS`, una **tercera** copia de los ids (usada para
  validar lo que viene persistido). Esa también sale de la lista única.

### B-13 — prioridad al crear

- `src/components/tasks/NewTaskDialog.tsx` es el diálogo.
- `TaskPriority` está en `src/types.ts:497` (`"low" | "normal" | "high"`), y `Task.priority` en
  `:507` es opcional.
- `src/components/tasks/TaskCard.tsx` ya dibuja la marca de prioridad y `TaskDetailDialog.tsx` ya la
  deja cambiar: **mirá cómo la muestran hoy y usá el mismo vocabulario visual y las mismas claves de
  i18n**, no inventes etiquetas nuevas.
- La tarea se crea con `createTask(...)` (`src/lib/tasks.ts`).

### B-14 — notificaciones que sobreviven

- `src/lib/notifications.ts` es la lógica pura (dedup, tope de `MAX_NOTIFICATIONS = 200`, flags de
  leído). No hace falta cambiarla.
- `src/store.ts:218-230` tiene el estado (`notifications`, `notificationsOpen`) y las acciones
  (`notify`, `markNotificationsRead`, `markNotificationRead`, `markApprovalNotificationsRead`,
  `dismissNotification`, `clearNotifications`, `toggleNotifications`). En `:682` arrancan en `[]`.
- **El molde a copiar es `src/lib/task-store.ts`**: persistencia por debounce colgada de una única
  suscripción al store, con `attachTaskPersistence()` / `loadTasks()` / `flushTasks()`, archivo
  bajo el directorio de config vía `getTransport()`, versión en el JSON y tope de elementos.
  `src/lib/history.ts` sigue el mismo patrón.
- Se enganchan en `src/store.ts:1773-1774`, dentro de `init()`.
- El CLI también los usa: `src/cli/main.ts` importa `flushTasks` y `flushHistory` y los llama en
  `flushAll()` antes de salir.

## Cambios

### 1. `src/components/settings/sections.ts` (archivo nuevo) — la lista única

- Mover ahí la parte **declarativa** de cada sección: `id`, `labelKey`, `helpKey`, `group`,
  `optionKeys`, `icon`, más los tipos `SettingsSectionDef` (sin los campos de componentes),
  `SettingsGroup` y el helper `options(...)`. Sin ningún import de componentes de sección: este
  módulo tiene que poder importarse desde cualquier lado sin arrastrar la UI de Configuración.
- `SettingsDialog.tsx` importa esa lista y mantiene aparte el mapeo id → `{ component, actions,
  provider }`. Que TypeScript garantice que el mapa cubre **todos** los ids (por ejemplo
  `Record<SettingsSection, SectionUI>`), así agregar una sección sin su componente no compila.
- `SearchPalette.tsx` borra su copia e importa la lista nueva.
- `store.ts` deriva `VALID_SETTINGS_SECTIONS` de la lista nueva en vez de repetir los ids a mano.
  Si eso genera un ciclo de imports (store ← sections ← store), quedate con el orden que evite el
  ciclo y dejá escrito por qué en un comentario de una línea.
- El orden de las secciones y lo que se ve en pantalla no cambian: es una refactorización.

### 2. `src/components/tasks/NewTaskDialog.tsx` — prioridad al crear

- Un selector de prioridad en el diálogo, con las tres opciones y **`normal` preseleccionada**.
- Crear con `normal` tiene que dejar la tarea exactamente como hoy (o sea: no guardar `priority`
  cuando es la de siempre, para no ensuciar el archivo con un campo que no dice nada).
- Mismas etiquetas, mismos colores y mismos iconos que ya usan `TaskCard` y `TaskDetailDialog`.
- Que se pueda operar con el teclado y que el diálogo siga cerrándose con Enter/Escape como ahora.

### 3. Persistir las notificaciones

- Archivo nuevo `src/lib/notification-store.ts`, calcado de `src/lib/task-store.ts`:
  `attachNotificationPersistence()`, `loadNotifications()`, `flushNotifications()`.
  Archivo `notifications.json` en el directorio de config (es global, no por proyecto),
  `{ version: 1, notifications: [...] }`, tope `MAX_NOTIFICATIONS`, guardado con debounce.
- Engancharlo en `init()` (`src/store.ts:~1773`) al lado de los otros dos, y cargar antes de marcar
  `loaded: true`.
- Sumar `flushNotifications()` al `flushAll()` del CLI (`src/cli/main.ts:~24`).
- Al cargar, **validar**: descartar entradas que no tengan `id`, `ts` y `kind`; recortar al tope; y
  dejarlas ordenadas de más nueva a más vieja, que es como las espera `src/lib/notifications.ts`.
- Una notificación vieja que apunta a una aprobación que ya no existe se sigue mostrando (es
  historial), pero al clickearla no tiene que romper nada: si el destino no está, no navegues.

## Casos borde y decisiones ya tomadas

- **Las notificaciones no caducan por tiempo**, sólo por el tope de 200. Nada de borrar por antigüedad.
- **Todas las notificaciones cargadas de disco arrancan con el `read` que tenían.** No las marques
  todas como leídas al iniciar: la campanita con badge al abrir la app es justamente el punto.
- **No se re-anuncia nada al iniciar** (ni notificación del sistema ni sonido): cargar de disco
  llena la lista, no dispara `notify`.
- **Un `notifications.json` corrupto o de otra versión no rompe el arranque**: se ignora y se arranca
  con la lista vacía, dejando un `log.warn`. Mirá cómo lo resuelve `task-store.ts`.
- Toda clave de i18n nueva va en **los siete** diccionarios de `src/i18n/` (es, en, pt, zh, ja, fr,
  de), en la misma posición y traducida de verdad. Hay un test de paridad de claves que lo verifica.
- **No agregues dependencias.**
- Si tocás la versión de la config, dejalo anotado bien visible en el reporte (hay otro implementador
  trabajando en paralelo en otra rama y los números se pisan).

## Fuera de alcance

- `src/remote/**` (vista del celular).
- El CLI, más allá de la línea de `flushAll()`.
- Cambiar el diseño de la Configuración, del tablero o de la barra de notificaciones: los tres
  cambios son de comportamiento, no de estética.
- El resto del backlog (`.claude/BACKLOG.md`).

## Verificación

Todo desde la raíz del worktree (`C:\Users\matia\Desktop\projects\ais-wt-ui`):

```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
cd src-tauri && cargo check
```

Tests obligatorios (vitest, junto a los que ya hay en `src/lib/__tests__/`):

- Secciones: que la lista única tenga los once ids esperados, sin repetidos, y que el mapa de
  componentes de `SettingsDialog` los cubra a todos.
- Prioridad: crear con `normal` no escribe `priority`; crear con `high`/`low` sí.
- Persistencia de notificaciones: serializar y volver a leer conserva el orden y los flags de leído;
  un archivo con basura adentro devuelve lista vacía sin tirar excepción; una lista más larga que el
  tope se recorta a las 200 más nuevas; entradas sin `id`/`ts`/`kind` se descartan.

Verificación visual en el navegador (`npm run dev`, y si 1420 está ocupado usá otro puerto y apagalo
al terminar): que Ctrl+K encuentre las secciones de Configuración por nombre, que el diálogo de
tarea nueva muestre el selector de prioridad y que la tarjeta creada la refleje. Anotá en el reporte
qué pudiste ver y qué no (el diálogo de proyecto necesita el selector nativo de Tauri, así que hay
caminos que en el navegador no se pueden recorrer).

## Al terminar

Commits chicos y con mensaje descriptivo en inglés, en imperativo y explicando el *por qué*, con el
estilo de los que ya están en el log (`git log --oneline -10`). **No hagas `git push`.** Escribí el
reporte en `.claude/handoff/039-pulido-ui.report.md`: qué cambiaste, qué commits, la tabla de
verificación con el resultado real de cada comando, las decisiones que tomaste donde el plan dejaba
margen, y qué quedó pendiente o dudoso.
