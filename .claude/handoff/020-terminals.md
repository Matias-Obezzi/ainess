# Terminales integradas en el panel derecho, con pestañas, compartiendo el dock con Comunicación

Repo: C:\Users\matia\Desktop\projects\ais (único repo)
Rama: la que esté activa (`main`), sin cambiar de rama ni crear otras

## Objetivo
1. La app puede abrir terminales reales (PowerShell por defecto; también cmd y Git Bash) dentro del panel
   derecho, con varias pestañas a la vez, nueva pestaña con la carpeta del proyecto actual como cwd.
2. El panel derecho ("dock") aloja dos secciones: **Comunicación** (arriba) y **Terminales** (abajo). Si solo
   una está abierta ocupa todo el alto; si están las dos, se reparten el alto con un divisor arrastrable.
3. Se abre/cierra desde un botón "Terminal" en la barra del proyecto (al lado de "Comunicación") y con el
   atajo `` Ctrl+` ``.

## Contexto
Leer `PLAN.md` ("UI") antes de empezar. Stack: Tauri 2 (Rust) + React 19 + TS estricto (`noUnusedLocals`) +
Tailwind 4 + shadcn (`src/components/ui`: button, dropdown-menu, tooltip…). Iconos `lucide-react`. UI en
español, código en inglés. Hay logging (`src/lib/logger.ts` → `log.info/warn/error(source, …)`; Rust
`logging::append`): usarlo para spawn/exit/errores de las terminales.

Cómo está hoy:
- `src/App.tsx:76`: `{commPanelOpen && screen === "project" && <CommSidePanel />}` a la derecha de la columna
  principal. `src/components/shell/CommSidePanel.tsx`: `<aside>` de 380px con cabecera (título, subtítulo,
  botón cerrar) y `<CommunicationPanel/>`; bajo 1100px flota (`max-[1100px]:absolute …`).
- `src/components/shell/ProjectScreen.tsx`: barra superior con badge "N trabajando", toggle Chat/Jerarquía y
  botón "Comunicación" (`PanelRight`, `toggleCommPanel`).
- Store (`src/store.ts`): `commPanelOpen` + `toggleCommPanel(open?)`, persistido en `localStorage` `ais.ui`
  (`loadUiPrefs`/`saveUiPrefs`); atajos globales en `App.tsx` (`Ctrl+,`, `Ctrl+K`, `Ctrl+B`).
- Transport (`src/lib/transport.ts` + `transport-tauri.ts` (invoke/listen de `@tauri-apps/api`),
  `transport-node.ts` (CLI), `transport-null.ts` (preview)). Rust `src-tauri/src/runner.rs` es el ejemplo de
  proceso con salida en streaming: `app.emit("run-output", {...})` desde un hilo lector; `lib.rs` registra
  comandos y `manage(...)` de estados.
- `src/index.css`: tokens `--background`, `--card`, `--foreground`, `--muted-foreground`, `--border`…
  (oklch), scrollbars finas globales.
- Shells disponibles en esta máquina: `pwsh.exe` (`C:\Users\matia\AppData\Local\Microsoft\WindowsApps\pwsh.exe`),
  `powershell.exe`, `cmd.exe`, Git Bash (`C:\Program Files\Git\bin\bash.exe`).

Referencias (usar exactamente esto):
- Front: `@xterm/xterm` + `@xterm/addon-fit` (instalar con `npm install @xterm/xterm @xterm/addon-fit`;
  importar `@xterm/xterm/css/xterm.css` en el componente). `new Terminal({ fontFamily: "Cascadia Code,
  Consolas, monospace", fontSize: 13, cursorBlink: true, theme: {...} })`, `terminal.loadAddon(fit)`,
  `terminal.open(el)`, `fit.fit()`, `terminal.onData(d => ptyWrite(id, d))`, `terminal.onResize(({cols, rows})
  => ptyResize(id, cols, rows))`, `terminal.write(data)`; `ResizeObserver` sobre el contenedor → `fit.fit()`.
  Tema desde los tokens: leer `getComputedStyle(document.documentElement)` de `--card`/`--foreground` y pasar
  `background`/`foreground` (xterm acepta cualquier color CSS que el canvas entienda: convertir oklch a hex con
  un canvas 1x1 (`ctx.fillStyle = valor; ctx.fillStyle` devuelve `#rrggbb`) o usar un helper `cssColorToHex`).
- Rust: crate `portable-pty = "0.9"` (ConPTY en Windows). Patrón:
  ```rust
  use portable_pty::{native_pty_system, CommandBuilder, PtySize};
  let pair = native_pty_system().openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })?;
  let mut cmd = CommandBuilder::new(shell_path); cmd.cwd(cwd); cmd.env("TERM", "xterm-256color");
  let child = pair.slave.spawn_command(cmd)?;              // guardar para kill/wait
  let mut reader = pair.master.try_clone_reader()?;        // hilo: leer chunks y emitir "pty-output" {id, data}
  let writer = pair.master.take_writer()?;                 // guardar para pty_write
  // resize: pair.master.resize(PtySize{..})
  ```
  Emitir la salida como `String::from_utf8_lossy(&buf[..n])` (o base64 si preferís no perder bytes; el
  front hace `terminal.write`). Al terminar el proceso, emitir `"pty-exit"` `{ id, code }`.

## Cambios

### 1. Rust (`src-tauri/src/pty.rs`, nuevo)
- `PtyState { sessions: Mutex<HashMap<String, PtySession>> }` con `PtySession { master: Box<dyn MasterPty +
  Send>, writer: Box<dyn Write + Send>, child: Box<dyn Child + Send + Sync> }`.
- Comandos: `pty_spawn(id, shell, cwd, cols, rows) -> Result<(), String>` (valida que `shell` exista; si `cwd`
  no existe usa el home), `pty_write(id, data: String)`, `pty_resize(id, cols, rows)`, `pty_kill(id)`,
  `pty_list_shells() -> Vec<{ id, label, path }>` (busca `pwsh.exe` en PATH/WindowsApps, `powershell.exe`,
  `cmd.exe`, Git Bash en `C:\Program Files\Git\bin\bash.exe` y `%LOCALAPPDATA%\Programs\Git\bin\bash.exe`;
  devuelve solo los que existen, con `pwsh` primero).
- Hilo lector por sesión: `app.emit("pty-output", { id, data })`; al salir `app.emit("pty-exit", { id, code })`
  y quita la sesión. `Cargo.toml`: `portable-pty = "0.9"`. `lib.rs`: `manage(PtyState::default())` + comandos.
  Al cerrar la app (tray "Salir" → `app.exit`): matar todas las sesiones (hook en `on_window_event` Destroyed o
  en `RunEvent::Exit`).

### 2. Transport
`Transport`: `ptySpawn(opts: { id, shell, cwd, cols, rows })`, `ptyWrite(id, data)`, `ptyResize(id, cols,
rows)`, `ptyKill(id)`, `ptyListShells()`, `onPtyOutput(h: (e: { id, data }) => void): Promise<() => void>`,
`onPtyExit(h: (e: { id, code }) => void)`. Tauri → invoke/listen; node y null → `ptyListShells` devuelve `[]`
y el resto lanza `new Error("Las terminales solo están disponibles en la app de escritorio")`. Tipos en
`src/types.ts` (`ShellInfo`, `TerminalTab`).

### 3. Store
- `termPanelOpen: boolean` (persistido en `ais.ui`), `toggleTermPanel(open?)`; `dockSplit: number` (0.3–0.8,
  fracción del alto para Comunicación, default 0.5, persistido).
- `terminals: TerminalTab[]` (`{ id, title, shellId, shellPath, cwd, projectId: string | null, exited?: number
  | null }`), `activeTerminalId: string | null`, `shells: ShellInfo[]` (cargados una vez con
  `ptyListShells()` en `runInit` solo si `isTauri()`).
- Acciones: `openTerminal(opts?: { shellId?, cwd? })` (cwd por defecto: workspace del proyecto actual;
  título "PowerShell 1", "cmd 2", …; abre el panel y activa la pestaña), `closeTerminal(id)` (`ptyKill` + quita;
  si era la activa pasa a la vecina; si no queda ninguna el panel queda abierto con estado vacío),
  `setActiveTerminal(id)`, `renameTerminal(id, title)`, `markTerminalExited(id, code)`.
- Las terminales viven solo en memoria (no se persisten entre reinicios).

### 4. UI
- `src/components/shell/RightDock.tsx` (nuevo, reemplaza el uso directo de `CommSidePanel` en `App.tsx`):
  `<aside>` de 380px (mismas reglas de flotado bajo 1100px) que muestra:
  - solo Comunicación → `<CommSidePanel/>` (sin el `<aside>` propio: convertirlo en un bloque `flex flex-col
    h-full` reutilizable, `CommDockSection`),
  - solo Terminales → `<TerminalDockSection/>`,
  - ambas → columna con `CommDockSection` (alto `dockSplit`), un divisor horizontal de 6px (`cursor-row-resize`,
    `hover:bg-accent`; arrastre con `pointerdown/move/up` que actualiza `dockSplit` con límites) y
    `TerminalDockSection` (resto).
  Se muestra si `(commPanelOpen || termPanelOpen) && screen === "project"`.
- `src/components/shell/TerminalDockSection.tsx`: cabecera con título "Terminales", barra de pestañas
  scrolleable horizontal (cada tab: icono `TerminalSquare`, título, punto rojo si `exited`, botón `X` al
  hover; doble click renombra inline), botón `+` (nueva con el shell por defecto) con `DropdownMenu` al lado
  (chevron) para elegir shell, y botón cerrar panel (`toggleTermPanel(false)`). Cuerpo: un
  `<TerminalView terminal={tab}/>` por pestaña, montados todos pero solo el activo visible (`hidden` en los
  demás, y `fit()` al volver a mostrarse) para que no pierdan el scrollback. Estado vacío con CTA "Abrir
  terminal".
- `src/components/shell/TerminalView.tsx`: monta xterm, hace `ptySpawn` una sola vez (`useEffect` con ref de
  "spawned"), suscribe `onPtyOutput`/`onPtyExit` filtrando por `id`, `ResizeObserver` → `fit()` + `ptyResize`,
  `onData` → `ptyWrite`. Al desmontar: solo desuscribe (el kill lo hace `closeTerminal`). Cuando la sesión
  termina escribe "\r\n[proceso terminado con código N]" y marca `exited`.
- `ProjectScreen.tsx`: botón "Terminal" (`TerminalSquare`, variant secondary si `termPanelOpen`) junto a
  "Comunicación". `App.tsx`: atajo `` Ctrl+` `` → `toggleTermPanel()` y, si se abre y no hay ninguna, `openTerminal()`.
- Tema: fondo `--card`, texto `--foreground`, cursor `--foreground`, selección `--accent`. Fuente 13px.
- `Escape` dentro de la terminal NO debe disparar el "detener" global del `Composer` (el listener global de
  Escape en `Composer.tsx` tiene que ignorar eventos cuyo target esté dentro de `.xterm`).

### 5. `PLAN.md`
Sección "UI": dock derecho con Comunicación + Terminales (split), y una sección "Terminales" con los
comandos `pty_*`, eventos `pty-output`/`pty-exit`, shells detectados y el crate usado.

## Casos borde y decisiones ya tomadas
- Windows solamente para los shells listados; en otros SO `pty_list_shells` devuelve `$SHELL`/`/bin/bash` si
  existen (código pero sin probar).
- Pegar con `Ctrl+Shift+V` y copiar selección con `Ctrl+Shift+C` (xterm: `attachCustomKeyEventHandler`);
  `Ctrl+C` va al proceso.
- Si `pty_spawn` falla (shell inexistente), la pestaña muestra el error en rojo y queda `exited`.
- Máximo 8 terminales abiertas; el `+` se deshabilita con tooltip.
- No tocar el CLI ni la página remota. Sin más dependencias que `@xterm/xterm`, `@xterm/addon-fit` y
  `portable-pty`.

## Fuera de alcance
- Persistir terminales entre reinicios; terminales por proyecto en el sidebar; búsqueda dentro de la terminal.

## Verificación
Desde la raíz del repo:
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
cd src-tauri && cargo check
```
No correr `npm run tauri dev` (puerto 1420 ocupado por la app del usuario).
