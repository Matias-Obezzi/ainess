# Autodetección de agentes, carga manual, perfil de usuario, órdenes predefinidas y elección de modelo

Repo: C:\Users\matia\Desktop\projects\ais
Rama: la activa (main), sin cambiar de rama ni crear otras

## Objetivo
1. La app y el CLI detectan las IAs instaladas y ofrecen crear agentes para ellas con un clic; si alguna no se detecta, el usuario puede cargar la ruta del ejecutable a mano.
2. El usuario puede contarle al sistema quién es y cómo quiere que trabajen (perfil), y guardar **órdenes predefinidas** (prompts reutilizables) para lanzarlas rápido.
3. El usuario puede elegir el modelo por corrida, o pedirle al orquestador (planificador) que elija el mejor modelo para cada delegación.

## Contexto
- Leer `PLAN.md`, `src/types.ts`, `src/store.ts`, `src/lib/providers.ts`, `src/lib/orchestrator.ts`, `src/lib/transport-node.ts`, `src-tauri/src/detect.rs`, `src/cli/main.ts`, `AgentsPanel.tsx`, `AgentDialog.tsx`, `PromptPanel.tsx`, `ResourcesPanel.tsx` (plan 006).
- Detección actual: `detect_binaries` (Rust) y su réplica en Node devuelven `Record<ProviderId, BinaryInfo | null>` para claude, antigravity, copilot, gemini, codex.
- Ya existe `sharedContext` (plan 006) que se inyecta en todos los prompts; el perfil se inyecta de forma parecida pero en una sección propia.

## Cambios
1. Detección ampliada y override manual:
   - Agregar providers `ollama` (`ollama run <model>` con el prompt por stdin, texto plano; `defaultModels` vacío, el modelo es obligatorio), `aider` (`aider --message "<prompt>" --yes-always [--model m]`, texto plano) y `opencode` (`opencode run "<prompt>" [--model m]`, texto plano) a `PROVIDERS`, a `ProviderId`, a la detección Rust y Node (solo PATH).
   - `AppConfig` (version 4, migración trivial): `binaryOverrides: Partial<Record<ProviderId, string>>` (ruta manual). `detectBinaries()` del store aplica los overrides por encima de lo detectado (si el override existe en disco → usarlo con `version` obtenida con `--version` vía `Transport.exec`; si no existe → marcar `{ path, version: null }` y avisar).
   - UI `AgentsPanel`: sección "IAs detectadas" arriba: una fila por provider con estado (ruta + versión / "No detectado"), botón "Crear agente" si no hay ningún agente con ese provider (crea uno con nombre = label, rol implementer, `parentId` = el planner raíz si existe, `autoApprove: true`), y botón "Cargar a mano" que abre un diálogo con `Input` de ruta + botón "Buscar…" (`open({ multiple: false, filters: [{ name: "Ejecutable", extensions: ["exe","cmd","bat"] }] })` de `@tauri-apps/plugin-dialog`) que guarda `binaryOverrides[provider]` y vuelve a detectar. Botón "Volver a detectar" ya existente.
   - CLI: `ais detect` (tabla de providers con ruta/versión), `ais detect set <provider> <ruta>`, `ais detect clear <provider>`, y `ais agents add` ya existente. `ais agents init` crea agentes para todo lo detectado que falte (idempotente).
2. Perfil de usuario y órdenes predefinidas:
   - `AppConfig`: `profile: { name: string; about: string; preferences: string }` y `presets: Array<{ id: string; name: string; prompt: string; agentId?: string; model?: string }>`.
   - Inyección en `buildSystemPrompt` (antes del contexto compartido):
     ```
     ## Sobre el usuario
     Nombre: <name>
     <about>
     Preferencias de trabajo: <preferences>
     ```
     (omitir campos vacíos; omitir la sección si todo está vacío).
   - UI: en la pestaña **Recursos** agregar sub-pestañas **Perfil** (tres campos, guardado con debounce) y **Órdenes** (lista + `PresetDialog.tsx`: nombre, prompt, agente destino opcional, modelo opcional). En `PromptPanel` un `Select`/botones "Órdenes predefinidas" que carga el prompt (y el agente/modelo si están definidos) en el formulario.
   - CLI: `ais profile show|set --name N --about "..." --preferences "..."` (o `--about-file f.md`), `ais presets list|add <nombre> --prompt "..." [--agent A] [--model M]|remove <nombre>`, y `ais run --preset <nombre> [texto extra]` (el texto extra se agrega al final del prompt del preset).
3. Elección de modelo:
   - `Run` gana `model?: string` (override efectivo). `startRun` acepta `model` y lo pasa a `buildCommand` (`input.model ?? agent.model`). `submitPrompt(text, agentId, projectId, { model? })`, `instructAgent(..., { model? })`.
   - UI `PromptPanel`: `Select` de modelo junto al agente destino: opciones = `defaultModels` del provider del agente + "Por defecto del agente" + entrada libre (un `Input` "otro…"). CLI: `--model <m>` ya definido en plan 005 para el run; asegurarse de que se propague.
   - **Auto-selección por el orquestador**: opción global `config.autoModel: boolean` (switch en Recursos > Perfil o en Agentes) y flag CLI `--auto-model`. Cuando está activa, el system prompt del planner incluye, por cada hijo, los modelos disponibles (`PROVIDERS[child.provider].defaultModels` unidos con los que el usuario haya cargado en `child.model`) y la instrucción: "Elegí el modelo más adecuado para cada tarea según su dificultad (los `flash`/`haiku` para tareas simples y rápidas, los `pro`/`opus`/`sonnet` para tareas complejas) e indicalo en el campo `model` de cada task del bloque delegate". `Delegation` gana `model?: string`; `parseDelegations` lo acepta; `onRunFinished` lo pasa a `startRun` solo si está en la lista de modelos del provider del hijo (si no, ignorar y loguear `system`). El mensaje `delegation` del feed muestra el modelo elegido entre corchetes.
4. `README.md`: secciones "Detección de IAs", "Perfil y órdenes predefinidas", "Modelos".

## Casos borde y decisiones ya tomadas
- `ollama` sin modelo → error claro antes de spawnear.
- Un override manual inválido no rompe la detección: se muestra en rojo "ruta no existe".
- No tocar `src/components/ui/**`. Bundle web sin `node:*`. Texto visible en español.

## Fuera de alcance
- Descargar/instalar CLIs. Medir costo por modelo.

## Verificación
```
npx tsc --noEmit
npm run build
npm run build:cli
cd src-tauri && cargo check && cd ..
node bin/ais.js detect
node bin/ais.js profile set --name Matias --about "Desarrollador full stack" --preferences "Respuestas cortas en español rioplatense"
node bin/ais.js presets add saludo --prompt "Saludá al usuario por su nombre en una línea" --agent Antigravity --model gemini-3.8-flash-low
node bin/ais.js run --preset saludo -w %TEMP%\ais-cli-test
```
La respuesta debe usar el nombre "Matias". Después `ais presets remove saludo`. Commitear con mensajes en inglés. No hacer push.
