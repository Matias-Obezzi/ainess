# Uso y costo por corrida, agente y proyecto

Repo: C:\Users\matia\Desktop\projects\ais-wt-usage (worktree, rama `feat/usage`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

Los tres CLIs ya informan cuánto costó cada corrida y la app lo tira a la basura. Queremos
guardarlo y mostrarlo: cuánto salió una tarea, cuánto lleva gastado cada agente y cuánto va el
proyecto en el día y en el mes.

## Contexto

Leé `PLAN.md` antes de empezar.

- `src/lib/providers.ts` parsea la salida de cada CLI y devuelve `ParsedEvent[]` (tipo en
  `src/types.ts`). Hoy el evento `result` se queda solo con el texto:
  - **Claude Code**: la línea `{"type":"result", …}` trae `total_cost_usd`, `num_turns`,
    `duration_ms` y un objeto `usage` con `input_tokens`, `output_tokens`,
    `cache_read_input_tokens` y `cache_creation_input_tokens`.
  - **Antigravity**: el evento `{"event":"result","result":{…}}` trae `usage` (mirá qué campos
    llegan de verdad; si no hay tokens, guardá lo que haya).
  - **Copilot**: `{"type":"result", …, "usage":{ "premiumRequests": n, "sessionDurationMs": ms }}`.
- `src/lib/orchestrator.ts` recibe los eventos en `handleOutput` y cierra la corrida en `handleExit`.
- `Run` (en `src/types.ts`) es lo que se persiste por proyecto en `src/lib/history.ts`.
- Ya existe `QuotaRing` y `summarizeAgentQuota` para lo de cuota: **esto es otra cosa**, es gasto
  histórico, no lo mezcles.

## Cambios

### 1. Modelo

```ts
/** What one run consumed, as reported by its CLI. Every field is optional: each one reports less. */
export interface RunUsage {
  /** Dólares, cuando el proveedor lo informa (hoy solo Claude Code). */
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  /** Turnos del modelo dentro de la corrida. */
  turns?: number;
  /** Duración que informa el propio CLI, en ms (puede diferir de la nuestra). */
  durationMs?: number;
  /** Copilot cuenta pedidos premium en vez de tokens. */
  premiumRequests?: number;
}
```

`Run` suma `usage?: RunUsage`. `ParsedEvent` de tipo `result` suma `usage?: RunUsage`.

### 2. Parseo

En `providers.ts`, cada `parse*Line` completa `usage` en su evento `result`. Escribí una función
pura por proveedor y **testeala** con líneas reales de ejemplo (las de arriba). Campos que no vengan
quedan sin definir; nunca inventes ceros.

### 3. Guardado

El orquestador copia `usage` al `Run` cuando llega el `result`. `history.ts` ya persiste los runs,
así que con eso queda guardado; verificá que sobrevive la ida y vuelta a disco.

### 4. Agregación (`src/lib/usage.ts`, puro y testeado)

```ts
export interface UsageTotals {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  premiumRequests: number;
  runs: number;
  /** Cuántas corridas del conjunto no informaron nada. */
  unreported: number;
}

export function totalsOf(runs: Run[]): UsageTotals;
export function totalsByAgent(runs: Run[]): Record<string, UsageTotals>;
/** Agrupado por día local, ordenado de más viejo a más nuevo. */
export function totalsByDay(runs: Run[], days: number, now?: number): Array<{ day: string; totals: UsageTotals }>;
/** "US$ 0,42", "1,2k tokens", "3 pedidos premium": formato corto para las tarjetas. */
export function formatUsage(totals: UsageTotals, locale: string): string;
```

### 5. Dónde se ve

1. **Burbuja de corrida** (`src/components/shell/OrchestratorThread.tsx`): junto a "Actividad (N
   pasos · m:ss)", si la corrida informó algo, agregá el costo o los tokens en la misma línea, en
   `text-muted-foreground`. Sin dato, no se muestra nada.
2. **Detalle de tarea** (`src/components/tasks/TaskDetailDialog.tsx`): una línea con lo que consumió
   la corrida asociada.
3. **Panel de uso del proyecto**: una vista nueva accesible desde la cabecera del proyecto (un botón
   junto al de la rama) que abra un diálogo "Uso" con: el total del proyecto, una tabla por agente
   (corridas, costo, tokens) y un gráfico de barras simple por día de los últimos 14 días, dibujado
   en SVG a mano (nada de librerías). Si ningún proveedor informó nada, un estado vacío que explique
   que Claude Code informa costo y Copilot pedidos premium.

Todos los textos nuevos van al diccionario, en los **siete** idiomas (`src/i18n/*.ts`), con las
mismas claves y en el mismo orden en todos. Mirá cómo está hecho antes de agregar.

## Casos borde y decisiones ya tomadas

- Un run sin `usage` no rompe nada ni cuenta como cero: se cuenta en `unreported`.
- Los montos se formatean con `Intl.NumberFormat` y el locale activo (`useLocale`).
- Nada de estimar costos por tu cuenta a partir de tokens: se muestra solo lo que el CLI dijo.
- No agregues dependencias nuevas.
- Código en inglés, UI traducida.

## Fuera de alcance

- Límites de gasto o alertas.
- Tocar `src/lib/quota.ts` más allá de lo necesario.
- Nada de push: solo commits locales.

## Verificación

```
npx tsc --noEmit
npm test
npm run build
```

Tests obligatorios: parseo de `usage` de los tres proveedores desde líneas reales, `totalsOf` con
runs mezclados (algunos sin datos), `totalsByDay` con corridas de días distintos, y paridad de claves
entre los siete diccionarios.
