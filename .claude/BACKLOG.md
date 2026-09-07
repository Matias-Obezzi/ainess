# Backlog

Lo que quedó fuera de alcance en los planes 026–037, más la deuda de verificación. Cada tarea tiene
id estable (`B-NN`), y cuando se convierte en plan de handoff se anota el número en **Plan**.

Estado: `pendiente` · `en curso` · `hecho`.

## Bugs y limitaciones reales

| Id | Tarea | Origen | Plan | Estado |
|---|---|---|---|---|
| B-01 | **Detener durante la preparación del worktree.** Apretar "Detener" mientras corre el `npm install` del setup no hace nada: la corrida arranca igual al terminar. `kill_run` sobre un run todavía no spawneado devuelve `false` y no cierra el run, así que cortar el spawn a lo bruto dejaría colgado a un padre que espera al hijo. Hay que arreglarlo dentro de `stopAgent`. | 032 | — | pendiente |
| B-02 | **Concurrencia app + CLI en el tablero.** Si la app y `ais run` tocan el mismo proyecto, el último que guarda pisa al otro. `history.ts` ya mergea en cada guardado; para tareas falta decidir qué pasa con una tarea borrada en un proceso y presente en el archivo del otro. | 031 | — | pendiente |
| B-03 | **Sub-planificador que delega.** Si una tarea delegada a su vez delega, su tarjeta pasa a `in-review`/`ready` cuando termina su primera corrida, no cuando terminan sus hijos. | 031 | — | pendiente |
| B-04 | **Formaciones con nombre duplicado.** No se valida: dos formaciones pueden llamarse igual y `ais formations apply` toma la primera que coincida. | 028 | — | pendiente |
| B-05 | **`branch` de una tarea nunca se llena solo.** El modelo lo tiene y el detalle lo deja editar a mano, pero nada en el orquestador sabe en qué rama trabajó un agente. | 031 | — | pendiente |

## CLI

| Id | Tarea | Origen | Plan | Estado |
|---|---|---|---|---|
| B-06 | **El CLI ignora el idioma configurado.** `ais doctor` traduce con `translate(es, es, …)` fijo y las fechas usan `"es-AR"` hardcodeado (`src/cli/main.ts:187`, `:714`, `:878`). Debe resolver el idioma desde `config.language` como la app. | 034 | 038 | en curso |
| B-07 | **El CLI no muestra uso.** El panel de uso que se agregó en la app (plan 035) no tiene equivalente en `ais`. | 035 | 038 | en curso |
| B-08 | **Strings del CLI sin traducir.** Más allá de `doctor`, el CLI imprime español plano ("No hay aprobaciones pendientes."). Pasarlo entero por los diccionarios es un plan grande aparte. | 034 | — | pendiente |

## Vista del celular (`src/remote/**`)

| Id | Tarea | Origen | Plan | Estado |
|---|---|---|---|---|
| B-09 | **La vista remota no muestra cuota.** Quedó fuera de alcance del plan de cuota. | 027 | — | pendiente |
| B-10 | **La vista remota no muestra diagnóstico.** La sección es sólo de escritorio. | 037 | — | pendiente |
| B-11 | **No se puede preparar un worktree desde el celular.** El transport remoto responde `null` a `readFileAbs`. | 032 | — | pendiente |

## Pulido

| Id | Tarea | Origen | Plan | Estado |
|---|---|---|---|---|
| B-12 | **Dos listas de secciones de Configuración en paralelo.** `SearchPalette.tsx` mantiene su propia copia en vez de importar `SETTINGS_SECTIONS` de `SettingsDialog.tsx`; se van a desincronizar. | 037 | 039 | en curso |
| B-13 | **`NewTaskDialog` no deja elegir prioridad al crear.** Hoy son dos clics después, desde la tarjeta. | 036 | 039 | en curso |
| B-14 | **Las notificaciones no sobreviven al reinicio.** La campanita arranca vacía y las aprobaciones pendientes se re-anuncian recién cuando algo las toca. | 029 | 039 | en curso |
| B-15 | **Refrescar la cuota al entrar a un proyecto.** El nodo y el popover leen sólo lo que hay en el store, así que arrancan sin dato hasta que alguien abra un diálogo de agente o apriete "Actualizar". | 027 | — | pendiente |

## Deuda de verificación

| Id | Tarea | Origen | Plan | Estado |
|---|---|---|---|---|
| B-16 | **Pasada manual con `npm run tauri dev`.** Los planes 026, 028, 030, 035, 036 y 037 se verificaron con typecheck, tests, build y preview web, nunca con la app compilada. A mirar: menús contextuales sobre React Flow y sobre las tarjetas de Inicio, jerarquía (agregar/duplicar/eliminar/guardar como formación), Configuración → Agentes, línea de git del sidebar y su popover, cabecera de uso, barra del tablero y marca de prioridad, Configuración → Diagnóstico. | 026–037 | — | pendiente |
