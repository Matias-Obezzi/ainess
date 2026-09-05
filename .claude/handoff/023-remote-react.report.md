# Informe — 023: vista remota v2 (la misma UI React servida al celular)

## Qué se hizo

La página que se abre desde el QR dejó de ser `src/remote/remote.html` (vanilla, feed como texto
crudo, 202 líneas, borrada) y pasó a ser una build React de la misma app en layout móvil.

**Build de la página (`vite.remote.config.ts`, `npm run build:remote`)**

- Misma base que `vite.config.ts` (react, tailwind, alias `@`, `define`), `root: "src/remote"`,
  `outDir: dist-remote`, `emptyOutDir`, `assetsInlineLimit` alto, `cssCodeSplit: false` y
  `vite-plugin-singlefile` (instalado con `npm install -D`, v2.3.3, soporta Vite 8).
- Sale **un solo** `dist-remote/index.html` de 651 kB (206 kB gzip), sin ningún asset externo.
- `npm run build` = `tsc && vite build && npm run build:remote`; `npm run build:cli` corre
  `build:remote` primero (el CLI incrusta el HTML). `beforeDevCommand` pasó a
  `npm run build:remote && npm run dev`. `dist-remote/` va a `.gitignore`.
- `src-tauri/build.rs` escribe un placeholder en `dist-remote/index.html` si falta, así un clon
  limpio pasa `cargo check` antes de correr npm (verificado borrando el archivo a mano).
- Rust: `include_str!("../../dist-remote/index.html")`. Node: `import remoteHtml from
  "../../dist-remote/index.html?raw"` (ruta relativa, el alias `@` no llega ahí).

**Entrada y transporte del remoto**

- `src/remote/index.html`: tema por `prefers-color-scheme` (script inline que pone `.dark` en
  `<html>`), `viewport-fit=cover`.
- `src/remote/main.tsx`: instala `remoteTransport` antes de tocar el store y monta `<RemoteApp/>`.
  Sin `installConsoleCapture()` (no hay archivo de log en el celular) y sin `StrictMode` (el doble
  montaje duplicaría la conexión SSE sin ganar nada acá).
- `src/lib/transport-remote.ts`: `Transport` inerte como `transport-null.ts`, con `httpGet`/
  `httpPost` reales por `fetch`.
- `src/remote/remote-client.ts`: `getToken()` (de `?token=`, a `sessionStorage`, URL limpiada con
  `history.replaceState`), `api()` (fetch con `Authorization: Bearer`, tira `RemoteError` con el
  status), `connectEvents()` (EventSource con backoff 1→10 s), `hydrate()` y
  `installRemoteActions()`, que sobrescribe en el store `submitPrompt`, `instructAgent`, `stopAll`,
  `stopAgent`, `approve`, `reject`, `sendChatMessage` y `stopChat` por sus POSTs (con
  `toast.error` cuando la PC devuelve `error`), deja `saveConfig`/`loadChatMessages` en no-op y
  hace que `createChat`/`updateChat`/`removeChat` avisen que eso se edita en el escritorio.

**UI (`src/remote/RemoteApp.tsx`)**

- Pantallas de conexión: sin token, token inválido (401/403 del primer `GET /api/state`),
  conectando; banner "Reconectando…" arriba mientras el SSE está caído.
- Inicio: cards de proyecto (color, nombre, última tarea, "N trabajando") y botón con las
  aprobaciones pendientes que abre el proyecto de la más vieja.
- Proyecto: cabecera fija (volver, nombre, puntos de estado) y pestañas inferiores fijas —
  Orquestador (`OrchestratorThread` + `Composer`), Chats (lista → `ChatThread` + `Composer`),
  Aprobaciones (`ApprovalsPanel` o empty state) y Agentes (avatar, rol, estado, tarea actual,
  Detener e Indicar con el `InstructDialog` que ya existía; nunca `window.prompt`).
- Los componentes reusados no se tocaron. Sin sidebar, terminales, jerarquía ni configuración.

**Protocolo**

- `RemoteSnapshot` ahora lleva además `runs` (últimos 60 por proyecto, sin `rawLines`,
  `prompt`/`output` a 20 000 chars), `chats`, `chatMessages` (últimos 200 por chat cargado),
  `binaries` (solo `path`), `activeChats` y `createdAt` en los proyectos; `messages` pasó de 150 a
  800 y `agents` incluye `model`/`description`.
- `buildSnapshot()` mide el JSON, lo loguea en nivel `debug` y, si pasa 1 MB, lo rearma con 400
  mensajes y 30 runs por proyecto.
- `handleRemoteCommand`: `stop` acepta `{chatId}` además de `{projectId, agentId?}`; `chat` ahora
  rechaza un `chatId` inexistente (antes devolvía `ok` y no hacía nada). `prompt`/`instruct` ya
  aceptaban `agentId` y `model`, y `approve` ya aceptaba `decision`/`note`: se mantuvo la
  compatibilidad con los bodies viejos. Las rutas de Rust y Node no cambiaron.
- `attachRemote` ahora también pushea cuando cambian `chatMessages` y `binaries` (throttle 300 ms).
- Store: campo nuevo `remoteActiveChats`, que `isChatActive` (`src/lib/chat.ts`) consulta además de
  su `Map` en memoria. En la app y el CLI queda `[]`, así que nada cambia ahí.

**Docs**: `PLAN.md` tiene una sección nueva "Acceso remoto (celular)" (build single-file, `build.rs`,
transporte, hidratación, acciones sobrescritas, protocolo HTTP completo con los bodies) y `README.md`
suma los comandos de build y los campos de cada ruta. CI (`ci.yml`/`release.yml`) no necesitó
cambios: `npm run build` corre antes de `cargo check` y ya genera `dist-remote/`.

## Commits

| Hash | Mensaje |
|---|---|
| `4ed3bf3` | Remote view v2: serve a React build of the app to the phone |
| `c9839e4` | Remote view: fix the chat list selector, guard /api/chat, document it |
| `38bc447` | Remote home: sort the pending approvals in the memo, not in the click handler |

(En el medio entraron dos commits de otra sesión trabajando en el mismo repo — `ae00b85` y
`5411a93` — que no tocan archivos de este plan. Se re-verificó todo sobre el HEAD combinado.)

## Verificación

Todo desde la raíz del repo, sobre el HEAD final:

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | OK, sin errores |
| `npm test` | 8 archivos, 67 tests, todos pasan |
| `npm run build` | OK — `dist/` + `dist-remote/index.html` 650.91 kB (206.13 kB gzip), un solo archivo |
| `npm run build:cli` | OK — `dist-cli/ais.js` 730.23 kB (incluye la página) |
| `npm run release:check` | OK, versión 0.1.0 consistente |
| `cd src-tauri && cargo check` | OK |
| `cd src-tauri && cargo test` | OK (0 tests, como antes) |
| `cargo check` sin `dist-remote/index.html` | OK: `build.rs` escribe el placeholder y compila |

No se corrió `npm run tauri dev` (puerto 1420 ocupado por la app del usuario).

**Prueba manual** — `node bin/ais.js serve --port 4711 -w <carpeta temporal>` y la página abierta en
el navegador con viewport de celular (375×812):

- `GET /` sin token → 401; con token → 200 con el HTML de 650 kB; el token desaparece de la barra
  de direcciones apenas carga.
- Inicio muestra el proyecto; al abrirlo se ven las cuatro pestañas y todas renderizan
  (Orquestador con su empty state, Chats, Aprobaciones, Agentes con los tres agentes y su estado).
- **Prompt real**: se escribió un prompt desde el `Composer` del celular, arrancó el run en la PC,
  el hilo mostró la burbuja del usuario, `RunActivity` en vivo ("Pensando… 0:01") y después la
  respuesta renderizada como markdown. El botón pasó a "Detener" mientras corría.
- **Aprobación real**: con `approveDelegations` prendido temporalmente, un prompt que delega a
  Antigravity dejó la aprobación pendiente; se vio en la pestaña Aprobaciones (con el badge "1" en
  la barra inferior), se escribió una nota y se **rechazó** desde el celular. El feed del servidor
  registró `Rechazado: Claude → Antigravity …` y el planificador contestó en "Ronda 2" explicando
  el rechazo, todo visible en el hilo del celular.
- Endpoints con curl: `approve` con id inexistente → 400 `{"error":"Aprobación inexistente"}`,
  `stop {chatId}` inexistente → 400 `{"error":"Chat inexistente"}`, sin token → 401.
- **Reconexión**: matando el servidor apareció el banner "Reconectando…" y al volver a levantarlo la
  página se rehidrató sola.
- Consola del navegador en una pestaña limpia: sin errores.

Limpieza: los dos proyectos de prueba se borraron con `node bin/ais.js projects remove <nombre>`, se
borraron sus carpetas temporales y sus archivos de historial vacíos, y `approveDelegations` volvió a
`false`. El `config.json` del usuario quedó igual que antes de empezar.

## Decisiones tomadas

- **Un bug encontrado y arreglado en la propia implementación**: `ChatList` filtraba adentro del
  selector de zustand, así que devolvía un array nuevo en cada render y React tiraba
  "maximum update depth exceeded" (error #185) al abrir la pestaña Chats. Se filtra en un `useMemo`.
- **`activeChats` se deriva de los mensajes pendientes** (`chatMessages` con un mensaje
  `status: "pending"`) en vez de importar `isChatActive` en `remote.ts`. Es la misma señal y evita
  meter un ciclo de imports `remote → chat → orchestrator → store → remote` en el bundle del CLI.
- **Texto de los mensajes recortado a 8000 chars** (no 2000 como antes): un mensaje `text` acumula
  toda la respuesta que el agente va escribiendo, así que 2000 cortaba la actividad en vivo.
- **El snapshot se recorta solo** si pasa 1 MB (400 mensajes / 30 runs por proyecto), además del log
  `debug` con el tamaño que pedía el plan.
- **`build.rs` con placeholder**, como decía el plan (no `option_env!`).
- **`agents` en el snapshot** se tipó como un `Pick<AgentConfig, …>` con `model` y `description`, y
  la hidratación completa `autoApprove: false`: el celular no edita agentes, así que el flag no
  viaja.
- **`createChat`/`updateChat`/`removeChat` avisan en vez de ejecutar**: `ChatThread` trae los botones
  de editar y borrar chat, y desde el celular eso solo cambiaría el store local hasta el próximo
  snapshot. Editar configuración está fuera de alcance, así que muestran un `toast`.
- **Sin `StrictMode`** en `src/remote/main.tsx`, para no abrir dos EventSource en desarrollo.
- **`outDir` absoluto** en `vite.remote.config.ts` en vez de `"../../dist-remote"`: es el mismo
  destino y no depende de cómo se resuelva `root`.
- **Un commit ajeno separado**: un commit mío arrastró sin querer cambios de otra sesión que estaba
  trabajando en `src/lib/providers.ts` y `PLAN.md` al mismo tiempo. Se deshizo con
  `git reset --mixed` y se rehizo el commit solo con mi archivo; esos cambios volvieron al working
  tree y la otra sesión los commiteó después (`4530087`).

## Pendientes o dudas

- **La fila de selects del `Composer` queda apretada en 375 px**: destino, modelo, órdenes
  predefinidas y Enviar entran envueltos en dos líneas y los selects miden 32 px de alto, por debajo
  de los 40 px táctiles que pedía el plan. No se tocó porque el plan dice reusar el componente tal
  cual y cambiarlo afecta al escritorio. Si molesta, la solución limpia es una variante compacta del
  `Composer` para el remoto.
- **`RunDetailDialog` ("Ver salida cruda") queda vacío en el celular**: `rawLines` no viaja en el
  snapshot a propósito. El botón sigue estando porque es parte de `OrchestratorThread`.
- **`ais serve --port N` ignora el puerto cuando `remote.enabled` es `true` en la config**: `runInit`
  ya levanta el servidor en el puerto de la config y `remoteStart` devuelve el server existente.
  Es un comportamiento previo a este plan (no lo toqué), pero conviene saberlo: durante las pruebas
  el `--port 4711` funcionó solo porque la app de escritorio del usuario tenía tomado el 4710.
- **La app de escritorio instalada sigue sirviendo la página vieja** hasta que se recompile: el HTML
  está incrustado en el binario con `include_str!`.
- No se probó `--tunnel` (la página usa rutas relativas, así que debería funcionar igual), ni un
  celular real: la prueba fue con el viewport móvil del navegador de la PC.
