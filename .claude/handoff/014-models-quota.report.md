# Informe: Modelos y cuota por proveedor + panel de Agentes

Repo: `C:\Users\matia\Desktop\projects\ais-wt-quota` (worktree, rama `feat/agent-quota`).

## Qué se hizo

1. **Tipos** (`src/types.ts`): `ModelInfo`, `QuotaItem`, `ProviderQuota`.
2. **Transport** (`src/lib/transport.ts` + las 3 implementaciones + Rust): agregado
   `httpGet(url, headers)` y `readHomeFile(relativePath)` (solo lectura, relativo al home,
   rechaza `..`). Rust: `http_get` en `http.rs` (mismo timeout de 15s que `http_post`),
   `read_home_file` en `config.rs` (usa el crate `dirs`, ya presente en `Cargo.toml`), ambos
   registrados en `lib.rs`.
3. **`src/lib/providers.ts`**: cada `ProviderSpec` tiene ahora `models: ModelInfo[]` (se
   mantiene `defaultModels: string[]` para no romper `PresetDialog`/`PromptPanel`/orchestrator).
   Listas de modelos ampliadas para `claude` (+ ids concretos de `claude-sonnet-5` etc.) y
   `copilot` (los 25 modelos documentados en el plan).
4. **`src/lib/quota.ts`** (nuevo): `listModels`, `fetchQuota`, `recordAntigravityOutcome`,
   `antigravityQuota`, y los helpers puros `parseAgyModels`, `parseResetDuration`, `poolOf`,
   `copilotQuotaFromJson`, `claudeQuotaFromJson`, más `formatResetsAt`/`formatQuotaLine`
   (formato compartido por la UI y el CLI). Antigravity: cuota inferida de runs, persistida en
   `quota/antigravity.json`. Copilot: token vía `gh auth token` + `GET
   api.github.com/copilot_internal/user`. Claude Code: token en
   `~/.claude/.credentials.json` + `GET api.anthropic.com/api/oauth/usage`.
5. **Store** (`src/store.ts`): estado `models`/`quota`, acciones `refreshModels`,
   `refreshQuota`, `loadQuotaMarks` (se llama en `init()`, solo lee el archivo local de marcas,
   no pega a ninguna API). `detectBinaries()` ahora devuelve `{ found, missing }`.
6. **Orquestador** (`src/lib/orchestrator.ts`): `handleExit` llama a
   `recordAntigravityOutcome(run.model ?? agent.model, output + últimas 20 rawLines, status ===
   "done")` cuando el agente es `antigravity` y el run no fue matado por el usuario.
7. **`AgentDialog.tsx`**: campo Modelo → `Select` con "Por defecto del proveedor" + los modelos
   reales del proveedor (label + id si difieren, y sufijo de cuota si aplica) + "Otro…" (Input
   libre). Al abrir el diálogo o cambiar de proveedor se disparan `refreshModels`/`refreshQuota`.
   Card "Cuota de {label}" con botón Actualizar (spinner), barra de progreso por ítem, fila por
   pool para antigravity, mensaje de `unavailable`/`error`. Sección "Ejecutable" (ruta detectada,
   "Cargar a mano" con el selector de archivo, "Limpiar override"), reemplaza al `OverrideDialog`
   que vivía en `AgentsPanel`.
8. **`AgentsPanel.tsx`**: eliminada la sección "IAs detectadas" y el `OverrideDialog`. Cabecera
   "Agentes" con botones "Autodetectar" (corre `detectBinaries()` y muestra un `toast` con el
   resumen) y "Nuevo agente" (antes "Nuevo agente custom"). Cada card muestra, si hay cuota
   global cargada, una línea "Cuota: X% disponible" y un badge rojo "Sin cuota hasta HH:MM" si el
   modelo del agente está agotado (antigravity).
9. **CLI** (`src/cli/main.ts`): subcomando `ais quota [provider] [--json]`. Sin argumento
   recorre los providers usados por algún agente configurado; imprime una línea de texto por
   provider con `formatQuotaLine`, o el JSON completo con `--json`. Agregado a `KNOWN` y a la
   ayuda.
10. **Tests** (`src/lib/__tests__/quota.test.ts`): 12 casos cubriendo `parseAgyModels`,
    `parseResetDuration`, `poolOf`, `copilotQuotaFromJson`, `claudeQuotaFromJson`.
11. **`PLAN.md`**: nueva sección "Modelos y cuota" con las fuentes de datos, endpoints, headers
    y el mecanismo de inferencia de Antigravity; actualizada la descripción del store y del panel
    "Agentes".

## Commits

- `1cee523` Add httpGet/readHomeFile transport methods and ModelInfo/QuotaItem types
- `a404a2a` Add models/quota lookups (quota.ts), store actions, and antigravity outcome tracking
- `a9af1fb` Add quota.ts unit tests
- `0d3a99c` AgentDialog: model select with quota, executable override; AgentsPanel: drop detected-CLIs section, add Autodetectar
- `f7b9328` CLI: add 'ais quota [provider] [--json]' subcommand
- `bd5538e` PLAN.md: document models/quota data sources and update Agentes panel description

No se hizo `git push` (fuera de alcance según las reglas del handoff).

## Verificación

- `npx tsc --noEmit` → sin errores.
- `npm test` → 3 archivos, 31 tests, todos verdes (incluye los 12 nuevos de `quota.test.ts`).
- `npm run build` → build de Vite ok (los warnings de `INEFFECTIVE_DYNAMIC_IMPORT` y de chunk
  grande son preexistentes, no introducidos por este cambio).
- `npm run build:cli` → ok, genera `dist-cli/ais.js`.
- `cd src-tauri && cargo check` → ok (`Finished dev profile`), sin warnings nuevos.
- A mano: `node bin/ais.js quota` en esta máquina imprimió cuota real de `claude` (ventanas de 5h
  y semana) y `copilot` (Premium requests, Chat, Completions) y el estado de los 3 pools de
  `antigravity` (todos "ilimitado" porque no hay marcas de agotamiento persistidas). `node
  bin/ais.js quota copilot --json` devolvió el JSON esperado. `node bin/ais.js --help` muestra el
  subcomando `quota` documentado.

## Decisiones tomadas

- **Labels de modelos**: para los proveedores con lista fija (`claude`, `copilot`, `antigravity`
  por defecto) no había etiquetas legibles documentadas más allá del id, así que `ModelInfo.label
  === ModelInfo.id` en esos casos (el `Select` no muestra un id duplicado entre paréntesis si
  label === id). Antigravity sí trae labels reales cuando `agy models` responde.
- **`loadQuotaMarks()` en `init()`**: solo lee el archivo local `quota/antigravity.json`; si no
  hay marcas persistidas no dispara ningún refresh de red, respetando la regla "no llamar a
  `refreshQuota` automáticamente al arrancar". Si sí hay marcas, se recalcula el estado en memoria
  para reflejar pools ya liberados por el paso del tiempo (sin red).
- **`detectBinaries()` cambia de firma** (ahora devuelve `{found, missing}` en vez de `void`).
  Revisé todos los call-sites (`store.ts` init, `AgentDialog.tsx`, `AgentsPanel.tsx`, CLI): los
  que ignoraban el retorno siguen compilando igual (TS permite descartar un valor de retorno).
- **`AgentsPanel` ya no permite crear un agente con un click desde "IAs detectadas"**: esa acción
  vivía en la sección eliminada. Ahora crear un agente para un provider detectado se hace con
  "Nuevo agente" y eligiendo el provider en el diálogo (que ya trae el ejecutable detectado y
  permite cargar uno a mano ahí mismo), tal como pide el punto 2 del objetivo.
- **CLI `ais quota` sin argumento**: usa los providers de los agentes configurados (no todos los
  providers existentes), para no pegarle a APIs de proveedores que el usuario ni usa.

## Pendientes o dudas

- No pude probar `agy models` en esta máquina (no hay agente antigravity con binario configurado
  en el entorno de la tarea), así que `listModels("antigravity", …)` solo se validó por unit test
  (`parseAgyModels`) y por el fallback a la lista fija; el camino feliz con el CLI real de agy no
  se ejecutó end-to-end.
- Al correr `node bin/ais.js --help` (y algún otro subcomando) aparece en stderr `Assertion
  failed: !(handle->flags & UV_HANDLE_CLOSING) ... src\win\async.c` justo antes de salir. Es un
  detalle de libuv/Node en Windows al cerrar el proceso, preexistente y no relacionado con este
  cambio (aparece incluso en rutas que no tocan `quota.ts`); no lo toqué por estar fuera de
  alcance del plan.
- No se agregaron tests de componente para `AgentDialog`/`AgentsPanel` (el repo no tiene tests de
  React ya escritos como precedente; seguí el patrón existente de tests unitarios de lógica pura
  en `src/lib/__tests__`).
