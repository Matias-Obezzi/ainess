# Una tarjeta se cierra cuando termina el trabajo, no cuando termina el proceso

Repo: C:\Users\matia\Desktop\projects\ais-wt-orch (worktree, rama `feat/run-lifecycle`)
Rama: la que esté activa en ese worktree. **No cambiar de rama ni crear otras.** Las dependencias ya
están instaladas (`npm install` corrido). No tocar el repo principal (`.../projects/ais`) ni el otro
worktree (`ais-wt-remote`), donde hay otro implementador trabajando en paralelo.

## Objetivo

Cuatro arreglos del ciclo de vida de corridas y del tablero. Los cuatro tienen id en
`.claude/BACKLOG.md`.

1. **B-03** — Una tarea delegada que a su vez delega cierra su tarjeta cuando termina *su* proceso,
   aunque sus hijos sigan trabajando.
2. **B-02 (resto)** — El tablero no se entera de lo que otro proceso (`ais`) escribió mientras la app
   está abierta. El feed sí: tiene un re-sync periódico; el tablero no.
3. **B-05** — `task.branch` nunca se llena solo, aunque el orquestador sepa perfectamente en qué rama
   corrió el agente.
4. **B-04** — Dos formaciones pueden llamarse igual, y `ais formations apply` toma la primera.

## Contexto

Leé `PLAN.md` antes de empezar (arquitectura y contratos).

### B-03 — la tarjeta que cierra antes de tiempo

- `src/lib/task-sync.ts:95` `taskOnRunFinished(run)`: si el run tiene `parentRunId`, busca su tarjeta
  y la manda a `in-review` (si el proyecto tiene revisor) o `ready`, o a `needs-you` si falló. El
  comentario ya aclara que los runs raíz se dejan en paz porque los cierra
  `taskOnRootFinished` (`:109`).
- **El problema**: `src/lib/orchestrator.ts:346`, dentro de `handleExit`, llama a
  `taskSync.taskOnRunFinished(...)` apenas se cierra el proceso, sin mirar si ese run delegó y está
  esperando a sus hijos.
- **El dato que falta ya existe**: `onRunFinished` (mismo archivo) calcula `waitingForChildren`
  (declarado en `:411`, se pone en `true` en `:427`) y lo usa en `:482` justamente para no dar por
  terminado al agente. `handleExit` llama a `onRunFinished(e.runId)` al final (`:353`), o sea que la
  respuesta se conoce unas líneas después de que la tarjeta ya se movió.
- Cuando la continuación del padre sí termina de verdad, el camino pasa por `:555-580`
  (`cancelled || round >= maxRounds`) y por el cierre normal de `onRunFinished`.

### B-02 (resto) — el tablero no se re-sincroniza

- `src/lib/task-store.ts` ya resuelve la mitad difícil: `mergeWithDisk` (línea ~104) hace un merge de
  tres vías en cada guardado — las tarjetas que sólo tenemos nosotros quedan, las que sólo están en
  el archivo se suman *si todavía no cargamos el proyecto*, y cuando las dos partes tienen la misma
  tarjeta gana el `updatedAt` más nuevo. Una tarjeta que borramos a propósito no vuelve.
- Lo que falta es el otro sentido: traer a memoria lo que escribió el otro proceso **sin** esperar a
  que nosotros guardemos. `src/lib/history.ts` ya tiene exactamente eso: `mergeFromDisk(projectId)`
  (`:133`) y `startHistorySync()` (`:94`), un `setInterval` que lo corre por proyecto. Copiá ese
  patrón; no inventes uno nuevo.

### B-05 — la rama de una tarea

- `src/lib/orchestrator.ts:50` `resolveCwd(projectId, agent, project, runId)` es el único lugar que
  sabe si un agente corre en su worktree: llama a `ensureWorktree(...)` y recibe un `AgentWorktree`
  (tipo en `src/types.ts`) que trae `path` y `branch`.
- `Task.branch` existe (`src/types.ts`), lo escribe a mano el detalle de la tarea y lo lee
  `src/lib/tasks.ts:226`.
- `task-sync.ts` tiene un `findByRun(projectId, runId)` **privado** que es como se ubica la tarjeta de
  un run.

### B-04 — formaciones con el mismo nombre

- El store guarda formaciones en `src/store.ts:1123-1127` (crear/editar: busca por `id`, si no está
  la agrega) y `:1169` (otro camino de alta). El tipo `Formation` está en `src/types.ts`.
- La UI que las crea y edita está en `src/components/settings/AgentsSection.tsx`.
- El CLI las aplica en `ais formations apply <nombre>` (`src/cli/main.ts`, ~línea 410), buscando por
  nombre: por eso dos formaciones con el mismo nombre hacen que una sea inalcanzable.

## Cambios

### 1. B-03 — no cerrar la tarjeta mientras haya hijos vivos

- Sacá la llamada a `taskSync.taskOnRunFinished(...)` de donde está (`orchestrator.ts:346`) y
  movela a donde ya se sabe si el run quedó esperando hijos, o sea dentro de `onRunFinished`, en el
  camino de `!waitingForChildren`. Un run que espera hijos **no** toca su tarjeta.
- Cuando la continuación de ese padre finalmente termina — el camino que hoy llama a
  `taskOnRootFinished` en `:580` para los raíz — el padre **no raíz** tiene que cerrar su propia
  tarjeta con `taskOnRunFinished`. Hoy ese caso no cierra nada.
- Si al padre lo detuvo el usuario o se agotaron las rondas, la tarjeta cierra igual: `needs-you`
  cuando falló o lo cancelaron, y lo de siempre (`in-review`/`ready`) cuando terminó bien. Esa
  decisión ya la sabe tomar `taskOnRunFinished` mirando `run.status`.
- El estado que ve el usuario **no** cambia para el caso simple (un agente que no delega): su tarjeta
  se sigue moviendo cuando termina.

### 2. B-02 (resto) — re-sincronizar el tablero desde disco

- En `src/lib/task-store.ts`, agregá `mergeTasksFromDisk(projectId)` y `startTaskSync()` /
  `stopTaskSync()`, calcados de `mergeFromDisk` y `startHistorySync` de `history.ts`, con el mismo
  intervalo que usa el feed (no inventes otro número: leelo de ahí).
- La regla del merge hacia memoria: lo que está en memoria manda sobre lo que está en el archivo
  cuando la tarjeta es la misma y nuestro `updatedAt` es más nuevo; una tarjeta que sólo está en el
  archivo se suma; una tarjeta que ya no está en el archivo **no** se borra de memoria (pudo haberla
  creado este proceso y todavía no guardó).
- Enganchalo en `runInit()` de `src/store.ts`, al lado de `history.startHistorySync()`.
- **No lo corras cuando hay un guardado pendiente** para ese proyecto (`dirtyProjects` /
  `timers` ya llevan esa cuenta): pisar memoria con el archivo justo antes de escribirla es la forma
  más rápida de perder una tarjeta. `history.ts:98` hace exactamente ese chequeo, copialo.

### 3. B-05 — llenar `task.branch` solo

- Exportá desde `task-sync.ts` una función chica, por ejemplo
  `taskSetBranch(projectId: string, runId: string, branch: string): void`, que ubique la tarjeta con
  el mismo `findByRun` que usan las demás y le escriba `branch` **sólo si no tenía una** (lo que el
  usuario puso a mano gana siempre).
- Llamala desde `resolveCwd` (`orchestrator.ts`) cuando `ensureWorktree` devolvió el worktree, con
  `worktree.branch`.
- Si el run no tiene tarjeta, no pasa nada: la función sale sin hacer ruido, como el resto de
  `task-sync.ts` (mirá el `guard(...)` que ya usan todas).

### 4. B-04 — nombres de formación únicos

- Al guardar una formación, si ya existe **otra** (distinto `id`) cuyo nombre coincide ignorando
  mayúsculas y espacios de los bordes, no se guarda y se avisa.
- La comparación se hace con una función pura y exportada (así se testea), del estilo
  `formationNameTaken(formations, name, exceptId?)`.
- En la UI (`AgentsSection.tsx`) el error se muestra donde el usuario está escribiendo el nombre, con
  una clave de i18n nueva; no un `alert`, no un `console.error`, y no se cierra el diálogo.
- Renombrar una formación a su propio nombre tiene que seguir funcionando (por eso el `exceptId`).

## Casos borde y decisiones ya tomadas

- **B-03 no cambia el contrato de `taskOnRootFinished`**: los runs raíz siguen cerrando por ahí.
- **Un hijo que falla no cierra la tarjeta del padre**: el padre sigue vivo y puede reintentar; su
  tarjeta cierra cuando cierra él.
- **La rama se escribe una sola vez por tarea** (B-05): si el agente vuelve a correr en otra rama, la
  tarjeta conserva la primera. Cambiarla es del usuario.
- **B-04 valida al guardar, no al escribir**: mientras se tipea no molesta.
- **Nada de dependencias nuevas.**
- Toda clave de i18n nueva va en **los siete** diccionarios de `src/i18n/` (es, en, pt, zh, ja, fr,
  de), en la misma posición y traducida de verdad. Hay un test de paridad de claves que lo verifica.
- **Si tocás la versión de la config, anotalo bien visible en el reporte**: hay otro implementador
  trabajando en paralelo en otra rama y los números se pisan.

## Fuera de alcance

- `src/remote/**` y `src/lib/remote.ts`: los está tocando el otro implementador. **No los abras.**
- El resto del backlog.
- Rehacer `mergeWithDisk`: ya funciona, sólo le falta el sentido contrario.

## Verificación

Desde la raíz del worktree (`C:\Users\matia\Desktop\projects\ais-wt-orch`):

```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
cd src-tauri && cargo check
```

Tests obligatorios (vitest, junto a los que ya hay en `src/lib/__tests__/`). **Probá las funciones
reales, importándolas del módulo: no copies la lógica dentro del archivo de test.**

- B-03: un run delegado sin hijos cierra su tarjeta al terminar; uno con un hijo corriendo **no** la
  cierra; cuando termina el último hijo y la continuación del padre cierra, la tarjeta pasa a
  `in-review`/`ready` según haya revisor; si el padre falló o lo detuvieron, a `needs-you`.
- B-02: el merge hacia memoria conserva la tarjeta que sólo está en memoria, suma la que sólo está en
  el archivo, y ante la misma tarjeta se queda con el `updatedAt` más nuevo; y no corre si el
  proyecto tiene un guardado pendiente.
- B-05: escribe la rama cuando la tarea no tenía; no la pisa cuando ya tenía una; no explota cuando
  el run no tiene tarjeta.
- B-04: detecta el duplicado ignorando mayúsculas y espacios; deja renombrar una formación a su
  propio nombre; permite un nombre libre.

## Al terminar

Commits chicos y con mensaje descriptivo en inglés, en imperativo y explicando el *por qué*, con el
estilo de los que ya están en el log (`git log --oneline -10`). **No hagas `git push`.** Escribí el
reporte en `.claude/handoff/040-ciclo-de-vida.report.md`: qué cambiaste archivo por archivo, la lista
de commits, una tabla de verificación con el resultado **real** de cada comando (no el que esperabas),
las decisiones que tomaste donde el plan dejaba margen, y qué quedó pendiente o dudoso. Si algo no
pasa, decilo con la salida del error.
