# Modelos disponibles y cuota restante por proveedor en el editor de agentes; panel de Agentes sin la lista de IAs

Repo: C:\Users\matia\Desktop\projects\ais-wt-quota (worktree del repo, rama `feat/agent-quota`)
Rama: `feat/agent-quota` (ya está activa en ese directorio; no cambiar de rama ni crear otras)

## Objetivo
1. Al editar/crear un agente, el diálogo muestra los modelos que tiene su proveedor (lista real, no un
   datalist a ciegas) y la cuota que queda, por modelo cuando el proveedor la da por modelo y global cuando
   no, con botón "Actualizar".
2. El panel de Agentes ya no muestra la sección "IAs detectadas": solo las cards de agentes, y al lado de
   "Nuevo agente custom" un botón "Autodetectar" que vuelve a detectar los CLIs y muestra un resumen en toast.
   La carga manual de un ejecutable pasa a estar dentro del diálogo del agente.
3. Nuevo comando `ais quota [provider]` en el CLI.

## Contexto
Leer `PLAN.md` y `CLAUDE.md` antes de empezar. Stack: Tauri 2 + React 19 + TS estricto (`noUnusedLocals`)
+ Tailwind 4 + shadcn (`src/components/ui`) + zustand (`src/store.ts`) + vitest (`npm test`).
UI en español, código en inglés. `node_modules` del worktree es un junction al del repo principal: no correr
`npm install`.

Cómo está hoy:
- `src/components/AgentsPanel.tsx`: sección "IAs detectadas" (por proveedor: ruta/versión, "Crear agente",
  "Cargar a mano" → `OverrideDialog` que guarda `config.binaryOverrides[provider]` y llama
  `detectBinaries()`, "Limpiar override") + sección "Agentes" con cards y "Nuevo agente custom".
- `src/components/AgentDialog.tsx`: campo Modelo = `<Input list="default-models">` con
  `PROVIDERS[provider].defaultModels`.
- `src/lib/providers.ts`: `PROVIDERS[id].defaultModels` (claude: sonnet/opus/haiku; antigravity: lista fija;
  copilot: ["auto","claude-sonnet-5"]; otros vacío).
- `src/store.ts`: `binaries: Binaries` (`{[provider]: {path, version} | null}`), `detectBinaries()`
  (aplica `binaryOverrides` y verifica `--version` con `getTransport().exec`).
- `src/lib/transport.ts`: interfaz `Transport` con `exec(program, args, cwd?)`, `httpPost(url, body,
  headers)`, `readTextFile/writeTextFile(relativePath)` (relativo a `%APPDATA%\com.matias.ais\`).
  Implementaciones: `transport-tauri.ts` (invoke a comandos Rust), `transport-node.ts` (CLI),
  `transport-null.ts` (preview en browser). Rust: `src-tauri/src/http.rs` (`http_post` con reqwest),
  registrado en `src-tauri/src/lib.rs` (`invoke_handler`).
- `src/lib/orchestrator.ts` `handleOutput`: los `ParsedEvent` de tipo `error` se agregan como mensajes
  kind `error`; `handleExit` marca el run `error`. Antigravity devuelve, cuando se queda sin cuota, un texto
  como: `ERROR Individual quota reached. Please upgrade your subscription to increase your limits. Resets in
  1h45m26s.` (aparece en el `result`/`error` del run, ver `parseAntigravityLine`). La cuota de Antigravity es
  por familia de modelo: los `gemini-*` comparten un pool, los `claude-*` otro, `gpt-oss-*` otro.
- CLI `src/cli/main.ts`: subcomandos en el set `KNOWN` (línea ~64); `detect` está en la línea ~73 como
  ejemplo de subcomando que lee `store.binaries`.

Fuentes de datos investigadas (ya probadas en esta máquina, usar exactamente esto):
- **Antigravity modelos**: `agy models` imprime una línea "Fetching available models..." y luego una línea
  por modelo `id<TAB>etiqueta` (ej. `claude-opus-4-6-thinking	Claude Opus 4.6 (Thinking)`). Ejecutar con
  `getTransport().exec(binaries.antigravity.path, ["models"])` y parsear stdout (ignorar líneas sin tab).
- **Antigravity cuota**: no hay comando. Se infiere de los errores de los runs: cuando un run de proveedor
  antigravity termina con texto que matchea `/quota reached.*?Resets in\s+((?:\d+h)?(?:\d+m)?(?:\d+s)?)/i`,
  se registra `exhaustedUntil = now + duración` para el pool del modelo usado (`run.model ?? agent.model ??
  "gemini"`; pool = "gemini" si empieza con `gemini`, "claude" si empieza con `claude`, si no el id hasta el
  primer guion). Persistir en `quota/antigravity.json` vía `writeTextFile` (`{ pools: { [pool]: { exhaustedUntil,
  lastError } } }`) y cargar en `runInit`. Un run exitoso del pool borra la marca.
- **Copilot modelos**: lista fija en `providers.ts` (`copilot help config` la documenta): `auto`,
  `claude-sonnet-5`, `claude-fable-5.1`, `claude-fable-5`, `claude-opus-5`, `claude-opus-4.8`,
  `claude-opus-4.8-fast`, `claude-opus-4.7`, `claude-sonnet-4.6`, `claude-haiku-4.5`, `gpt-5.6-sol`,
  `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5-mini`,
  `mai-code-1.1-flash`, `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`,
  `grok-4.5`, `kimi-k3`.
- **Copilot cuota** (global, no por modelo): token de GitHub con `exec("gh", ["auth", "token"])` (si `gh` no
  está o falla → estado "unavailable" con mensaje "Instalá GitHub CLI (gh) e iniciá sesión con `gh auth
  login`"). Luego `GET https://api.github.com/copilot_internal/user` con headers `Authorization: token <t>`,
  `Accept: application/json`, `User-Agent: AIS`. Respuesta: `copilot_plan`, `quota_reset_date` ("2026-10-01"),
  `quota_snapshots.premium_interactions` = `{ entitlement: 1500, remaining: 1383, percent_remaining: 92.2,
  unlimited: false }` (también `chat` y `completions`, normalmente `unlimited: true`). Mostrar "Premium
  requests: 1383 / 1500 (92%) · se renueva el 2026-10-01"; los ilimitados como "Chat: ilimitado".
- **Claude Code cuota** (global por cuenta, con ventanas): token en `~/.claude/.credentials.json` →
  `claudeAiOauth.accessToken` (también `subscriptionType`, `expiresAt`). Leer el archivo con Node `fs` en el
  transport node y con un comando Rust nuevo en Tauri (ver abajo). `GET https://api.anthropic.com/api/oauth/usage`
  con headers `Authorization: Bearer <token>`, `anthropic-beta: oauth-2025-04-20`. Respuesta:
  `five_hour: { utilization: 9.0, resets_at: "2026-09-05T21:50:00Z" }`, `seven_day: { utilization: 42.0,
  resets_at }`, y opcionales `seven_day_opus` / `seven_day_sonnet` (null o mismo shape) → estos dos sí son por
  modelo: asociarlos a los modelos `opus` y `sonnet` de la lista. Mostrar "Ventana de 5 h: 9% usado · se
  reinicia a las HH:MM", "Semana: 42% usado · se reinicia el D/M HH:MM". Si el archivo no existe → "unavailable"
  ("Iniciá sesión en Claude Code"); si HTTP 401 → "Token vencido: abrí Claude Code para renovarlo".
- **Claude Code modelos**: lista fija: `sonnet`, `opus`, `haiku` (alias que acepta `--model`) más
  `claude-sonnet-5`, `claude-opus-5`, `claude-haiku-4-5-20251001`.
- **gemini / codex / ollama / aider / opencode / custom**: modelos = `defaultModels` (puede ser vacío, el
  campo libre sigue disponible); cuota = "unavailable" ("Este proveedor no expone su cuota").

## Cambios

### 1. Tipos (`src/types.ts`)
```ts
export interface ModelInfo { id: string; label: string; }
export interface QuotaItem {
  label: string;                 // "Premium requests", "Ventana de 5 h", "Pool Gemini"…
  model?: string;                // id de modelo (o prefijo de pool) al que aplica; sin model = global
  remaining?: number; entitlement?: number; percentRemaining?: number;
  usedPercent?: number;          // para ventanas tipo Claude
  unlimited?: boolean;
  resetsAt?: number;             // epoch ms
  note?: string;
}
export interface ProviderQuota {
  provider: ProviderId;
  status: "ok" | "unavailable" | "error";
  message?: string;
  fetchedAt: number;
  items: QuotaItem[];
}
```
`Transport` (`src/lib/transport.ts`): agregar `httpGet(url, headers): Promise<{status, body}>` y
`readHomeFile(relativePath): Promise<string | null>` (relativo al home del usuario, solo lectura; rechazar
`..`). Implementar en node (`fs`/`fetch`), tauri (comandos Rust `http_get` en `http.rs` y `read_home_file`
en `config.rs`, registrarlos en `lib.rs`), null (devuelven `{status: 0, body: ""}` / `null`).

### 2. `src/lib/quota.ts` (nuevo)
- `listModels(provider, binaries): Promise<ModelInfo[]>`: antigravity → `agy models` (cache en memoria 10 min;
  si falla, `defaultModels`); resto → lista fija de `PROVIDERS[p].models` (agregar `models: ModelInfo[]` al
  `ProviderSpec` y mantener `defaultModels` como `models.map(m => m.id)` para no romper el resto).
- `fetchQuota(provider, opts): Promise<ProviderQuota>` con las fuentes de arriba. Nunca lanza: devuelve
  `status: "error"` con mensaje legible.
- `recordAntigravityOutcome(model, text, ok)` + `antigravityQuota()` (marcas por pool, persistidas).
- Helpers puros y testeables: `parseAgyModels(stdout)`, `parseResetDuration("1h45m26s") → ms`,
  `poolOf(modelId)`, `copilotQuotaFromJson(obj)`, `claudeQuotaFromJson(obj)`.

### 3. Store (`src/store.ts`)
- Estado: `quota: Partial<Record<ProviderId, ProviderQuota>>`, `models: Partial<Record<ProviderId, ModelInfo[]>>`.
- Acciones: `refreshQuota(provider)`, `refreshModels(provider)` (ambas idempotentes, guardan en el estado),
  `loadQuotaMarks()` llamado desde `runInit`.
- `detectBinaries()` devuelve además un resumen `{ found: ProviderId[], missing: ProviderId[] }` (sin romper
  a los llamadores existentes que ignoran el retorno).

### 4. Orquestador (`src/lib/orchestrator.ts`)
En `handleExit`, si el agente es `antigravity`: llamar `recordAntigravityOutcome(run.model ?? agent.model,
run.output + "\n" + últimas 20 rawLines, status === "done")`. Cambio mínimo, sin tocar otra lógica.

### 5. `src/components/AgentDialog.tsx`
- Campo Modelo → `Select` con "Por defecto del proveedor" + un ítem por `models[provider]` (etiqueta
  `label` y, en muted, `id`), + "Otro…" que muestra un `Input` libre. Al abrir el diálogo (y al cambiar de
  proveedor) disparar `refreshModels(provider)` y `refreshQuota(provider)`.
- Bloque "Cuota" debajo del modelo (Card chica): título "Cuota de {label}", botón "Actualizar" (spinner
  mientras carga), y:
  - `status: "ok"`: cada `QuotaItem` como una fila: etiqueta, barra `Progress` (`src/components/ui/progress.tsx`)
    con `percentRemaining` (o `100 - usedPercent`), texto "1383 / 1500 (92%)" o "9% usado", "se renueva
    {fecha}". Si el ítem tiene `model`, marcar el modelo correspondiente en el Select con un sufijo
    "· 92% disponible" / "· agotado hasta HH:MM".
  - `unavailable`/`error`: texto muted con `message`.
  - Para antigravity: una fila por pool conocido ("Pool Gemini", "Pool Claude", …) con "Disponible" o
    "Agotado, se libera a las HH:MM (según el último error)"; nota "Antigravity no expone la cuota: se
    infiere de los errores de los runs".
- Sección "Ejecutable" (solo si `provider !== "custom"`): muestra la ruta detectada (`binaries[provider]`) o
  "No detectado" en rojo, botón "Cargar a mano" que abre el selector (`open` de `@tauri-apps/plugin-dialog`,
  ya usado en AgentsPanel) y guarda `binaryOverrides[provider]` + `detectBinaries()`, y "Limpiar override"
  si hay override. Mover acá el `OverrideDialog` de AgentsPanel (o su lógica).

### 6. `src/components/AgentsPanel.tsx`
- Quitar la sección "IAs detectadas" y `OverrideDialog`.
- Cabecera: título "Agentes", a la derecha botones "Autodetectar" (icono `ScanSearch` de lucide; al terminar
  `toast.success("Detectados: Claude Code, Antigravity, GitHub Copilot")` / `toast.info("No se detectó ningún
  CLI nuevo")` usando el resumen de `detectBinaries`) y "Nuevo agente custom" (renombrar a "Nuevo agente").
- Las cards quedan como están; agregar en cada card, si `quota[provider]?.status === "ok"`, una línea chica
  con el primer ítem global (ej. "Cuota: 92% disponible") y si el modelo del agente está agotado un badge
  rojo "Sin cuota hasta HH:MM".

### 7. CLI (`src/cli/main.ts`)
`ais quota [provider] [--json]`: sin argumento recorre los proveedores con agente configurado; imprime por
proveedor las filas de cuota en texto ("copilot: Premium requests 1383/1500 (92%), se renueva 2026-10-01").
Agregar "quota" al set `KNOWN` y a la ayuda.

### 8. Tests (`src/lib/__tests__/quota.test.ts`)
Cubrir `parseAgyModels`, `parseResetDuration` ("1h45m26s", "45m", "30s", basura → null), `poolOf`,
`copilotQuotaFromJson` (con el JSON de ejemplo de arriba), `claudeQuotaFromJson` (con y sin `seven_day_opus`).

### 9. `PLAN.md`
Agregar una sección "Modelos y cuota" con las fuentes de datos de arriba (endpoints, headers, archivos) y el
mecanismo de inferencia para Antigravity.

## Casos borde y decisiones ya tomadas
- Nunca loguear ni mostrar tokens. El token de GitHub y el de Claude solo viajan en el header de la request.
- Las requests HTTP tienen timeout de 15 s (reqwest ya lo tiene en `http_post`; replicar en `http_get`).
- `refreshQuota` no se llama automáticamente en el arranque (solo al abrir el diálogo, al apretar
  Actualizar y desde el CLI), para no pegarle a las APIs sin necesidad.
- Si el proveedor no tiene binario detectado, `listModels` devuelve la lista fija sin ejecutar nada.
- En el CLI no hay `@tauri-apps/plugin-dialog`: ese import ya vive en componentes, no en `src/lib`.
- Mantener compatibilidad: `PROVIDERS[p].defaultModels` sigue existiendo (lo usa `PromptPanel`/composer y
  el CLI).

## Fuera de alcance
- Cualquier archivo de `src/components/` que no sea `AgentsPanel.tsx` y `AgentDialog.tsx` (otro agente está
  reescribiendo la navegación en paralelo: no tocar `App.tsx`, `Header.tsx`, `PromptPanel.tsx`, etc.).
- Refrescar el token OAuth de Claude; página remota; protocolo de delegación.

## Verificación
Desde `C:\Users\matia\Desktop\projects\ais-wt-quota`, todo tiene que pasar:
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
cd src-tauri && cargo check
```
Y a mano: `node bin/ais.js quota` imprime la cuota de copilot y claude (en esta máquina `gh` está logueado y
existe `~/.claude/.credentials.json`) y para antigravity el estado de los pools.
