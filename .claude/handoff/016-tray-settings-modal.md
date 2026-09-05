# Bandeja del sistema con notificaciones y Configuración como modal con sidebar interno

Repo: C:\Users\matia\Desktop\projects\ais-wt-tray (worktree del repo, rama `feat/tray-settings`)
Rama: `feat/tray-settings` (ya activa en ese directorio; no cambiar de rama ni crear otras)

## Objetivo
1. La app queda en segundo plano en la bandeja del sistema (tray) al cerrar la ventana, y avisa con una
   notificación del sistema cuando un agente necesita permiso (aprobación pendiente) o termina una tarea.
   Configurable desde Configuración → General, **prendido por defecto**.
2. Configuración deja de ser una pantalla con pestañas y pasa a ser un **modal** (Dialog) con un sidebar
   interno de secciones: General, Agentes, Perfil, Órdenes, Skills, MCP, Hooks, Contexto, Remoto.

## Contexto
Leer `PLAN.md` y `CLAUDE.md` antes de empezar. Stack: Tauri 2 (Rust en `src-tauri/`) + React 19 + TS
estricto (`noUnusedLocals`) + Tailwind 4 + shadcn en `src/components/ui` (dialog, switch, input, label,
button, card, scroll-area, separator…). Iconos `lucide-react`. UI en español, código en inglés.
`node_modules` del worktree es un junction al del repo principal.

Cómo está hoy:
- `src-tauri/src/lib.rs`: `tauri::Builder` con plugins `opener` y `dialog`, `manage(RunnerState)`,
  `manage(RemoteState)`, `invoke_handler` con los comandos. `src-tauri/Cargo.toml`: `tauri = { version = "2",
  features = [] }`. `src-tauri/capabilities/default.json`: permisos `core:default`, `opener:default`,
  `dialog:default`. `src-tauri/tauri.conf.json`: una ventana `main` 1400x900. Iconos en `src-tauri/icons/`.
- `src/lib/tauri.ts` exporta `isTauri()`; `src/lib/transport-tauri.ts` usa `invoke` de `@tauri-apps/api/core`.
- `src/store.ts`: `AppConfig` versión 7 (`src/types.ts:131`), migraciones en `runInit` (líneas ~745-770:
  bloques `if ((config.version as number) < N)`), config por defecto en dos lugares (`generateSeedConfig` y el
  literal inicial de `useAppStore`, ambos con `version: 7`). Navegación de la shell: `screen: "home" |
  "project" | "settings"`, `settingsSection: "agents" | "resources"`, `openSettings(section?)`,
  persistidos en `localStorage` (`loadUiPrefs`/`saveUiPrefs`, clave `ais.ui`).
- `src/App.tsx`: `<Sidebar/>` + columna principal (`screen === "settings"` → `<SettingsScreen/>`) +
  `<CommSidePanel/>`; hooks `useActivityIsland` (puede que otro agente lo esté quitando en `main`; si al
  mergear falta, no pasa nada) y `useNotifications` (`src/hooks/useNotifications.ts`: toasts por
  delegación/error/resultado, solo del proyecto actual).
- `src/components/shell/SettingsScreen.tsx`: cabecera "Volver" + `Tabs` Agentes / Recursos.
  `src/components/shell/Sidebar.tsx:285`: el engranaje llama `openSettings()`.
- `src/components/AgentsPanel.tsx`: cards de agentes + Autodetectar + Nuevo agente (no tocar su contenido).
- `src/components/ResourcesPanel.tsx`: `Tabs` con 7 `TabsContent` (`profile` línea ~61 —incluye los switches
  `autoModel` y `approveDelegations`—, `presets` ~111, `skills` ~143, `mcp` ~175, `context` ~208, `remote`
  ~223 (`<RemotePanel/>`), `hooks` ~227) y sus diálogos (`SkillDialog`, `McpDialog`, `PresetDialog`,
  `HookDialog`).
- Aprobaciones: `store.approvals: Record<string, Approval>` (`Approval.status: "pending" | …`,
  `Approval.summary`), creadas en `src/lib/orchestrator.ts:520` (`requestApproval`). Resultado final de una
  tarea: `CommMessage` con `kind === "result"` y `toAgentId === "user"`.
- `config.maxRounds` se edita hoy en algún lado del panel de Recursos o no se edita (revisar con
  `grep -rn "setMaxRounds\|maxRounds" src/components`); `store.setMaxRounds(n)` existe.

Referencias de Tauri 2 (usar exactamente esto):
- Tray: `tauri = { version = "2", features = ["tray-icon"] }`. En `lib.rs`, dentro de `.setup(|app| { … })`:
  ```rust
  use tauri::{menu::{Menu, MenuItem}, tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState}, Manager};
  let show = MenuItem::with_id(app, "show", "Mostrar AIS", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&show, &quit])?;
  TrayIconBuilder::with_id("main")
      .icon(app.default_window_icon().unwrap().clone())
      .tooltip("AIS - Orquestador de agentes")
      .menu(&menu)
      .show_menu_on_left_click(false)
      .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => show_main_window(app),
          "quit" => app.exit(0),
          _ => {}
      })
      .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
              show_main_window(tray.app_handle());
          }
      })
      .build(app)?;
  ```
  con `fn show_main_window(app: &AppHandle) { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); } }`.
- Cerrar a la bandeja: `.on_window_event(|window, event| { if let tauri::WindowEvent::CloseRequested { api, .. } = event { let state = window.state::<TrayState>(); if state.enabled.load(Ordering::Relaxed) { api.prevent_close(); let _ = window.hide(); } } })`
  con `pub struct TrayState { pub enabled: AtomicBool }` (default `true`), `manage(TrayState::default())`, y un
  comando `#[tauri::command] fn set_tray_enabled(state: State<TrayState>, enabled: bool)` que el front invoca
  al cargar la config y cada vez que cambia el switch. Con la bandeja apagada, cerrar la ventana cierra la app
  como siempre (no hay `prevent_close`).
- Notificaciones: crate `tauri-plugin-notification = "2"` (`.plugin(tauri_plugin_notification::init())`),
  npm `@tauri-apps/plugin-notification` (instalar con `npm install @tauri-apps/plugin-notification@^2` desde
  el worktree; el junction hace que caiga en el `node_modules` del repo principal, está bien), permiso
  `notification:default` en `capabilities/default.json`. En JS:
  ```ts
  import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (granted) sendNotification({ title, body });
  ```
  Solo cuando `isTauri()`; en el CLI y en el preview del navegador no se importa el plugin (usar `import()`
  dinámico dentro del `if`).

## Cambios

### 1. Config (`src/types.ts`, `src/store.ts`)
- `AppConfig.version: 8` y nuevo campo `tray: { enabled: boolean; notifyApprovals: boolean; notifyResults: boolean }`.
- Migración a 8 en `runInit`: `tray: config.tray ?? { enabled: true, notifyApprovals: true, notifyResults: true }`,
  `isSeed = true`. Actualizar los dos literales por defecto (`generateSeedConfig` y el inicial) a versión 8 con
  `tray` prendido.
- Al final de `runInit` y en `updateConfig` cuando cambia `tray.enabled`: si `isTauri()`, `invoke("set_tray_enabled",
  { enabled })` (agregar `setTrayEnabled(enabled)` a `Transport`: tauri → invoke; node y null → no-op).

### 2. Rust (`src-tauri/`)
- `Cargo.toml`: feature `tray-icon` en `tauri`, dependencia `tauri-plugin-notification = "2"`.
- Nuevo `src-tauri/src/tray.rs`: `TrayState`, `set_tray_enabled`, `show_main_window`, `setup_tray(app)`
  (el bloque de arriba) y `on_window_event` handler. `lib.rs`: `mod tray`, `manage(TrayState::default())`,
  `.plugin(tauri_plugin_notification::init())`, `.setup(|app| { tray::setup_tray(app)?; Ok(()) })`,
  `.on_window_event(tray::on_window_event)`, registrar `tray::set_tray_enabled`.
- `capabilities/default.json`: agregar `"notification:default"`.
- La ventana arranca visible como siempre (no arrancar minimizada a la bandeja).

### 3. Notificaciones del sistema (`src/hooks/useSystemNotifications.ts`, nuevo; montarlo en `App.tsx`)
Suscripción al store (`useAppStore.subscribe`) que compara con el estado anterior:
- Aprobación nueva (`approvals` con `status === "pending"` que no existía antes) y `config.tray.notifyApprovals`
  → notificación `title: "AIS: un agente necesita tu permiso"`, `body: approval.summary` (max 200 chars).
- Mensaje nuevo `kind === "result" && toAgentId === "user"` y `config.tray.notifyResults` → `title: "AIS: tarea
  terminada"`, `body: "{nombre del proyecto} · {nombre del agente}: {texto truncado a 150}"`.
- Emitir siempre (aunque la ventana esté visible): es lo que el usuario pidió para no perderse pedidos de
  permiso. Nunca lanzar: envolver en try/catch y loguear con `console.warn`.
- Reutilizar la lógica de "mensajes nuevos" de `useNotifications.ts` (id del último procesado) pero sin el
  filtro por proyecto actual.

### 4. Configuración como modal (`src/components/settings/SettingsDialog.tsx`, nuevo)
- Store: reemplazar `screen: "settings"` por `settingsOpen: boolean` (no persistido) y ampliar
  `SettingsSection` a `"general" | "agents" | "profile" | "presets" | "skills" | "mcp" | "hooks" | "context" |
  "remote"` (persistida en `ais.ui`, default `"general"`). `openSettings(section?)` → `settingsOpen: true` (+
  sección si viene); nueva `closeSettings()`. `Screen` queda `"home" | "project"`; `loadUiPrefs` sanea valores
  viejos ("settings" → "home"; "agents"/"resources" siguen valiendo, "resources" → "profile").
- `SettingsDialog`: `Dialog open={settingsOpen} onOpenChange={o => !o && closeSettings()}` con
  `DialogContent className="p-0 gap-0 w-[92vw] max-w-6xl h-[85vh] overflow-hidden"` y adentro un `flex h-full`:
  - Sidebar interno (w-56, `bg-muted/40 border-r`): título "Configuración" arriba y una lista de botones, uno
    por sección, con icono y label (General `Settings2`, Agentes `Bot`, Perfil `User`, Órdenes `ListChecks`,
    Skills `Sparkles`, MCP `Plug`, Hooks `Webhook`, Contexto `FileText`, Remoto `Smartphone`); el activo con
    `bg-accent text-accent-foreground`.
  - Contenido (`flex-1 min-w-0 flex flex-col`): cabecera con el nombre de la sección y una línea de ayuda
    (muted), y el cuerpo con `overflow-y-auto p-6`.
- Contenido por sección:
  - General (`src/components/settings/GeneralSettings.tsx`, nuevo): card "Segundo plano" con tres `Switch`:
    "Seguir en la bandeja al cerrar la ventana" (`tray.enabled`), "Notificar cuando un agente necesita permiso"
    (`tray.notifyApprovals`), "Notificar cuando termina una tarea" (`tray.notifyResults`), con texto de ayuda
    ("Con esto apagado, cerrar la ventana cierra la app"). Card "Orquestación": `maxRounds` (Input numérico 1-20,
    `store.setMaxRounds`), switch `approveDelegations` y switch `autoModel` (moverlos acá desde Perfil, con
    sus textos de ayuda actuales). Todo guarda al instante con `updateConfig`.
  - Agentes: `<AgentsPanel/>` (sin cambios).
  - Perfil / Órdenes / Skills / MCP / Hooks / Contexto / Remoto: refactorizar `ResourcesPanel.tsx` para que
    exporte `ResourceSection({ section })` que renderiza **solo** el contenido del `TabsContent` correspondiente
    (mismo JSX, mismos diálogos y estado; quitar `Tabs`/`TabsList`; los diálogos pueden quedar montados en
    cada sección que los usa). Perfil pierde los switches `autoModel`/`approveDelegations` (van a General).
- Borrar `src/components/shell/SettingsScreen.tsx`; `App.tsx` monta `<SettingsDialog/>` siempre (fuera de la
  columna principal) y ya no tiene rama `screen === "settings"`. El engranaje del sidebar sigue llamando
  `openSettings()` y se resalta con `settingsOpen`.
- Atajo: `Ctrl+,` abre Configuración (listener en `App.tsx`).

### 5. `PLAN.md`
Actualizar la sección "UI": Configuración es un modal con sidebar interno (listar secciones), y agregar una
sección corta "Bandeja y notificaciones" (feature `tray-icon`, `TrayState`, `set_tray_enabled`, plugin
notification, config `tray`).

## Casos borde y decisiones ya tomadas
- Con `tray.enabled` apagado, cerrar la ventana cierra la app. Con la app oculta en la bandeja, click
  izquierdo en el icono o "Mostrar AIS" la vuelve a mostrar; "Salir" cierra de verdad (`app.exit(0)`), y ese
  cierre también corta los procesos hijos como pasa hoy al cerrar.
- Si el sistema niega el permiso de notificaciones, no insistir (una sola `requestPermission` por sesión).
- El CLI (`npm run build:cli`) importa el store: nada de importar `@tauri-apps/plugin-notification` a nivel
  de módulo en archivos que el CLI use; solo `import()` dinámico dentro de `if (isTauri())`.
- No tocar `AgentsPanel.tsx`, `AgentDialog.tsx`, `src/lib/quota.ts`, `HierarchyGraph.tsx`,
  `CommunicationPanel.tsx` ni `useActivityIsland.ts` (otro agente los está tocando en `main`).
- No agregar otras dependencias que `@tauri-apps/plugin-notification`.
- No correr `npm run tauri dev` (el puerto 1420 está ocupado por la app del usuario): verificar con
  `cargo check` y los builds.

## Fuera de alcance
- Click en la notificación que abra la ventana (Windows no lo soporta de forma simple desde el plugin).
- Cambios en la página remota, el CLI o el protocolo de delegación.

## Verificación
Desde `C:\Users\matia\Desktop\projects\ais-wt-tray`, todo tiene que pasar:
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
cd src-tauri && cargo check
```
Y `grep -rn "SettingsScreen\|screen === \"settings\"" src` no debe devolver nada.
