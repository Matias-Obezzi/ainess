# Barra de ventana propia, sidebar colapsable, navegación atrás/adelante, búsqueda, scrollbars custom y nombre "ainess"

Repo: C:\Users\matia\Desktop\projects\ais-wt-chrome (worktree del repo, rama `feat/window-chrome`)
Rama: `feat/window-chrome` (ya activa en ese directorio; no cambiar de rama ni crear otras)

## Objetivo
1. La app tiene una barra de título propia (sin decoraciones nativas): a la izquierda botón para colapsar el
   sidebar principal, botones Buscar, Atrás y Adelante; en el centro el nombre "ainess"; a la derecha los
   controles de ventana (minimizar, maximizar/restaurar, cerrar). Se puede arrastrar la ventana desde la barra.
2. El sidebar principal se colapsa/expande (estado persistido).
3. Atrás/Adelante navegan por el historial de pantallas (inicio, proyecto+chat, modo).
4. Buscar abre una paleta (Ctrl+K) que busca proyectos, chats, agentes y secciones de Configuración.
5. Todas las barras de scroll de la app son finas y discretas, estilo app de Claude.
6. La app pasa a llamarse **ainess** (nombre visible, título de ventana, productName, sidebar, página remota,
   ayuda del CLI). El identificador `com.matias.ais` NO cambia (es la carpeta de config).

## Contexto
Leer `PLAN.md` ("UI", "Bandeja y notificaciones") antes de empezar. Stack: Tauri 2 + React 19 + TS estricto +
Tailwind 4 + shadcn (`src/components/ui`: button, dialog, input, tooltip, scroll-area, separator, badge…).
Iconos `lucide-react`. UI en español, código en inglés. `@tauri-apps/api` ya está instalado.

Cómo está hoy:
- `src/App.tsx`: `div.h-screen.flex` → `<Sidebar/>` + columna principal (`screen === "home"` → `HomeScreen`,
  `"project"` → `ProjectScreen`) + `<CommSidePanel/>` + `<SettingsDialog/>` + `Island` + `Toaster`; hooks
  `useNotifications`, `useSystemNotifications`; atajo `Ctrl+,` abre Configuración.
- `src/components/shell/Sidebar.tsx`: 260px, cabecera con "AIS" (línea ~128), Inicio, Nuevo proyecto,
  árbol de proyectos/chats, pie con "N trabajando" + engranaje.
- Store (`src/store.ts`): `screen: "home" | "project"`, `currentProjectId`, `currentChatId`, `projectMode`,
  `commPanelOpen`, `settingsOpen`, `settingsSection`, `sidebarCollapsed` (por proyecto, en el árbol),
  acciones `openHome`, `openProject(projectId, chatId?)`, `openSettings(section?)`, `setProjectMode`;
  prefs en `localStorage` `ais.ui` (`loadUiPrefs`/`saveUiPrefs`).
- `src-tauri/tauri.conf.json`: `productName: "ais"`, ventana `main` con `title: "AIS - Orquestador de
  agentes"`, 1400x900, min 1000x650. `src-tauri/capabilities/default.json`: `core:default`,
  `opener:default`, `dialog:default`, `notification:default`.
- `src-tauri/src/tray.rs`: al cerrar la ventana (`CloseRequested`) la oculta a la bandeja si está habilitado.
- `src/index.css`: Tailwind 4, tokens en `:root`/`.dark`, `@layer base` con border/body.
- `src/remote/remote.html` (título "AIS"), `src/cli/main.ts` (ayuda "Uso: ais …"; el comando `ais` se
  mantiene), `README.md`, `index.html` (`<title>`).
- `src/lib/tauri.ts` exporta `isTauri()`.

Referencias Tauri 2 (usar exactamente esto):
- `tauri.conf.json` → ventana: `"decorations": false`. Para que los bordes/resize sigan funcionando en Windows
  no hace falta nada más.
- Arrastre: el elemento de la barra lleva el atributo `data-tauri-drag-region` (los botones adentro NO lo
  llevan, así reciben el click). Doble click en la zona de arrastre maximiza (comportamiento por defecto de
  Tauri con `data-tauri-drag-region`).
- Controles: `import { getCurrentWindow } from "@tauri-apps/api/window"`; `getCurrentWindow().minimize()`,
  `.toggleMaximize()`, `.close()` (dispara `CloseRequested`, así que respeta la bandeja), `.isMaximized()`
  y `.onResized(cb)` para actualizar el icono maximizar/restaurar.
- Permisos en `capabilities/default.json`: `"core:window:allow-minimize"`, `"core:window:allow-maximize"`,
  `"core:window:allow-unmaximize"`, `"core:window:allow-toggle-maximize"`, `"core:window:allow-close"`,
  `"core:window:allow-start-dragging"`, `"core:window:allow-is-maximized"`.
- Fuera de Tauri (`!isTauri()`, preview en navegador) los controles de ventana no se muestran.

## Cambios

### 1. Barra de título (`src/components/shell/TitleBar.tsx`, nuevo)
`h-10` fija arriba de todo (`App.tsx` pasa a `div.h-screen.flex.flex-col` → `<TitleBar/>` + `div.flex-1.flex`
con sidebar/main/comm). `bg-card border-b`, `data-tauri-drag-region` en el contenedor y en el título.
- Izquierda (`flex gap-1 px-2`): botón `PanelLeft` (toggle sidebar; tooltip "Mostrar/ocultar sidebar"), botón
  `Search` (abre la paleta; tooltip "Buscar (Ctrl+K)"), `ChevronLeft` / `ChevronRight` (atrás/adelante;
  `disabled` cuando no hay historial). Botones `ghost`, `size="icon"`, `h-7 w-7`.
- Centro: `ainess` en `text-xs font-semibold tracking-wide text-muted-foreground`, centrado absoluto
  (`absolute left-1/2 -translate-x-1/2 pointer-events-none`).
- Derecha (solo `isTauri()`): tres botones de 46x40 px estilo Windows (`Minus`, `Square`/`Copy` para
  restaurar, `X`), hover `bg-accent` y el de cerrar hover `bg-destructive text-white`. Sin
  `data-tauri-drag-region`.
- `tauri.conf.json`: `decorations: false`, `title: "ainess"`, `productName: "ainess"`. Capabilities según arriba.

### 2. Sidebar colapsable
Store: `sidebarOpen: boolean` (default `true`, persistido en `ais.ui`), `toggleSidebar(open?)`. `Sidebar.tsx`:
si `!sidebarOpen` no se renderiza (ancho 0, transición `w-[260px]` ↔ `w-0 overflow-hidden` con
`transition-[width]`). Cabecera del sidebar: "AIS" → "ainess". Atajo `Ctrl+B` alterna.

### 3. Historial de navegación
Store: `navHistory: NavEntry[]`, `navIndex: number`, con `NavEntry = { screen, projectId, chatId, projectMode }`.
Toda navegación (`openHome`, `openProject`, `setProjectMode`, `setCurrentChat` cuando cambia la vista) pasa por
un helper `pushNav(entry)` que corta el futuro y agrega (máximo 50, sin duplicar la entrada idéntica
consecutiva). `goBack()` / `goForward()` aplican la entrada sin volver a pushear (`applyNav(entry)`), y
`canGoBack`/`canGoForward` derivados. Abrir/cerrar Configuración no entra en el historial. No persistido.

### 4. Paleta de búsqueda (`src/components/shell/SearchPalette.tsx`, nuevo)
`Dialog` chico arriba (`top-[15%]`), un `Input` autofocus con placeholder "Buscar proyectos, chats, agentes,
configuración…", lista de resultados agrupados (Proyectos / Chats / Agentes / Configuración) filtrando por
substring sin acentos ni mayúsculas (helper `normalize`). Enter o click abre el resultado: proyecto →
`openProject(id, null)`; chat → `openProject(chat.projectId, chat.id)`; agente → `openSettings("agents")`;
sección → `openSettings(id)` (usar la lista de secciones exportada por `SettingsDialog.tsx` si existe
`SETTINGS_SECTIONS`, si no una lista local con los 9 ids). Flechas arriba/abajo mueven la selección. Store:
`searchOpen`, `toggleSearch(open?)`. Atajo `Ctrl+K`. Sin resultados: "Nada que coincida con «…»".

### 5. Scrollbars (`src/index.css`)
Fuera de `@layer` (para que gane):
```css
* { scrollbar-width: thin; scrollbar-color: color-mix(in oklch, var(--foreground) 22%, transparent) transparent; }
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: color-mix(in oklch, var(--foreground) 22%, transparent); border-radius: 9999px; border: 3px solid transparent; background-clip: content-box; }
*::-webkit-scrollbar-thumb:hover { background-color: color-mix(in oklch, var(--foreground) 38%, transparent); }
*::-webkit-scrollbar-corner { background: transparent; }
```
Además `body { overflow: hidden }` (la app maneja su propio scroll) y revisar que el `ScrollArea` de shadcn
(`src/components/ui/scroll-area.tsx`) tenga el thumb con el mismo color/radio.

### 6. Renombrar a ainess
`index.html` `<title>ainess</title>`; `Sidebar.tsx`; `remote.html` (título y cabecera); `README.md`
(primera línea "ainess (antes AIS)"); `src/cli/main.ts` ayuda "Uso: ais …" → "ainess CLI (`ais`) …";
`PLAN.md` título "ainess — Orquestador local…". `package.json` `name` → `"ainess"`. Mantener
`identifier: "com.matias.ais"`, el binario del CLI `ais` y el crate `ais`.

### 7. `PLAN.md`
Sección "UI": barra de título (drag region, permisos de ventana), sidebar colapsable, historial de navegación,
paleta de búsqueda, scrollbars.

## Casos borde y decisiones ya tomadas
- No tocar `src/components/settings/*`, `AgentsPanel.tsx`, `ResourcesPanel.tsx`, `RemotePanel.tsx`,
  `AgentDialog.tsx` (otro agente los reescribe en paralelo). Del sidebar solo tocar cabecera y colapso.
- Con la ventana maximizada, el botón de maximizar muestra el icono de restaurar.
- El cierre desde la barra pasa por `getCurrentWindow().close()` para respetar la bandeja.
- Doble click en la barra maximiza (viene con `data-tauri-drag-region`).
- Sin dependencias nuevas.

## Fuera de alcance
- Configuración, logging, About, túnel (otros planes).

## Verificación
Desde `C:\Users\matia\Desktop\projects\ais-wt-chrome`:
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
cd src-tauri && cargo check
```
No correr `npm run tauri dev` (el puerto 1420 está ocupado por la app del usuario).
