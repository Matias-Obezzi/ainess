# Informe — 019 Logging a archivo, "Acerca de" y túnel público

Rama: `main` (sin cambiar de rama, sin push).

## Qué se hizo

### 1. Logging a archivo

- **`src-tauri/src/logging.rs`** (nuevo): `LogState { file: Mutex<Option<(String, File)>> }`
  (`manage`d en `lib.rs`), `append(app, level, source, message)` que escribe
  `2026-09-05T14:03:22.123Z [info] [runner] mensaje` en
  `<app_log_dir>/ainess-YYYY-MM-DD.log` (`%LOCALAPPDATA%\com.matias.ais\logs`), rota al cambiar el
  día, enmascara secretos y trunca a 10 kB. `prune_old` (14 días) corre en `setup`. Fechas
  calculadas con los algoritmos de calendario civil de Hinnant, sin dependencias nuevas.
- Comandos: `log_append`, `logs_dir`, `open_logs_dir` (usa `tauri_plugin_opener::open_path`, sin
  ampliar el scope del plugin) y `read_recent_logs`.
- Se loguea desde Rust: arranque/cierre de la app con la versión, spawn y exit de cada run con
  código (`runner.rs`), fallas de `exec_capture` y de `http_post/http_get`,
  `remote_start`/`remote_stop`, eventos de la bandeja y todo el ciclo del túnel.
- **`src/lib/logger.ts`** (nuevo): `log.debug/info/warn/error(source, ...args)`, formateo
  (`JSON.stringify`, `Error` con stack), enmascarado de `token=…` / `"token":"…"` / `Bearer …`,
  truncado a 10 kB, buffer de 500 líneas (`getRecentLogs`) y envío por
  `Transport.logAppend`. `installConsoleCapture()` envuelve `console.*` (los originales siguen
  imprimiendo) y engancha `window.onerror` + `unhandledrejection`. Nunca usa `console`, así que no
  recursa. Se llama en `src/main.tsx` y en `src/cli/main.ts`.
- Transport: `logAppend` / `logsDir` / `openLogsDir` en los cuatro transports (tauri → invoke;
  node → `fs.appendFileSync` sobre el mismo archivo, con poda a los 14 días; null → no-op).
- `AppConfig.logLevel` (default `"info"`), switch "Registrar detalles (debug)" en General.
- Se reemplazaron los `console.warn/error` de `src/hooks/useSystemNotifications.ts` y
  `src/lib/hooks.ts` por `log.*` con su módulo como `source`.

### 2. Configuración → Acerca de

- **`src/components/settings/AboutSection.tsx`** (nueva sección `about`, última de
  `SETTINGS_SECTIONS`, icono `Info`, agregada también a `VALID_SETTINGS_SECTIONS` del store y al
  listado del `SearchPalette`): nombre y versión, "Creada por Matías Obezzi" con link al perfil
  (opener), badges de tecnologías, link al repo.
- Botones: "Buscar actualizaciones" (spinner, resultado inline: al día / versión nueva con notas y
  "Descargar e instalar" con `Progress` y reinicio / "No se pudo consultar: …"), "Abrir carpeta de
  logs" (`open_logs_dir`, deshabilitado fuera de Tauri), "Copiar diagnóstico" (versión, entorno,
  binarios detectados y últimas 50 líneas del buffer) y una acción chica para escribir una línea
  de prueba en el log.
- **`src/lib/updates.ts`**: `appVersion()` y `checkForUpdate()`, con `import()` dinámico dentro de
  `isTauri()`; nunca lanza. `src/hooks/useUpdateCheck.ts` chequea 5 s después de `loaded` si
  `config.autoUpdateCheck` (switch en General) y muestra un toast persistente con botón "Instalar"
  que descarga con progreso y reinicia.
- Rust/npm: `tauri-plugin-updater` y `tauri-plugin-process` (Cargo y npm), registrados en `lib.rs`,
  capabilities `updater:default` y `process:default`, `bundle.createUpdaterArtifacts: true` y
  `plugins.updater { pubkey, endpoints }` con la clave y el endpoint del plan.
- `__APP_VERSION__` inyectado con `define` en `vite.config.ts` y `vite.cli.config.ts` (leyendo
  `package.json` con `fs`), declarado en `src/vite-env.d.ts`.

### 3. Túnel público

- **`src-tauri/src/tunnel.rs`** (nuevo): `TunnelState { child, url, provider }` y comandos
  `tunnel_start` (async; el spawn y la lectura bloqueante van en `spawn_blocking`, resuelve el
  binario con el nuevo `detect::find_path`, lanza con `CREATE_NO_WINDOW`, lee stdout y stderr en
  hilos y espera hasta 30 s la URL; si el proceso muere antes devuelve las últimas líneas y, para
  ngrok sin authtoken, el consejo de `ngrok config add-authtoken`), `tunnel_stop` (mata el árbol
  fuera del hilo principal), `tunnel_status` y `tunnel_detect`. `reap()` detecta un túnel que se
  cayó solo. `tunnel::shutdown` se llama en `RunEvent::Exit` (por eso `lib.rs` pasó a
  `.build()` + `.run(|handle, event| …)`).
- **`src/lib/tunnel.ts`**: parte compartida y testeada (`extractTunnelUrl`, `tunnelArgs`,
  `tunnelBinary`, `tunnelInstallCommand`, `tunnelDescription`, `isTunnelProvider`).
  **`src/lib/tunnel-node.ts`**: la misma lógica con `child_process`, para `ais serve --tunnel`.
- `src/lib/remote.ts`: `startTunnel()` (exige `remoteStatus.running`, si no lanza "Prendé primero
  el acceso remoto local"), `stopTunnel()` y `tunnelUrl(publicUrl, token)`. Store: `tunnelStatus` +
  `startTunnel/stopTunnel/refreshTunnelStatus`; `stopRemote` apaga el túnel primero y `runInit` lo
  levanta si `remote.enabled && remote.tunnel.enabled`.
- `RemoteSection`: bloque "Acceso desde afuera (túnel)" con select de proveedor y su explicación,
  estado de detección del binario con el `winget install …` y "Volver a detectar", switch
  deshabilitado con tooltip cuando falta el acceso local o el binario, botón "Reintentar" cuando se
  cayó, URL pública con QR y Copiar, y el aviso de seguridad.
- Config `remote.tunnel: { provider, enabled }`, migración a `version: 9` junto con `logLevel` y
  `autoUpdateCheck`.
- CLI: `ais serve --tunnel [cloudflared|ngrok]` y `ais remote url --tunnel`; el túnel se mata en el
  `exit` del proceso.

### 4. Releases y CI

- `.github/workflows/release.yml` (push a `main`, windows-latest, `contents: write`): npm ci,
  toolchain + rust-cache, `release:check`, lee la versión de `tauri.conf.json`, saltea si ya existe
  el tag `v<versión>` y si no corre `tauri-apps/tauri-action@v0` (`--bundles nsis`,
  `includeUpdaterJson: true`, firma con `TAURI_SIGNING_PRIVATE_KEY`).
- `.github/workflows/ci.yml` (PRs y pushes a ramas != main): tsc, tests, `npm run build`,
  `npm run build:cli`, `release:check` y `cargo check`.
- `scripts/release-check.mjs` + script npm `release:check`.
- README: secciones "Acceso desde afuera (tunel publico)", "Logs" y "Publicar una version".

### 5. PLAN.md

Tres secciones nuevas ("Logging", "Acerca de y actualizaciones", "Túnel público") y el bloque de
Verificación actualizado con todos los comandos.

## Commits

| Hash | Mensaje |
| --- | --- |
| `5e9f5f9` | Rust: file logging, public tunnel and the Tauri updater plugin |
| `9c18af5` | Front: file logging, Acerca de section and public tunnel UI |
| `216a496` | Docs, CI and release workflow for logging, updates and the tunnel |
| `9a9fbe5` | Tunnel: reap a dead child before reporting status or reusing the URL |
| `0f5dda5` | Search palette: list the Acerca de settings section |

## Verificación

Todo corrido desde la raíz del repo, todo en verde:

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | OK, sin errores |
| `npm test` | 42 tests en 4 archivos, todos pasan (11 nuevos en `src/lib/__tests__/tunnel.test.ts`) |
| `npm run build` | OK (solo los warnings de chunk size y dynamic import que ya existían) |
| `npm run build:cli` | OK |
| `npm run release:check` | "Versión consistente: 0.1.0" |
| `cd src-tauri && cargo check` | OK, sin warnings |
| `cd src-tauri && cargo test --lib` | 4 tests nuevos (masking de tokens, ida y vuelta de fechas, parsing de URL de cloudflared y ngrok), todos pasan |

Prueba manual pedida por el plan:

- `node bin/ais.js status` creó/agregó líneas en
  `%LOCALAPPDATA%\com.matias.ais\logs\ainess-2026-09-05.log`, por ejemplo:
  ```
  2026-09-05T19:26:09.976Z [info] [cli] ais status
  2026-09-05T19:26:09.983Z [info] [app] configuración cargada (0 proyectos, 3 agentes)
  2026-09-05T19:26:11.522Z [info] [console] No hay proyectos.
  ```
- `node bin/ais.js remote url` imprime la URL con token y en el log queda
  `http://192.168.0.138:4710/?token=***` (enmascarado, como pide el plan).
- `node bin/ais.js remote url --tunnel` sin túnel activo devuelve el mensaje esperado y exit code 2.
- No se corrió `npm run tauri dev` (puerto 1420 ocupado). Igual, mientras trabajaba el dev server
  del usuario recargó y escribió líneas `[info] [app] webview iniciado` y
  `[warn] [updates] no se pudo consultar actualizaciones: Could not fetch a valid release JSON from
  the remote` en el mismo archivo: el camino Tauri (`log_append` + updater) funciona, y el warning
  es el correcto porque todavía no hay ninguna release publicada.

## Decisiones tomadas

- **Fechas en Rust sin dependencias nuevas**: el plan pedía no agregar crates, así que
  `logging.rs` implementa la conversión días↔calendario a mano (algoritmos de Hinnant) en vez de
  usar `chrono`. Hay un test de ida y vuelta.
- **"Copiar diagnóstico" usa el buffer en memoria del logger** (últimas 50 líneas del proceso
  actual) en vez de releer el archivo. Es lo que ve el usuario en su sesión y evita un round trip;
  igual se agregó el comando `read_recent_logs` por si se quiere leer el archivo más adelante.
- **`uncaughtExceptionMonitor` en node** en lugar de `uncaughtException`/`unhandledRejection`:
  registrar esos dos handlers cambiaría el comportamiento de salida del CLI (dejaría de crashear).
  El monitor observa sin alterar el exit code. En el navegador sí se usan `error` y
  `unhandledrejection`, que no tienen ese problema.
- **Enmascarado más amplio que lo pedido**: además de `token=…` en URLs se enmascaran
  `"token":"…"` y `Bearer …`, en Rust y en TS, para que un header o un JSON logueado tampoco
  filtren el token.
- **`ais remote url --tunnel`**: el túnel vive dentro del proceso que lo levantó, así que en una
  invocación suelta del CLI no hay ninguno. En vez de inventar un estado compartido, devuelve un
  error claro que apunta a `ais serve --tunnel` o a la app. Fue la opción más conservadora.
- **`tunnel_start` async con `spawn_blocking`**: los comandos sincrónicos de Tauri corren en el
  hilo principal, y esperar hasta 30 s ahí congelaría la UI. Lo mismo con `tunnel_stop`, que hace
  `taskkill /T /F`.
- **El switch del túnel refleja el estado real** (`remote.tunnel.enabled && tunnel.running`): si el
  proceso se cae solo, el switch vuelve a apagado y aparece "Reintentar", en vez de mostrar
  prendido algo que no funciona.
- **`lib.rs` pasó a `.build()` + `.run(callback)`** para poder matar el túnel en `RunEvent::Exit`
  (cubre tanto "Salir" desde la bandeja como el cierre normal).
- Se agregó `npm run release:check` también al workflow de release, no solo al de CI: si las
  versiones no coinciden es mejor fallar antes de compilar el instalador.

## Pendientes o dudas

- **El secret `TAURI_SIGNING_PRIVATE_KEY` hay que cargarlo a mano en el repo de GitHub** (contenido
  de `~/.tauri/ainess.key`). Sin eso el workflow de release falla al firmar. La clave pública ya
  está en `tauri.conf.json`.
- **El túnel no se pudo probar de punta a punta**: ni `cloudflared` ni `ngrok` están instalados en
  esta máquina. Lo que sí está testeado es el parsing de la URL de ambos (tests en Rust y en
  vitest) y el camino de error "no se encontró el binario". Cuando instales uno
  (`winget install Cloudflare.cloudflared`) conviene probar el flujo completo desde
  Configuración → Remoto.
- **El updater tampoco se pudo probar de verdad** porque todavía no hay ninguna release: el chequeo
  responde "Could not fetch a valid release JSON from the remote", que es lo esperado y se muestra
  como "No se pudo consultar: …". La primera release que publique Actions es la que va a validar el
  circuito.
- **CI corre en `windows-latest`** y usa `npm ci`: el `package-lock.json` quedó actualizado con
  `@tauri-apps/plugin-updater` y `@tauri-apps/plugin-process`.
- `README.md` ya tenía caracteres mal codificados de antes (títulos como "CÃ³mo correr"); las
  secciones nuevas se escribieron sin acentos para no empeorarlo, pero el archivo sigue mereciendo
  una pasada de arreglo de encoding en algún momento.
