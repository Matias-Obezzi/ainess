# 035 — Uso y costo por corrida, agente y proyecto

Repo: `C:\Users\matia\Desktop\projects\ais-wt-usage` (worktree, rama `feat/usage`)

## Qué se hizo

**Modelo (`src/types.ts`)**
- `RunUsage` con todos los campos opcionales (`costUsd`, `inputTokens`, `outputTokens`,
  `cachedInputTokens`, `turns`, `durationMs`, `premiumRequests`).
- `Run` suma `usage?: RunUsage`; el `ParsedEvent` de tipo `result` también.

**Parseo (`src/lib/providers.ts`)**
- Tres funciones puras exportadas: `claudeUsage`, `antigravityUsage`, `copilotUsage`, más dos
  helpers (`num`, `compactUsage`) que descartan lo que no vino como número finito: un campo ausente
  nunca se convierte en cero.
- Claude Code: `total_cost_usd`, `num_turns`, `duration_ms` y `usage.*`; los dos contadores de caché
  (`cache_read_input_tokens` + `cache_creation_input_tokens`) se suman en `cachedInputTokens`.
- Antigravity: lee `result.usage` aceptando las distintas grafías (`input_tokens`/`inputTokens`/
  `prompt_tokens`, etc.); sin objeto `usage`, la corrida simplemente queda sin datos.
- Copilot: `usage.premiumRequests` y `usage.sessionDurationMs`. Su evento `result` no trae texto, así
  que ahora emite `session` + un `result` vacío que solo transporta el `usage` (solo cuando hay uno,
  para no cambiar el comportamiento existente).

**Guardado (`src/lib/orchestrator.ts`)**
- Al llegar el `result` se copia `usage` al `Run` y el texto solo se pisa si el evento trae algo
  (antes Copilot habría borrado la respuesta reconstruida). `history.ts` persiste el `Run` entero,
  así que el `usage` viaja a disco sin tocar nada más.

**Agregación (`src/lib/usage.ts`, nuevo, puro)**
- `totalsOf`, `totalsByAgent`, `totalsByDay(runs, days, now?)`, `formatUsage`, más `hasUsage`,
  `dayKey`, `formatCost`, `formatCompact`, `totalTokens`, `runsOfProject`, `emptyTotals`.
- `totalsByDay` devuelve toda la ventana (días vacíos incluidos), por día **local**, del más viejo
  al más nuevo.

**Dónde se ve**
1. Burbuja de corrida (`src/components/shell/OrchestratorThread.tsx`): el costo/tokens va en la
   misma línea que "Actividad (N pasos · m:ss)", en `text-muted-foreground`. Si la corrida no
   informó nada, no se muestra nada; si informó pero no hubo pasos, la línea aparece igual.
2. Detalle de tarea (`src/components/tasks/TaskDetailDialog.tsx`): línea "Consumo: …" debajo del id
   de la corrida asociada.
3. Panel de uso (`src/components/UsageDialog.tsx`, nuevo): botón "Uso" en la cabecera del proyecto,
   al lado del de la rama. Diálogo con tres tarjetas (total del proyecto, hoy, este mes), un gráfico
   de barras SVG hecho a mano de los últimos 14 días y una tabla por agente (corridas, costo,
   tokens, premium). Sin ningún dato informado, `EmptyState` que explica que Claude Code informa
   costo y Copilot pedidos premium. Sin dependencias nuevas.

**i18n**: 25 claves nuevas (`usage.*`) en los siete diccionarios, mismas claves y mismo orden.

## Commits

- `618560e` Keep what every run cost, as its CLI reported it (modelo, parseo, orquestador,
  `usage.ts`, i18n, tests)
- `89dbce0` Show what a run, an agent and the project spent (UI: panel, burbuja, detalle de tarea,
  test de orden del diccionario)

Sin push, como pedía el plan.

## Verificación

- `npx tsc --noEmit` → sin errores.
- `npm test` → 19 archivos, 216 tests, todo verde. Nuevos: `src/lib/__tests__/usage.test.ts`
  (totales con corridas mezcladas y sin datos, por agente, por día con corridas de días distintos y
  fuera de ventana, formateo, ida y vuelta a JSON del `Run` con `usage`) y el bloque
  "usage reported by each CLI" en `providers.test.ts` (líneas reales de los tres CLIs).
- `npm run build` → ok (app + remote).
- Paridad de los siete diccionarios: verificada con un script (`grep` de claves + `diff` contra el
  español, cero diferencias en clave **y** orden) y ahora también con un test permanente en
  `i18n.test.ts` ("lists the keys in the same order as Spanish").

## Decisiones

- **`unreported`**: una corrida cuenta como "sin datos" cuando no informó ninguno de los campos que
  suman (costo, tokens, premium). `turns` y `durationMs` solos no alcanzan, porque no aportan a
  ningún total visible.
- **Tokens mostrados** = entrada + salida + caché, en formato corto propio ("1,2k", "3,4M") con los
  separadores del locale, en vez de `notation: "compact"` (que en español escribe "1,2 mil").
- **`formatUsage(totals, locale, labels?)`**: se respetó la firma del plan y se agregó un tercer
  parámetro opcional con los sustantivos ("tokens", "premium") para que la UI los pase traducidos;
  el default es el español base, así `formatUsage(t, locale)` sigue funcionando.
- **Antigravity**: no había ninguna corrida real a mano para ver la forma exacta de `usage`, así que
  el parser acepta todas las grafías razonables y descarta lo que no sea número. Si el agy instalado
  no informa nada, esas corridas quedan en `unreported` sin romper nada.
- **Gráfico**: dibuja una sola magnitud, la que el proyecto realmente tenga (costo → tokens →
  premium, en ese orden), para no inventar ejes vacíos.
- **Copilot**: el `result` sigue sin pisar la respuesta reconstruida (`ev.text || r.output`).

## Pendientes

- No se pudo hacer la verificación visual en el navegador: el campo de carpeta del diálogo de
  proyecto se llena con el selector nativo de Tauri, así que en el preview web no se puede crear un
  proyecto y llegar a la cabecera. (El puerto 1420 además estaba ocupado por el dev server de otro
  implementador; se usó el 1431 y se apagó al terminar.) La app compila y todos los tests pasan,
  pero el panel conviene mirarlo una vez con `npm run tauri dev` y datos reales.
- El CLI (`src/cli/main.ts`) sigue sin mostrar uso: quedaba fuera del alcance del plan.
