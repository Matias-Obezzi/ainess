# Informe — 020 Terminales integradas en el panel derecho

## Qué se hizo

**Backend (Rust)**
- `src-tauri/Cargo.toml`: nueva dependencia `portable-pty = "0.9"`.
- `src-tauri/src/pty.rs` (nuevo): `PtyState { sessions: Mutex<HashMap<String, PtySession>> }` con
  `PtySession { master, writer, child }` y los comandos `pty_spawn(id, shell, cwd?, cols?, rows?)`,
  `pty_write(id, data)`, `pty_resize(id, cols, rows)`, `pty_kill(id)` y `pty_list_shells()`.
  Un hilo lector por sesión emite `pty-output { id, data }` y, al cerrarse el pipe, `pty-exit { id, code }`
  y quita la sesión del mapa. Todo spawn/exit/error pasa por `logging::append(..., "pty", ...)`.
- Detección de shells: en Windows `pwsh` (PATH + `%LOCALAPPDATA%\Microsoft\WindowsApps`),
  `powershell.exe` y `cmd.exe` bajo `%SystemRoot%\System32`, y Git Bash en `C:\Program Files\Git`
  o `%LOCALAPPDATA%\Programs\Git`; en otros SO `$SHELL`, `/bin/bash`, `/bin/sh`. Solo devuelve los
  que existen, `pwsh` primero.
- `src-tauri/src/lib.rs`: `mod pty`, `.manage(pty::PtyState::default())`, los cinco comandos en
  `invoke_handler` y `pty::shutdown(handle)` en `RunEvent::Exit` (también cubre "Salir" desde la bandeja).

**Transport y tipos**
- `src/types.ts`: `ShellInfo`, `TerminalTab`, `PtyOutputEvent`, `PtyExitEvent`.
- `src/lib/transport.ts`: `ptySpawn/ptyWrite/ptyResize/ptyKill/ptyListShells/onPtyOutput/onPtyExit`.
  Implementados con `invoke`/`listen` en `transport-tauri.ts`; en `transport-null.ts` y
  `transport-node.ts` `ptyListShells` devuelve `[]` y el resto tira
  "Las terminales solo están disponibles en la app de escritorio".

**Store (`src/store.ts`)**
- `termPanelOpen` y `dockSplit` (0.3–0.8, default 0.5) persistidos en `ais.ui`, con
  `toggleTermPanel(open?)` y `setDockSplit(value)` (clampeado). Constantes exportadas
  `MIN_DOCK_SPLIT`, `MAX_DOCK_SPLIT` y `MAX_TERMINALS = 8`.
- `terminals: TerminalTab[]`, `activeTerminalId`, `shells: ShellInfo[]` (cargados una vez en
  `runInit`, solo con `isTauri()`), con `openTerminal({ shellId?, cwd? })`, `closeTerminal`,
  `setActiveTerminal`, `renameTerminal` y `markTerminalExited`. Las terminales viven solo en memoria.

**UI**
- `src/components/shell/RightDock.tsx` (nuevo): el `<aside>` de 380px con las mismas reglas de
  flotado bajo 1100px. Con una sola sección abierta ocupa todo el alto; con las dos, columna con
  `CommDockSection` (alto `dockSplit`), divisor arrastrable de 6px (`cursor-row-resize`,
  `pointerdown/move/up` sobre `window`) y `TerminalDockSection`.
- `CommSidePanel.tsx` → renombrado a `CommDockSection.tsx` y convertido en un bloque
  `flex flex-col h-full` (ya no trae su propio `<aside>`); el contenido no cambió.
- `TerminalDockSection.tsx` (nuevo): cabecera "Terminales" con `+`, chevron con `DropdownMenu` de
  shells y botón cerrar; barra de pestañas scrolleable (icono, título, punto rojo si terminó, `X`
  al hover, doble click para renombrar inline); cuerpo con todos los `TerminalView` montados y solo
  el activo visible; `EmptyState` con CTA "Abrir terminal".
- `TerminalView.tsx` (nuevo): xterm 13px `Cascadia Code`, `FitAddon`, `ResizeObserver → fit() +
  ptyResize`, `onData → ptyWrite`, `ptySpawn` una sola vez. Copiar/pegar con `Ctrl+Shift+C` /
  `Ctrl+Shift+V` (`Ctrl+C` va al proceso). Si el spawn falla escribe el error en rojo y marca la
  pestaña como terminada.
- `src/lib/color.ts` (nuevo): `cssColorToHex`/`tokenColor` (canvas 1x1) para pasarle a xterm los
  tokens `--card`, `--foreground` y `--accent`, que son `oklch(...)`.
- `src/lib/pty-bus.ts` (nuevo): un único `listen` por app que despacha por id y bufferea lo que
  llega antes de que la vista se suscriba.
- `ProjectScreen.tsx`: botón "Terminal" (`TerminalSquare`, `secondary` si está abierto) al lado de
  "Comunicación"; abre una terminal si no hay ninguna. `App.tsx`: `RightDock` en lugar de
  `CommSidePanel`, visible con `(commPanelOpen || termPanelOpen) && screen === "project"`, y atajo
  `` Ctrl+` ``. `Composer.tsx`: el listener global de `Escape` ignora eventos dentro de `.xterm`.
- `PLAN.md`: sección "UI" actualizada (dock derecho con las dos secciones y el split) y sección
  nueva "Terminales" con comandos, eventos, shells y crate.

## Commits

| Hash | Mensaje |
| --- | --- |
| `b153902` | Integrated terminals in the right dock, with tabs and a split with Comunicación |
| `ea25c2e` | Never lose PTY output to a listener race, and document terminals in PLAN.md |
| `d56be3a` | Match Ctrl+backtick by key code so non-US layouts also toggle the terminals |

Sin `git push` (el plan y las instrucciones lo dejan fuera).

## Verificación

Todo corrido desde la raíz del repo, sobre el estado final:

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | OK, sin errores |
| `npm test` | OK, 4 archivos / 42 tests |
| `npm run build` | OK (`built in 3.94s`) |
| `npm run build:cli` | OK (`built in 93ms`) |
| `cd src-tauri && cargo check` | OK, sin warnings |

No se corrió `npm run tauri dev` (puerto 1420 ocupado), así que las terminales no se probaron
ejecutándose de verdad: la verificación es estática (typecheck, tests, builds, `cargo check`).

## Decisiones tomadas

- **Numeración de las pestañas**: el título es `<label del shell> <n>` contando cuántas pestañas de
  ese mismo shell hay abiertas ("PowerShell 1", "PowerShell 2", "cmd 1"). Si se cierra la 1 y se abre
  otra, el número se puede repetir; se prefirió esto a llevar un contador global que nunca baja.
- **`pty-bus.ts` extra al plan**: cada `TerminalView` iba a hacer su propio `listen`, pero `listen()`
  resuelve *después* de que el shell ya imprimió el prompt, y StrictMode desmonta y remonta el efecto,
  con lo que se perdía la primera salida. El bus attachea un solo par de listeners para toda la app y
  bufferea (hasta 256 KB) lo que llegue mientras no haya vista suscripta.
- **`CommSidePanel.tsx` renombrado a `CommDockSection.tsx`** (con `git mv`): el componente ya no es un
  panel lateral sino una sección del dock, y el plan pedía el nombre `CommDockSection`.
- **Tooltip del `+` deshabilitado**: el `Button` de shadcn lleva `disabled:pointer-events-none`, así
  que el `title` va en un `<span>` que lo envuelve. El chevron mantiene su `title` normal.
- **`Ctrl+``**: se acepta tanto `e.key === "`"` como `e.code === "Backquote"`, para teclados no US
  donde el backtick es tecla muerta.
- **Exit code**: `portable-pty` devuelve `u32`; se convierte a `i32` y los valores fuera de rango se
  reportan como `-1`. Un `pty_kill` deja `code: null` (la sesión ya no está en el mapa cuando el hilo
  lector la busca), pero para ese caso la pestaña ya se cerró.
- **`pty_resize` sobre una sesión muerta** devuelve `Ok(())` en vez de error: es una carrera normal
  con el `ResizeObserver` y no vale la pena mostrarla.
- **No se tocó** el CLI (más allá de los stubs obligatorios del `Transport`) ni la página remota, ni
  se agregaron dependencias fuera de `@xterm/xterm`, `@xterm/addon-fit` y `portable-pty`.

## Pendientes o dudas

- **Falta la prueba en vivo**: nadie ejecutó la app, así que queda por confirmar a mano que el prompt
  aparece, que el redimensionado del divisor recalcula bien las columnas y que la conversión
  `oklch → hex` da los colores esperados en el tema oscuro (hay fallback hardcodeado si el canvas no
  puede parsear el token).
- **Fuera de Windows el código de detección de shells no se probó** (como anticipaba el plan).
- El bundle del front creció (`dist/assets/index-*.js` pasa el warning de 500 KB, ahora ~1,09 MB sin
  gzip) porque xterm entra en el chunk principal. Si molesta, se puede cargar `TerminalView` con
  `React.lazy`; no se hizo para no desviarse del plan.
- `pty_list_shells` se llama una sola vez al arrancar: si el usuario instala Git Bash con la app
  abierta, no aparece hasta reiniciar.
