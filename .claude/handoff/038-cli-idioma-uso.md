# El CLI habla el idioma configurado y sabe informar el uso

Repo: C:\Users\matia\Desktop\projects\ais-wt-cli (worktree, rama `feat/cli-i18n-usage`)
Rama: la que esté activa en ese worktree. **No cambiar de rama ni crear otras.** Las dependencias ya
están instaladas (`npm install` corrido). No tocar el repo principal (`.../projects/ais`).

## Objetivo

Dos cosas, las dos en el CLI (`ais`):

1. **B-06** — Hoy `ais doctor` traduce siempre al español (`translate(es, es, …)`) y tres lugares
   formatean fechas con el locale `"es-AR"` hardcodeado, aunque el usuario tenga la app en inglés,
   japonés o alemán. El CLI tiene que resolver el idioma igual que la app: lo que dice
   `config.language`, y cuando eso es `null` lo que diga el entorno.
2. **B-07** — La app ya guarda cuánto costó cada corrida y lo muestra en `UsageDialog`, pero el CLI
   no tiene forma de verlo. Falta un subcomando `ais usage`.

## Contexto

Leé `PLAN.md` antes de empezar (arquitectura y contratos). Lo relevante:

- `src/i18n/index.ts` es toda la capa de i18n: diccionarios planos, `translate(dict, base, key, vars)`,
  `pickLanguage(candidates)`, `resolveLanguage(configured)`, `localeOf(lang)`, `dictionaries`,
  `baseDictionary` (español) y el tipo `Language`.
  Ojo: `resolveLanguage` cae en `systemLanguage()`, que lee `navigator` — en Node `navigator` no
  existe y devuelve `"es"` siempre. Por eso el CLI necesita su propio fallback.
- `src/i18n/useT.ts` es la parte de React (`useT`, `useLocale`, `translateNow`, `activeLocale`).
  Todas leen del store de zustand, y el CLI sí tiene el store cargado (`useAppStore.getState().init()`
  corre al principio de `main()`), así que `config.language` está disponible.
- `src/cli/main.ts` (1273 líneas). Puntos exactos a tocar:
  - línea ~178, `if (first === "doctor")`: hace
    `const { translate, es } = await import("@/i18n");` y
    `const t = (key, vars) => translate(es, es, key, vars);`.
  - línea ~187: `new Date().toLocaleString("es-AR", { hour12: false })` (sello del informe de doctor).
  - línea ~714: `const fmt = (ts) => new Date(ts).toLocaleString("es-AR", { hour12: false });`
    (usado por `ais history` / `ais status`).
  - línea ~878: `new Date(a.createdAt).toLocaleTimeString("es-AR", { hour12: false })`
    (`ais approvals list`).
  - línea ~67: el bloque de `--help`.
  - línea ~92: `const KNOWN = new Set([...])`, la lista de subcomandos válidos.
- `src/lib/usage.ts` ya tiene todo lo que hace falta para el punto 2, puro y sin store:
  `UsageTotals`, `emptyTotals()`, `hasUsage(usage)`, `totalsOf(runs)`, `totalsByAgent(runs)`,
  `totalsByDay(runs, days, now?)`, `dayKey(ts)`, `runsOfProject(runs, projectId)`,
  `formatCost(costUsd, locale)`, `formatCompact(value, locale)`, `totalTokens(totals)`,
  `formatUsage(totals, locale, labels?)` y el tipo `UsageLabels`. **No lo reescribas**: usalo.
- `src/lib/history.ts` expone `loadHistory(projectId)`; un proceso nuevo del CLI arranca sin runs en
  memoria, así que hay que cargarlos antes de sumar. `ais status` (línea ~717) ya hace exactamente
  eso: `for (const p of store.config.projects) await loadHistory(p.id);`.
- Los runs viven en `useAppStore.getState().runs` como `Record<string, Run>`; `Run` está en
  `src/types.ts` y su campo `usage` es `RunUsage | undefined`.
- Para elegir proyecto, el CLI ya tiene el patrón `-p <nombre>` / `-w <dir>`: mirá cómo lo resuelven
  `ais agents` (línea ~276) y `ais history` (línea ~701) y **reusá ese mismo camino**, no inventes otro.

## Cambios

### 1. `src/i18n/node.ts` (archivo nuevo) — el idioma fuera del navegador

Módulo chico y puro, sin store y sin I/O:

```ts
/** The language a CLI process runs in: what the user configured, else what the environment says. */
export function nodeLanguage(configured: Language | null | undefined, env: NodeJS.ProcessEnv): Language
```

- Si `configured` es un idioma válido, ése gana.
- Si no, mirar el entorno en este orden: `LC_ALL`, `LC_MESSAGES`, `LANG`, `LANGUAGE`. Cada valor
  puede venir como `es_AR.UTF-8`, `en-US`, `ja_JP`, `C`, `POSIX` o vacío. Normalizá (cortar en `.` y
  en `@`, cambiar `_` por `-`) y pasáselos a `pickLanguage` en ese orden.
- `C` y `POSIX` no son idiomas: no tienen que ganarle a nada, se saltean.
- Si nada matchea, `"es"` (la base de la app).
- Además exportá un helper de conveniencia:

```ts
/** `t` and locale for a CLI process, resolved once. */
export function nodeI18n(configured: Language | null | undefined, env: NodeJS.ProcessEnv): {
  lang: Language;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}
```

donde `t` es `translate(dictionaries[lang] ?? baseDictionary, baseDictionary, key, vars)` y `locale`
es `localeOf(lang)`.

### 2. `src/cli/main.ts` — usar ese idioma en todos lados

- Una sola vez, después de `await useAppStore.getState().init()`, resolvé:

```ts
const { lang, locale, t } = nodeI18n(useAppStore.getState().config.language, process.env);
```

  (import estático arriba del archivo, como los demás.)
- `doctor`: sacar el `translate(es, es, …)` y pasar el `t` de arriba a `collectDiagnostics(t, …)` y a
  `formatDiagnosticsReport(results, t, …)`.
- Reemplazar los tres `"es-AR"` (líneas ~187, ~714, ~878) por `locale`. `{ hour12: false }` se queda
  como está: es una preferencia del CLI (columnas parejas), no del idioma.

### 3. `ais usage` (subcomando nuevo en `src/cli/main.ts`)

```
ais usage [-p proyecto | -w dir] [--by agent|day] [--days N] [--json]
```

- Sin `-p` ni `-w`: **todos** los proyectos, uno por bloque, más un total general al final.
  Con `-p`/`-w`: sólo ese proyecto y sin el total general.
- Cargar el historial con `loadHistory(projectId)` antes de sumar (si no, el proceso nuevo no tiene
  runs). Los runs de un proyecto salen de `runsOfProject(state.runs, projectId)`.
- `--by agent` (default): una línea por agente que tenga uso, ordenada de mayor a menor gasto
  (`costUsd`; si ninguno informa dólares, por tokens totales). Nombre del agente vía el helper
  `agentById(...)` que ya existe; si el agente ya no está en la config, mostrar el id cortado a 8.
- `--by day`: `totalsByDay(runs, days, Date.now())` con `days` = `--days` (default **30**, mínimo 1,
  máximo 365; un valor no numérico o fuera de rango es `error(...)`, el helper que ya está).
- Formato de texto: una línea por fila, `formatUsage(totals, locale, labels)` para la parte de
  números. Los `labels` (`UsageLabels`) salen de los diccionarios; si las claves que necesitás no
  existen todavía, agregalas en **los siete** archivos de `src/i18n/` (ver más abajo).
- `--json`: un objeto
  `{ [projectId]: { name, totals, byAgent: { [agentId]: totals }, byDay: [{ day, totals }] } }`
  más `total` cuando no se filtró por proyecto. Nada de texto suelto en modo JSON.
- Un proyecto sin ningún run con uso imprime una línea diciendo que no hay datos todavía (clave
  traducida), no una tabla vacía.
- Antes de salir: `process.exit(0)`. Ese camino no modifica nada, así que no hace falta `flushAll()`
  (igual que `doctor`).
- Sumar `"usage"` a `KNOWN` y una línea al bloque de `--help`, con el mismo estilo que las de al lado.

### 4. Claves de i18n

Toda clave nueva va en **los siete** diccionarios (`es`, `en`, `pt`, `zh`, `ja`, `fr`, `de`), en la
misma posición y con el mismo orden en todos. El español es la base; traducí de verdad, no copies el
español en los otros. Prefijo `cli.usage.*`. Ya hay un test de paridad de claves entre diccionarios:
si lo rompés, el `npm test` te lo va a decir.

## Casos borde y decisiones ya tomadas

- **`hour12: false` se queda** en los tres formateos de fecha. Es alineación de columnas, no idioma.
- **El resto de los strings del CLI sigue en español plano** ("No hay aprobaciones pendientes.", los
  `Uso: ais …`, el `--help`). Traducir el CLI entero es otro plan (B-08); no lo empieces acá.
- **`nodeLanguage` no lee archivos ni el store**: recibe `configured` y `env` por parámetro, así se
  testea sin mocks.
- **`ais usage` no calcula precios**: muestra lo que los CLIs informaron. Si un proveedor no manda
  dólares (Antigravity, Copilot), esa columna simplemente no aparece para él — `formatUsage` ya
  resuelve eso, no lo dupliques.
- **Un run sin `usage` no cuenta** ni siquiera como fila vacía (`hasUsage` decide).
- **No agregues dependencias.** Todo esto sale con lo que ya hay.

## Fuera de alcance

- `src/remote/**` (vista del celular).
- Traducir los strings sueltos del CLI (B-08).
- La app de escritorio: `UsageDialog` y compañía no se tocan.
- Cambiar `src/lib/usage.ts`, salvo que necesites **agregar** algo; lo que ya existe no se reescribe.

## Verificación

Todo desde la raíz del worktree (`C:\Users\matia\Desktop\projects\ais-wt-cli`):

```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
node bin/ais.js --help
node bin/ais.js usage
node bin/ais.js usage --json
node bin/ais.js usage --by day --days 7
node bin/ais.js doctor
```

Tests obligatorios (vitest, junto a los que ya hay en `src/lib/__tests__/`):

- `nodeLanguage`: config explícita gana sobre el entorno; `LC_ALL` gana sobre `LANG`; `es_AR.UTF-8`
  → `es`; `en-US` → `en`; `ja_JP.UTF-8` → `ja`; `C` y `POSIX` → `es`; entorno vacío → `es`; un
  idioma que la app no tiene (`ru_RU`) → `es`.
- `nodeI18n`: con `lang: "en"` el `t` devuelve el string en inglés y `locale` es `"en"`; con una
  clave que no existe en inglés cae al español.
- Lo que agregues de agregación para `ais usage`, si escribís alguna función nueva: probala como
  función pura (no armes un test que ejecute el CLI entero).

Además, y esto no es opcional: **mostrá en el reporte la salida real** de `node bin/ais.js usage` y
de `node bin/ais.js doctor` corriendo con `LANG=en_US.UTF-8` y con la config en español, para que se
vea que el idioma cambia de verdad.

## Al terminar

Commits chicos y con mensaje descriptivo en inglés, en imperativo y explicando el *por qué*, con el
estilo de los que ya están en el log (`git log --oneline -10`). **No hagas `git push`.** Escribí el
reporte en `.claude/handoff/038-cli-idioma-uso.report.md`: qué cambiaste, qué commits, la tabla de
verificación con el resultado real de cada comando, las decisiones que tomaste donde el plan dejaba
margen, y qué quedó pendiente o dudoso.
