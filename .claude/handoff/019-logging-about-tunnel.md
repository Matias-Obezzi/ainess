# Logging a archivo, sección "Acerca de" (versión, updates, logs) y túnel público para el acceso remoto

Repo: C:\Users\matia\Desktop\projects\ais (único repo)
Rama: la que esté activa (`main`), sin cambiar de rama ni crear otras

## Objetivo
1. Todo lo que pase por `console.log/info/warn/error`, los errores no capturados y los `unhandledrejection`
   del front, más los eventos importantes del back (runs que arrancan/terminan, errores de comandos), se
   escriben en archivos de log en la máquina del usuario, con rotación diaria.
2. Configuración → "Acerca de": quién la creó, versión actual, botón "Buscar actualizaciones" y botón
   "Abrir carpeta de logs".
3. Configuración → Remoto: además del acceso por LAN, un túnel público (cloudflared o ngrok) para usar la
   app desde afuera; solo se puede prender si el acceso remoto local está prendido.

## Contexto
Leer `PLAN.md` antes de empezar. Stack: Tauri 2 (Rust) + React 19 + TS estricto + Tailwind 4 + shadcn.
UI en español, código en inglés. Los planes 017 (Configuración con router de secciones en
`src/components/settings/SettingsDialog.tsx`: `SETTINGS_SECTIONS` con `{ id, label, help, icon, component,
actions? }`; secciones en `src/components/settings/*Section.tsx`; `RemoteSection.tsx`) y 018 (barra de
título, nombre "ainess") ya están mergeados en `main`: mirar esos archivos antes de escribir.

Cómo está hoy:
- Transport (`src/lib/transport.ts` + `transport-tauri.ts` (invoke), `transport-node.ts` (CLI),
  `transport-null.ts` (preview)): `exec`, `httpGet/httpPost`, `readTextFile/writeTextFile` (relativos a
  `%APPDATA%\com.matias.ais\`), `remoteStart/Stop/Status`, `setTrayEnabled`…
- Rust: `src-tauri/src/lib.rs` registra comandos; `runner.rs` (spawn de procesos con eventos `run-output`
  / `run-exit`, `exec_capture`), `remote.rs` (servidor axum en `0.0.0.0:<port>`, token en la URL o
  `Authorization: Bearer`), `tray.rs`, `config.rs` (`read_home_file`), `http.rs`. Plugins: opener, dialog,
  notification. `dirs` está en `Cargo.toml`.
- Config (`src/types.ts` `AppConfig`, versión 8): `remote: { enabled, port, token }`. Migraciones en
  `src/store.ts` `runInit`.
- `src/lib/remote.ts`: `startRemote/stopRemote/remoteUrl`; `RemoteSection` muestra switch, puerto, URL, QR,
  token. `src/remote/remote.html` usa rutas relativas (funciona detrás de un túnel sin cambios).
- Versión: `package.json` y `src-tauri/tauri.conf.json` (`0.1.0`). `@tauri-apps/api/app` tiene `getVersion()`.
- Detección de binarios: `src/lib/transport-node.ts` `which()`/`wingetCandidates()`, Rust `detect.rs`
  (`which` + winget). `ngrok` y `cloudflared` no están instalados en esta máquina: la UI tiene que explicar
  cómo instalarlos (`winget install Cloudflare.cloudflared` / `winget install Ngrok.Ngrok`).

Referencias:
- Carpeta de logs: `app.path().app_log_dir()` de Tauri (en Windows `%LOCALAPPDATA%\com.matias.ais\logs`).
  En el CLI: `%LOCALAPPDATA%\com.matias.ais\logs` también (mismo lugar).
- Abrir carpeta: en Rust `tauri_plugin_opener::open_path(path, None::<&str>)` dentro de un comando
  `open_logs_dir` (así no hay que ampliar permisos del plugin).
- cloudflared quick tunnel: `cloudflared tunnel --url http://127.0.0.1:<port>`; imprime en **stderr** una línea
  con la URL pública `https://<algo>.trycloudflare.com` (regex `https://[a-z0-9-]+\.trycloudflare\.com`).
  No requiere cuenta.
- ngrok: `ngrok http <port> --log=stdout --log-format=json`; la URL pública sale en una línea JSON con
  `"url":"https://…ngrok…"` (campo `url` del evento `started tunnel`), o consultando
  `http://127.0.0.1:4040/api/tunnels` (`tunnels[0].public_url`). Requiere authtoken configurado por el usuario
  (`ngrok config add-authtoken …`); si falta, el proceso termina con error: mostrarlo.
- Updates: el repo público es `https://github.com/Matias-Obezzi/ainess` y las releases las publica GitHub
  Actions al mergear a `main`. Se usa el **updater oficial de Tauri 2**:
  - Cargo: `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"`; npm: `@tauri-apps/plugin-updater`,
    `@tauri-apps/plugin-process` (instalar con npm). `lib.rs`: `.plugin(tauri_plugin_updater::Builder::new().build())`
    y `.plugin(tauri_plugin_process::init())`. Capabilities: `"updater:default"`, `"process:default"`.
  - `tauri.conf.json`: `"bundle": { …, "createUpdaterArtifacts": true }` y
    `"plugins": { "updater": { "pubkey": "<clave pública de abajo>", "endpoints": ["https://github.com/Matias-Obezzi/ainess/releases/latest/download/latest.json"] } }`.
    Clave pública (ya generada; la privada está en `~/.tauri/ainess.key` de esta máquina y NO va al repo):
    `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IENBMjYwRTgxQzE5RkY3OTkKUldTWjk1L0JnUTRteWkrRDNSVmxpL0lkSjZMdVQrSWN4U0ZReTBxY3ZiTUVsWCt3SEhFRE5QcnAK`
  - JS (`src/lib/updates.ts`): `import { check } from "@tauri-apps/plugin-updater"; import { relaunch } from
    "@tauri-apps/plugin-process";` → `checkForUpdate()` devuelve `{ available: false }` o `{ available: true,
    version, body, install: (onProgress) => update.downloadAndInstall(onProgress).then(relaunch) }`. Solo en
    Tauri (`import()` dinámico dentro de `isTauri()`); en el CLI/preview devuelve `{ available: false,
    unsupported: true }`. Errores → mensaje legible ("No se pudo consultar: …"), nunca lanza.
  - Chequeo automático al iniciar: `config.autoUpdateCheck: boolean` (default `true`, switch en General "Buscar
    actualizaciones al iniciar"); 5 s después de `loaded`, si hay update, `toast` persistente "ainess X.Y.Z
    disponible" con botón "Instalar" (descarga con progreso en el toast y reinicia).

## Cambios

### 1. Logging
- Rust `src-tauri/src/logging.rs`: `LogState { file: Mutex<Option<(String /*date*/, File)>> }`; función
  `append(app, level, source, message)` que escribe una línea `2026-09-05T14:03:22.123Z [level] [source]
  message` en `<app_log_dir>/ainess-YYYY-MM-DD.log` (crea la carpeta; rota por fecha al cambiar el día; al
  arrancar borra logs de más de 14 días). Comando `log_append(level, source, message)` para el front y
  comando `logs_dir() -> String`, `open_logs_dir()`. Loguear desde Rust: arranque de la app (versión), spawn y
  exit de runs (`runner.rs`: runId, programa, código), errores de `exec_capture`, `remote_start/stop`,
  errores de `http_*`, eventos del tray.
- Front `src/lib/logger.ts`: `log.info/warn/error/debug(source, ...args)` → formatea (`JSON.stringify` para
  objetos, `Error` con stack) y manda por `getTransport().logAppend(level, source, message)` (nuevo método;
  tauri → invoke; node → escribe él mismo en el mismo archivo con `fs.appendFileSync`; null → no-op). Buffer
  en memoria de las últimas 500 líneas (`getRecentLogs()`). `installConsoleCapture()`: envuelve
  `console.log/info/warn/error/debug` (sigue imprimiendo en la consola original) y registra
  `window.onerror` + `unhandledrejection`; llamarlo lo antes posible en `src/main.tsx` y en `src/cli/main.ts`.
  Evitar recursión (el logger no usa `console`) y truncar mensajes a 10 kB.
- Sustituir los `console.warn/error` que ya hay en `src/lib/*` y hooks por `log.*` cuando aporte contexto
  (source = módulo).
- Nivel mínimo configurable: `config.logLevel: "debug" | "info" | "warn" | "error"` (default `"info"`),
  switch en General ("Registrar detalles (debug)").

### 2. Acerca de (`src/components/settings/AboutSection.tsx`, nueva sección `about` al final de
`SETTINGS_SECTIONS`, icono `Info`)
- Card con el nombre "ainess", la versión (`getVersion()` en Tauri, `package.json` en el CLI/preview vía una
  constante `APP_VERSION` inyectada por Vite: `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` en
  `vite.config.ts` y `vite.cli.config.ts`, declarada en `src/vite-env.d.ts`), "Creada por Matías Obezzi"
  con link a `https://github.com/Matias-Obezzi` (opener), y la lista de tecnologías (Tauri, React, Tailwind).
- Botones: "Buscar actualizaciones" (spinner; resultado inline: "Estás al día (0.1.0)" / "Hay una versión nueva:
  0.2.0" con las notas y botón "Descargar e instalar" que muestra progreso (`Progress`) y reinicia la app /
  "No se pudo consultar: …"), "Abrir carpeta de logs" (`open_logs_dir`),
  y "Copiar diagnóstico" (versión, SO, binarios detectados, últimas 50 líneas del log al portapapeles).
- Ampliar `SettingsSection` en el store con `"about"` y sanear en `loadUiPrefs`.

### 3. Túnel público
- Config: `remote.tunnel: { provider: "cloudflared" | "ngrok"; enabled: boolean }` (migración a versión 9,
  default `{ provider: "cloudflared", enabled: false }`).
- Rust `src-tauri/src/tunnel.rs`: `TunnelState { child: Mutex<Option<Child>>, url: Mutex<Option<String>> }`;
  comandos `tunnel_start(provider, port) -> { url }` (spawn oculto (`CREATE_NO_WINDOW`), lee stdout/stderr en
  un hilo hasta encontrar la URL (timeout 30 s → error legible, y mata el proceso), guarda `url`),
  `tunnel_stop()`, `tunnel_status() -> { running, url, provider }`, `tunnel_detect() -> { cloudflared: path|null,
  ngrok: path|null }` (reusar `winget_candidates`/`which` de `detect.rs`). Al cerrar la app (`app.exit` del
  tray y salida normal) matar el túnel. Loguear todo con `logging::append`.
- Transport: `tunnelStart/Stop/Status/Detect` (tauri → invoke; node → implementación con `child_process`
  equivalente, para `ais serve --tunnel`; null → error "No disponible en el navegador").
- `src/lib/remote.ts`: `startTunnel()` (requiere `remoteStatus.running`, si no lanza "Prendé primero el acceso
  remoto local"), `stopTunnel()`, `tunnelUrl()` = `<url pública>/?token=<token>`. Al apagar el acceso remoto
  local se apaga el túnel. Store: `tunnelStatus`, acciones `startTunnel/stopTunnel/refreshTunnelStatus`,
  autostart al arrancar si `remote.enabled && remote.tunnel.enabled`.
- `RemoteSection`: bloque "Acceso desde afuera (túnel)": select de proveedor (cloudflared: "sin cuenta,
  URL nueva cada vez"; ngrok: "requiere cuenta y authtoken"), estado de detección del binario con la
  instrucción de instalación (`winget install …`) y botón "Volver a detectar", switch "Túnel público"
  (deshabilitado con tooltip si el acceso local está apagado o el binario no está), URL pública + QR (reusar el
  del bloque LAN) + Copiar, aviso de seguridad ("Cualquiera con esta URL y el token puede operar la app;
  regenerá el token si la compartiste").
- CLI: `ais serve --tunnel [cloudflared|ngrok]` imprime la URL pública; `ais remote url --tunnel`.
- Página remota: sin cambios (rutas relativas).

### 4. Releases y CI (`.github/workflows/`)
- `release.yml`: `on: push: branches: [main]`. Job en `windows-latest` con `permissions: contents: write`:
  checkout, `actions/setup-node@v4` (node 22, cache npm), `npm ci`, `dtolnay/rust-toolchain@stable`,
  `swatinem/rust-cache@v2` (workspaces `src-tauri`), leer la versión de `src-tauri/tauri.conf.json`, y
  **saltar** si ya existe el tag `v<versión>` (`git ls-remote --tags origin v<versión>`); si no existe,
  `tauri-apps/tauri-action@v0` con `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}, TAURI_SIGNING_PRIVATE_KEY:
  ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ""` y `with: tagName: v__VERSION__,
  releaseName: "ainess v__VERSION__", releaseBody: "Ver los cambios en el historial de commits.", releaseDraft:
  false, prerelease: false, includeUpdaterJson: true, args: --bundles nsis`.
- `ci.yml`: `on: pull_request` y push a ramas distintas de `main`: `windows-latest`, `npm ci`, `npx tsc
  --noEmit`, `npm test`, `npm run build`, `npm run build:cli`, `cargo check` en `src-tauri` (con rust-cache), y
  `npm run release:check`.
- `scripts/release-check.mjs` + script npm `release:check`: falla si las versiones de `package.json`,
  `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml` no coinciden.
- `README.md`: sección "Publicar una versión": subir la versión en los tres archivos en la PR de `dev` a `main`;
  al mergear, Actions crea el tag, el instalador NSIS, la firma y `latest.json`; la app instalada lo ve en el
  próximo chequeo. Requisito único: el secret `TAURI_SIGNING_PRIVATE_KEY` en el repo (contenido de
  `~/.tauri/ainess.key`).

### 5. `PLAN.md`
Secciones nuevas: "Logging" (archivos, formato, rotación, `log_append`, captura de consola), "Acerca de y
actualizaciones" (updater de Tauri, endpoint latest.json, workflow de release, secret de firma), "Túnel" (comandos, parsing de URL, requisito
del acceso local).

## Casos borde y decisiones ya tomadas
- El logger nunca debe tirar excepciones ni bloquear la UI (writes asíncronos; en Rust, `Mutex` corto).
- Nunca loguear tokens (remoto, GitHub, Claude): enmascarar `token=…` en URLs con `token=***` antes de escribir.
- Si el túnel muere solo (proceso termina), `tunnel_status` lo refleja y la UI muestra "Se cayó el túnel" con
  botón Reintentar.
- Si el usuario apaga el acceso local con el túnel prendido, apagar el túnel primero.
- Sin dependencias nuevas de npm; en Rust no hace falta ninguna (std + tokio ya presentes).

## Fuera de alcance
- Autenticación adicional en el túnel; firma de código (Authenticode) del instalador.

## Verificación
Desde la raíz del repo:
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
cd src-tauri && cargo check
```
A mano: `node bin/ais.js status` tiene que crear/agregar líneas en `%LOCALAPPDATA%\com.matias.ais\logs\ainess-<fecha>.log`.
No correr `npm run tauri dev` (puerto 1420 ocupado).
