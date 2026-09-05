# Vista remota v2: la misma UI de la app (React) servida al celular, en lugar de la página vanilla con JSON crudo

Repo: C:\Users\matia\Desktop\projects\ais (único repo)
Rama: la que esté activa (`main`), sin cambiar de rama ni crear otras

## Objetivo
La página que se abre desde el celular (acceso remoto LAN / túnel) deja de ser `src/remote/remote.html`
(vanilla, muestra el feed como texto crudo) y pasa a ser una **build React de la misma app**, en modo
"remoto" y layout móvil: el hilo del Orquestador con actividad en vivo, markdown y tarjetas de delegación,
las aprobaciones, los chats y el input, reutilizando los componentes existentes tal cual. Se sirve como un
único archivo HTML (JS y CSS inline) tanto desde el servidor Rust como desde `ais serve`.

## Contexto
Leer `PLAN.md` ("UI", "Remoto", "Túnel", "Logging") antes de empezar. Stack: Tauri 2 + React 19 + TS
estricto + Tailwind 4 + shadcn + zustand. UI en español, código en inglés.

Cómo está hoy:
- `src/remote/remote.html`: página vanilla (202 líneas) que consume `GET /api/state` (snapshot) y `GET
  /api/events` (SSE con eventos `state`), y manda `POST /api/prompt|instruct|stop|approve|chat` con
  `{ action, payload }`-style bodies (ver `handleRemoteCommand` en `src/lib/remote.ts:72` y las rutas en
  `src-tauri/src/remote.rs:206-213`). Token por `?token=` o `Authorization: Bearer`.
- `src/lib/remote.ts`: `buildSnapshot()` (`RemoteSnapshot` en `src/types.ts`: serverTime, projects (con
  `running`, `activeTaskRunId`), agents (id/name/provider/role/parentId/color), runtime (status + currentTask
  recortada), messages (últimos `MAX_MESSAGES`, texto recortado a 2000), approvals pendientes),
  `handleRemoteCommand(action, payload)` (prompt, instruct, stop, approve, chat, state), `attachRemote` (push
  del snapshot con throttle cuando cambia el estado), `remoteUrl`, `startTunnel/stopTunnel`.
- Rust `src-tauri/src/remote.rs`: `const PAGE: &str = include_str!("../../src/remote/remote.html")` servido en
  `/`; el resto son rutas de API que hablan con el webview vía el evento `remote-command` + `remote_reply`.
  Node: `src/lib/remote-node.ts` importa `@/remote/remote.html?raw` y sirve lo mismo para `ais serve`.
- Store (`src/store.ts`): todo el estado que usan los componentes (`config.agents/projects/chats`, `runs`,
  `messages`, `runtime`, `approvals`, `chatMessages`, `activeTaskRunId`, `currentProjectId`, `currentChatId`,
  `screen`, `projectMode`, …) y las acciones (`submitPrompt`, `instructAgent`, `stopAll`, `stopAgent`,
  `approve`, `reject`, `sendChatMessage`, `stopChat`, `openProject`, `openHome`, `setCurrentChat`…). Las
  acciones llaman al orquestador, que a su vez usa `getTransport()` (`src/lib/transport.ts`;
  `transport-null.ts` es el transporte inerte del preview en navegador).
- Componentes reutilizables sin cambios: `src/components/shell/OrchestratorThread.tsx` (hilo: runs raíz del
  `currentProjectId`, `RunActivity`, `Markdown`), `ChatThread.tsx`, `Composer.tsx` (usa `submitPrompt`,
  `sendChatMessage`, `stopAll`, `stopChat`, `binaries`, `PROVIDERS`), `ApprovalsPanel.tsx` (`approve`/`reject`),
  `RunActivity.tsx`, `Markdown.tsx`, `ProviderLogo.tsx`, `StatusDot.tsx`, `ui/*`.
- Build: `vite.config.ts` (app), `vite.cli.config.ts` (CLI, `npm run build:cli`), `npm run build` = `tsc &&
  vite build`. `tauri.conf.json`: `beforeDevCommand: npm run dev`, `beforeBuildCommand: npm run build`.
  `.github/workflows/ci.yml` y `release.yml` corren `npm run build`/`build:cli`/`cargo check`/tauri-action.
- La app principal identifica el entorno con `isTauri()` (`src/lib/tauri.ts`).

## Cambios

### 1. Entrada React para el remoto (`src/remote/index.html`, `src/remote/main.tsx`, `src/remote/RemoteApp.tsx`)
- `vite.remote.config.ts`: misma base que `vite.config.ts` (react, tailwind, alias `@`, `define`), `root:
  "src/remote"`, `build.outDir: "../../dist-remote"`, `emptyOutDir`, y el plugin `vite-plugin-singlefile`
  (instalar como devDependency) para que salga **un solo** `dist-remote/index.html` con JS y CSS inline
  (`build.assetsInlineLimit: 100000000`, `cssCodeSplit: false`). Script npm `build:remote`. `npm run build`
  pasa a ser `tsc && vite build && vite build -c vite.remote.config.ts` (o `npm run build:remote` al final), y
  `build:cli` corre `build:remote` antes (el CLI incrusta el HTML). Agregar `dist-remote/` a `.gitignore`.
- `main.tsx`: importa `@/index.css`, monta `<RemoteApp/>`, instala `installConsoleCapture()` NO (no hay
  archivo de log en el celular): usar solo `console`.
- Rust: `include_str!("../../dist-remote/index.html")`. Como el archivo se genera, `tauri.conf.json`
  `beforeDevCommand` pasa a `npm run build:remote && npm run dev` y `beforeBuildCommand` sigue `npm run build`
  (que ya lo genera). Para que `cargo check` no falle en un clon limpio, `build.rs` de `src-tauri` crea
  `dist-remote/index.html` vacío si no existe (con un comentario "run npm run build:remote") — o usar
  `include_str!` sobre un archivo comprometido `src/remote/fallback.html` cuando el generado falta vía
  `option_env!`… elegir la del `build.rs`. Node: `import remoteHtml from "../../dist-remote/index.html?raw"`
  (ruta relativa, no alias) en `remote-node.ts`.
- Borrar `src/remote/remote.html`.

### 2. Transporte remoto (`src/lib/transport-remote.ts`, nuevo) y arranque
- Implementa `Transport` para el navegador del celular: `loadConfig/saveConfig/detectBinaries/spawnRun/…`
  inertes (como `transport-null.ts`), pero con `httpGet/httpPost` reales (`fetch`) — no se usa el resto.
- `src/remote/remote-client.ts`: `getToken()` (de `?token=`; guardarlo en `sessionStorage` y limpiar la URL
  con `history.replaceState`), `api(path, body?)` (fetch con `Authorization: Bearer`), `connectEvents(onState)`
  (EventSource a `/api/events?token=…`, reconexión con backoff 1-10 s), `hydrate(snapshot)` que vuelca el
  snapshot en el store con `useAppStore.setState(...)`: `config.projects/agents/chats`, `runs`, `messages`,
  `approvals` (como record), `runtime` (con `queuedInstructions: []`), `activeTaskRunId`, `chatMessages`,
  `binaries`, `loaded: true`. Mantener `currentProjectId`/`currentChatId` del usuario del celular (no vienen
  del snapshot).
- Acciones: después de hidratar por primera vez, **sobrescribir en el store** las acciones que ejecutan cosas:
  `submitPrompt` → `POST /api/prompt {projectId, agentId, text, model}`, `instructAgent` → `/api/instruct`,
  `stopAll`/`stopAgent` → `/api/stop`, `approve`/`reject` → `/api/approve {approvalId, decision, note}`,
  `sendChatMessage` → `/api/chat {chatId, text}`, `stopChat` → `/api/stop {chatId}`. Cada una muestra un
  `toast.error` si la respuesta trae `error`. Las que cambian config (`upsertAgent`, etc.) no se exponen en
  el remoto. `saveConfig` → no-op.
- Ampliar `buildSnapshot()` (y `RemoteSnapshot`) con lo que necesitan los componentes: `runs` (por proyecto,
  últimos 60 runs sin `rawLines`, con `output` recortado a 20 000 chars), `messages` (últimos 800, incluyendo
  `meta` y `runId`), `chats` (`config.chats`) y `chatMessages` (solo de los chats cargados, últimos 200 por
  chat), `binaries` (solo `{ path: "…" }` o `null`), `approvals` pendientes con `payload`. Agregar al
  `handleRemoteCommand` los campos que hoy faltan: `prompt` acepta `agentId` y `model`; `approve` acepta
  `decision: "approve" | "reject"` y `note`; `stop` acepta `chatId` o `agentId`. Mantener compatibilidad con
  los bodies actuales. Rutas Rust y Node: no cambian (solo pasan el JSON).
- `attachRemote` ya pushea al cambiar el estado; verificar que `chatMessages` y `runs` disparen el push (si
  el subscribe solo mira algunos campos, agregar los que falten) y que el throttle siga en ~300 ms.

### 3. `RemoteApp.tsx` (layout móvil, `min-h-dvh`, `max-w-screen-sm mx-auto`)
- Pantalla de conexión: sin token → "Abrí esta página desde el QR de la app"; error de auth → "Token
  inválido"; desconectado → banner arriba "Reconectando…".
- **Inicio**: lista de proyectos (cards: color, nombre, "N trabajando", última tarea) → tap abre el proyecto.
  Badge global de aprobaciones pendientes en la cabecera.
- **Proyecto**: cabecera fija (volver, nombre, puntos de estado de los agentes) + pestañas inferiores fijas
  (`Orquestador`, `Chats`, `Aprobaciones`, `Agentes`):
  - Orquestador: `<OrchestratorThread/>` + `<Composer/>` (funcionan con el store hidratado).
  - Chats: lista de chats del proyecto → `<ChatThread/>` + `<Composer/>` (setear `currentChatId`).
  - Aprobaciones: `<ApprovalsPanel/>` (del proyecto) y, si no hay, empty state.
  - Agentes: lista simple: avatar (`AgentAvatar`), nombre, provider/rol, estado, tarea actual, botones
    Detener / Indicar (prompt nativo `window.prompt` está prohibido: usar un pequeño `Dialog` con textarea).
- Tema: respeta `prefers-color-scheme` (los tokens ya lo hacen). Botones táctiles ≥ 40px. Sin sidebar, sin
  título de ventana, sin terminales, sin jerarquía (no aplica en el celular).
- El `Composer` en el remoto no debe mostrar el alerta de "CLI no detectado" si `binaries` no vino: el
  snapshot manda `binaries` así que se comporta igual que en la app.

### 4. Docs y CI
- `PLAN.md`: sección "Remoto" → describir la build React (`vite.remote.config.ts`, single-file, `build.rs`),
  el transporte remoto, la hidratación del snapshot y las acciones sobrescritas; actualizar el protocolo HTTP
  con los campos nuevos.
- `README.md`: comandos (`npm run build:remote`).
- `.github/workflows/ci.yml` y `release.yml`: no requieren cambios si `npm run build` ya genera el remoto;
  verificar el orden (`build:remote` antes de `cargo check` en CI).

## Casos borde y decisiones ya tomadas
- El token nunca se loguea ni se muestra; la URL se limpia apenas se lee.
- El snapshot completo puede pesar cientos de KB: el push SSE manda el snapshot entero (simple y robusto);
  si en la práctica supera 1 MB, recortar `messages` a 400. Medir con `JSON.stringify(...).length` en un log
  de nivel debug.
- `OrchestratorThread` usa `historyLoading[projectId]`: en el remoto queda `false`.
- `Composer` usa `isChatActive(chatId)` (estado en memoria del proceso de la app): en el remoto, derivarlo del
  snapshot: exponer en el snapshot `activeChats: string[]` y hacer que `isChatActive` consulte también
  `useAppStore.getState().remoteActiveChats` (campo nuevo, solo lo llena el remoto).
- No tocar `src-tauri/src/tunnel.rs`, el tray, el updater ni los componentes de escritorio salvo lo
  estrictamente listado.

## Fuera de alcance
- Editar configuración (agentes, skills, MCP) desde el celular; terminales remotas; jerarquía en el celular.

## Verificación
Desde la raíz del repo:
```
npx tsc --noEmit
npm test
npm run build            (genera dist/ y dist-remote/index.html, un solo archivo)
npm run build:cli
cd src-tauri && cargo check
```
A mano: `node bin/ais.js serve -w <carpeta>` y abrir la URL con token en el navegador de la PC: se tiene que
ver la UI React con el hilo del proyecto (usar un proyecto con historial), aprobar/rechazar una aprobación de
prueba y mandar un prompt. No correr `npm run tauri dev` (puerto 1420 ocupado por la app del usuario).
