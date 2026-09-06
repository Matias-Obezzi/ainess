# 037 — Atajos, paleta con tareas y diagnóstico del sistema

Repo: `C:\Users\matia\Desktop\projects\ais-wt-tools` (worktree, rama `feat/tools`). Sin push.

## Qué se hizo

### 1. Ventana de atajos (Ctrl+/)

- `src/lib/shortcuts.ts`: la tabla única. `SHORTCUTS` (`{ id, keys, descriptionKey, group, global }`),
  `SHORTCUT_GROUPS` (`general | project | composer | terminal`), `matchesShortcut`,
  `resolveGlobalShortcut`, `formatShortcut(keys, platform)` (Ctrl en Windows/Linux, ⌘ ⌥ ⇧ en macOS),
  `shortcutPlatform()` y `shortcutCombo()` (para el test de colisiones).
- `src/App.tsx`: el listener global ya no tiene el `if/else` de teclas; resuelve el atajo desde la
  tabla y despacha por `id`. Efecto lateral bueno: ahora Ctrl+Shift+K ya no dispara la paleta (antes
  el handler no miraba `shiftKey`).
- `src/components/shell/ShortcutsDialog.tsx`: diálogo con los atajos agrupados, cada tecla en su
  `<kbd>` en una columna de ancho fijo y la explicación a la derecha. Se abre con Ctrl+/
  (`shortcutsOpen` / `toggleShortcuts` en el store) o desde la paleta.
- El manejo de teclas del composer y del terminal quedó donde estaba, con un comentario que apunta a
  la tabla (`Composer.tsx`, `lib/terminal-registry.ts`).

### 2. La paleta encuentra tareas

`src/components/shell/SearchPalette.tsx` ahora tiene seis grupos (proyectos, **tareas**, chats,
agentes, configuración, **acciones**):

- Tareas del proyecto actual, por título, sin acentos ni mayúsculas. Al elegir una:
  `openProject(projectId, null)` + `setProjectMode("tasks")` + `focusTask(id)`. `TasksView` consume
  ese pedido y lo limpia (store: `focusedTaskId` / `focusTask`), así cerrar el detalle no lo reabre.
- Acción "Crear tarea: «lo tipeado»" cuando hay texto, hay proyecto actual y ninguna tarea coincide
  exacto; la crea en `backlog` y abre su detalle.
- Acción "Atajos de teclado", que abre el diálogo del punto 1.
- El placeholder de la paleta ahora nombra las tareas, en los siete idiomas.

### 3. Diagnóstico del sistema

- `src/lib/diagnostics.ts`: seis chequeos que devuelven `{ id, level, title, detail, hint? }` —
  `clis`, `quota`, `remote`, `tunnel`, `logs`, `data`. Cada `check*(input, t)` es **puro** (recibe un
  `DiagnosticsInput` ya recolectado y un traductor con la firma de `useT()`), y
  `collectDiagnosticsInput()` es la única parte con I/O. `worstLevel` y `formatDiagnosticsReport`
  completan la API.
- `src/components/settings/DiagnosticsSection.tsx` + sección `diagnostics` en `SETTINGS_SECTIONS`
  (grupo "Aplicación", icono `Stethoscope`), con "Volver a chequear" y "Copiar informe" y un resumen
  `N bien · N avisos · N errores`.
- Dos comandos Rust nuevos en `src-tauri/src/diagnostics.rs` (registrados en `lib.rs`) y sus métodos
  de `Transport` (`storageStat`, `portAvailable`), implementados en el transport de Tauri y en el de
  node; en el del navegador y en el del celular devuelven `null`.
  - `storage_stat(scope, relative_path?)` → `{ path, exists, writable, files, bytes }`. No crea
    carpetas, camina como mucho 4 niveles y prueba la escritura con un `.ainess-write-check` que
    borra enseguida.
  - `port_available(port)` → `bool`.

### 4. `ais doctor`

`ais doctor [--json]` corre los mismos chequeos, imprime el informe en español y termina con código
1 si hay algún error. Está en `KNOWN` y en el texto de ayuda.

### Seguridad (tokens y claves)

- `DiagnosticsInput` **no puede** llevar credenciales: de ngrok solo viajan `hasAuthtoken` y
  `hasApiKey`; el servidor remoto se reporta como `ip:puerto`, nunca con `remoteStatus.url` (que
  lleva el token).
- `runDiagnostics` pasa `detail` y `hint` de todos los chequeos por `maskSecrets`, y
  `formatDiagnosticsReport` lo vuelve a hacer sobre el texto entero. Hay un test que lo cubre.

### Traducciones

67 claves nuevas en los **siete** diccionarios (`es en pt zh ja fr de`), con las mismas claves y en
el mismo orden, más el `search.placeholder` reescrito. Verificado con un script y con un test nuevo
en `src/lib/__tests__/i18n.test.ts` ("declares the keys in the same order in every language").
Total: 862 claves por idioma, sin duplicados. El CLI queda en español
(`translate(es, es, key, vars)`); el código y los comentarios, en inglés.

## Commits

| Commit | Mensaje |
|---|---|
| `93822fa` | Shortcuts live in one table, and the diagnostics checks get a home |
| `67c6d2f` | The palette finds tasks and the diagnostics get their own settings section |
| `88fa6a9` | ais doctor prints the same checks, and the checks learn where they run |
| `1362003` | Document the shortcut table, the diagnostics and ais doctor in PLAN.md |
| `4d53a99` | Mask every diagnostic result, and write the handoff report |

## Verificación

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | sin errores |
| `npm test` | 20 archivos, 253 tests, todo verde (36 de diagnostics, 17 de shortcuts, 14 de i18n) |
| `npm run build` | ok |
| `npm run build:cli` | ok |
| `cd src-tauri && cargo check` | ok |
| paridad de los 7 diccionarios | mismas claves, mismo orden, sin duplicados (862) |
| `node bin/ais.js doctor` | informe completo, exit 0; con un error, exit 1 |
| `node bin/ais.js doctor --json` | array JSON de los seis chequeos |
| App en el navegador (`vite`) | Ctrl+/ abre el diálogo y Escape lo cierra; la paleta encuentra y ejecuta "Atajos de teclado"; Configuración → Diagnóstico muestra los seis chequeos, todos como aviso con su motivo (sin backend), ningún error |

Tests obligatorios del plan, todos escritos: colisiones en la tabla de atajos (por grupo y entre los
globales), formato de teclas por plataforma, matching por plataforma y por `code`, los seis chequeos
puros con sus casos borde, el enmascarado, y la paridad de claves entre los siete diccionarios.

## Decisiones tomadas (donde el plan dejaba margen)

1. **Un chequeo de "acceso remoto" que no puede correr acá avisa, no falla.** El servidor LAN vive
   dentro de la app (o dentro de `ais serve`), así que un `ais doctor` suelto nunca lo va a ver
   corriendo. En vez de reportar error siempre que `remote.enabled` esté prendido, el input lleva
   `canObserveRemote` (`isTauri()`): en la app es error, en el CLI es aviso con el motivo.
2. **Dos comandos Rust nuevos** (`storage_stat`, `port_available`). El tamaño de una carpeta y si un
   puerto está libre no se podían averiguar con los comandos que ya había. Sin dependencias nuevas.
3. **Cuota sin agentes = ok, no aviso.** No tener agentes configurados no es un problema del sistema.
4. **La carpeta de logs que todavía no existe es aviso, no error**, y el diagnóstico no la crea: es
   de solo lectura.
5. **La paleta busca tareas solo del proyecto actual** (lo que pide el plan): un título de tarea no
   dice a qué proyecto pertenece, y mostrar tareas de todos mezcladas sería ruido.
6. **`SearchPalette.tsx` sigue con su propia lista de secciones de Configuración** (no importa
   `SETTINGS_SECTIONS` de `SettingsDialog.tsx`), como estaba: se agregó `diagnostics` en las dos.
   Unificarlas es un cambio aparte.
7. **Los contadores de "Datos" cargan el historial y el tablero de cada proyecto desde disco** antes
   de contar, porque un proceso nuevo (el CLI) no los tiene en memoria. En la app eso puede disparar
   el guardado con debounce de esos mismos archivos (contenido idéntico); en el CLI no, porque el
   proceso termina antes del timer. Es el único efecto observable de un diagnóstico.
8. **Las versiones de los CLIs se muestran sin el punto final** que algunas (`copilot`) traen, para
   que la oración no termine en "..".
9. **"N archivos" usa `plural()`** (claves `diagnostics.files.one/other`) y el resumen de datos se
   escribe con etiquetas (`Proyectos: 1 · Agentes: 3 · …`) para no tener que resolver la concordancia
   de cuatro números en siete idiomas.

## Pendientes / fuera de alcance

- No se tocó `src/remote/**` (vista del celular): la sección de Diagnóstico es solo de escritorio.
- No se probó la app compilada (`npm run tauri dev`), solo `cargo check` y el preview del navegador.
  Los caminos que dependen de Tauri (`storage_stat`, `port_available`) se verificaron en su versión
  de node, vía `ais doctor`.
- `SearchPalette.tsx` y `SettingsDialog.tsx` mantienen dos listas de secciones en paralelo.
- Sin `git push`, como pide el handoff.
