# Informe — Plan 016: Bandeja del sistema + Configuración como modal

Repo: `C:\Users\matia\Desktop\projects\ais-wt-tray` (worktree, rama `feat/tray-settings`, sin cambiar de rama).

## Qué se hizo

### 1. Bandeja del sistema y notificaciones (backend Rust)
- `src-tauri/Cargo.toml`: feature `tray-icon` en `tauri`, dependencia `tauri-plugin-notification = "2"`.
- `src-tauri/src/tray.rs` (nuevo): `TrayState { enabled: AtomicBool }` (default `true`), comando
  `set_tray_enabled`, `setup_tray(app)` (icono + menú "Mostrar AIS"/"Salir", click izquierdo muestra
  la ventana) y `on_window_event` (con la bandeja prendida, `CloseRequested` oculta la ventana en
  vez de cerrarla; con la bandeja apagada, cierra como siempre).
- `src-tauri/src/lib.rs`: registra `mod tray`, `manage(TrayState::default())`, plugin de
  notificaciones, `setup_tray` en `.setup()`, `on_window_event`, y el comando `set_tray_enabled`.
- `src-tauri/capabilities/default.json`: agregado permiso `notification:default`.
- `npm install @tauri-apps/plugin-notification@^2` en el worktree.

### 2. Config (`src/types.ts`, `src/store.ts`)
- `AppConfig.version: 8`, nuevo campo `tray: { enabled, notifyApprovals, notifyResults }`.
- Migración a v8 en `runInit` (default: los tres switches prendidos); defaults actualizados en
  `generateSeedConfig` y en el literal inicial de `useAppStore`.
- `Transport.setTrayEnabled(enabled)` agregado a la interfaz y a las 3 implementaciones
  (tauri → `invoke("set_tray_enabled")`; null y node → no-op). Se invoca desde `store.updateConfig`
  cuando cambia `tray.enabled` (solo si `isTauri()`) y una vez al final de `runInit`.

### 3. Notificaciones del sistema (`src/hooks/useSystemNotifications.ts`, nuevo)
- Se suscribe al store; detecta aprobaciones nuevas en estado `pending` (diff contra un `Set`
  previo) y mensajes nuevos `kind === "result" && toAgentId === "user"` en **cualquier** proyecto
  (a diferencia de `useNotifications`, que solo mira el proyecto actual).
- Envía notificaciones vía `@tauri-apps/plugin-notification`, importado dinámicamente y solo dentro
  de `isTauri()` (nunca a nivel de módulo, para no romper `build:cli`). Pide permiso una sola vez
  por sesión; nunca lanza (try/catch + `console.warn`).
- Montado en `App.tsx` junto a `useActivityIsland`/`useNotifications`.

### 4. Configuración como modal
- `src/store.ts`: `screen` ahora es `"home" | "project"`; nuevo `settingsOpen: boolean` (no
  persistido) + `closeSettings()`; `SettingsSection` ampliada a `"general" | "agents" | "profile" |
  "presets" | "skills" | "mcp" | "hooks" | "context" | "remote"` (persistida, default `"general"`).
  `loadUiPrefs` sanea valores viejos (`"settings"` → se ignora, cae a `"home"`; `"resources"` →
  `"profile"`).
- `src/components/settings/SettingsDialog.tsx` (nuevo): `Dialog` con sidebar interno (9 secciones,
  iconos `lucide-react`) + panel de contenido con cabecera (nombre + ayuda) y cuerpo scrollable.
- `src/components/settings/GeneralSettings.tsx` (nuevo): card "Segundo plano" (3 switches de tray)
  + card "Orquestación" (`maxRounds` con `Input` numérico 1-20, `autoModel`, `approveDelegations`,
  movidos desde Perfil).
- `src/components/ResourcesPanel.tsx`: refactorizado a `ResourceSection({ section })`, que
  renderiza solo el contenido de esa sección (mismo JSX y diálogos que antes, sin `Tabs`). Perfil
  perdió los dos switches que se movieron a General.
- Borrado `src/components/shell/SettingsScreen.tsx`. `App.tsx` monta `<SettingsDialog/>` siempre,
  ya no hay rama `screen === "settings"`. `Sidebar.tsx`: el engranaje usa `settingsOpen` para
  resaltarse (seguía llamando `openSettings()`, sin cambios ahí).
- Atajo `Ctrl+,` en `App.tsx` abre Configuración.

### 5. `PLAN.md`
Actualizada la sección "UI" (navegación del store, sección 5 "Configuración" describiendo el modal
con sidebar) y agregada una sección nueva "Bandeja y notificaciones" con el detalle de Rust +
config `tray` + hook de notificaciones.

## Commits
- `1235b4a` — Add system tray, background notifications and config v8 with tray settings
- `9326ff7` — Update PLAN.md for the settings modal and tray/notifications feature

(No se hizo push, según indicación.)

## Verificación
Todo corrido desde `C:\Users\matia\Desktop\projects\ais-wt-tray`:
- `npx tsc --noEmit` → OK, sin errores.
- `npm test` → 3 archivos, 31 tests, todos pasan.
- `npm run build` → OK (`tsc && vite build`), solo warnings preexistentes de chunk size /
  dynamic-import inefectivo (no relacionados con este cambio).
- `npm run build:cli` → OK, sin importar `@tauri-apps/plugin-notification` a nivel de módulo.
- `cd src-tauri && cargo check` → `Finished` sin errores ni warnings nuevos.
- `grep -rn "SettingsScreen|screen === \"settings\""  src` → sin resultados (cumple el criterio del plan).
- Confirmado por `git diff` que `AgentsPanel.tsx`, `AgentDialog.tsx`, `src/lib/quota.ts`,
  `HierarchyGraph.tsx`, `CommunicationPanel.tsx` y `useActivityIsland.ts` quedaron intactos.
- No se corrió `npm run tauri dev` ni `npm run tauri build` (el plan pide explícitamente no correr
  `tauri dev`; `cargo check` ya valida que el binario compila).

## Decisiones tomadas
- `npm install` reemplazó el junction de `node_modules` del worktree por una carpeta real propia
  (necesario para instalar `@tauri-apps/plugin-notification` sin tocar el repo principal). Verifiqué
  que `node_modules` del repo principal (`ais/`) sigue intacto y que `node_modules` sigue ignorado
  por git en el worktree, así que no hay impacto en el control de versiones.
- `useSystemNotifications` truncó `approval.summary` a 200 caracteres y el cuerpo de "tarea
  terminada" a 150, como pide el plan; el prefijo del segundo usa `"{proyecto} · {agente}: "` solo
  cuando hay datos disponibles (si faltan projectId/fromAgentId, se omite el prefijo en vez de
  mostrar "undefined").
- En `runInit`, simplifiqué el cálculo de `screen` restaurado a `lastProjectValid ? "project" :
  "home"` (ya no hace falta comparar contra `"settings"`, que dejó de ser un valor válido de
  `Screen`).
- Agregué `DialogTitle` (visualmente igual al título "Configuración" que ya pedía el plan) dentro
  del `SettingsDialog` por accesibilidad de Radix — es consistente con el resto de los diálogos del
  proyecto, que ya usan `DialogTitle`, y no cambia el layout pedido.
- No se tocó `tauri.conf.json`: la ventana ya arranca visible por defecto, tal como pide el plan.

## Pendientes o dudas
- Ninguna. El plan se ejecutó completo; no quedaron ambigüedades que requirieran desviarse de lo
  especificado.
