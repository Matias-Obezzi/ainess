# Configuración v2: secciones como componentes, acciones en el header, empty states, skeletons, sugeridos, manito

Repo: C:\Users\matia\Desktop\projects\ais-wt-settings (worktree del repo, rama `feat/settings-v2`)
Rama: `feat/settings-v2` (ya activa en ese directorio; no cambiar de rama ni crear otras)

## Objetivo
1. `SettingsDialog` tiene un objeto "router" de secciones: cada sección es su propio componente con su
   título, ayuda, icono y **botones de acción del header**. Desaparece `ResourcesPanel.tsx`.
2. El header del modal tiene un botón de cerrar propio (a la derecha de las acciones) y el botón de cerrar
   por defecto del `Dialog` está oculto.
3. Agentes deja de tener doble título: "Autodetectar" y "Nuevo agente" son acciones del header. Lo mismo para
   "Nueva orden", "Nueva skill", "Nuevo MCP", "Nuevo hook", "Guardar" (Contexto/Perfil).
4. Todo lo clickeable muestra `cursor: pointer`.
5. Empty states con CTA en toda lista vacía, y skeletons donde algo carga con demora.
6. Skills y MCP tienen "Agregar sugeridos": una lista curada de MCP servers y skills útiles para elegir.

## Contexto
Leer `PLAN.md` (secciones "UI" y "Bandeja y notificaciones") antes de empezar. Stack: React 19 + TS estricto
(`noUnusedLocals`) + Tailwind 4 + shadcn en `src/components/ui` (button, card, badge, dialog, dropdown-menu,
select, scroll-area, skeleton, switch, tabs, textarea, tooltip, input, label, alert, progress). Iconos
`lucide-react`. UI en español, código en inglés.

Cómo está hoy:
- `src/components/settings/SettingsDialog.tsx`: `SECTIONS` (id, label, help, icon) + un objeto `sections`
  con 3 componentes (`GeneralSettings`, `AgentsPanel`, `RemotePanel`) y fallback `<ResourceSection
  section={…}/>`. El header de contenido es `flex items-center justify-between h-14` con el título/ayuda a la
  izquierda y el comentario `{/* ACA VAN BOTONES ESPECIFICOS POR SECCION ACTIVA */}` donde van las acciones.
  `DialogContent` (`src/components/ui/dialog.tsx`) acepta `showCloseButton` (default `true`).
- `src/components/ResourcesPanel.tsx`: `ResourceSection({ section })` con un `if` por sección: `profile`
  (nombre/sobre vos/preferencias + botón Guardar), `presets` (botón "Nueva orden" suelto arriba + cards +
  `PresetDialog`), `skills` (botón + cards + `SkillDialog`), `mcp` (botones "Nuevo MCP" y "Sincronizar con
  Antigravity" (`syncMcpToAntigravity` de `src/lib/mcp-sync.ts`) + cards + `McpDialog`), `context`
  (textarea + Guardar), `hooks` (botón "Nuevo Hook" + cards + `HookDialog`).
- `src/components/AgentsPanel.tsx`: cabecera propia "Agentes" + botones "Autodetectar" (llama
  `detectBinaries()` y muestra toast con `{found, missing}`) y "Nuevo agente" (abre `AgentDialog` con
  `editingAgent = null`); cards de agentes; muestra "Cargando..." mientras `!loaded`.
- `src/components/settings/GeneralSettings.tsx`, `src/components/RemotePanel.tsx`, `AgentDialog.tsx`,
  `SkillDialog.tsx`, `McpDialog.tsx`, `PresetDialog.tsx`, `HookDialog.tsx`: se reutilizan.
- Tipos (`src/types.ts`): `Skill { id, name, description?, content, enabledFor: "all" | string[] }`,
  `McpServer { id, name, transport: "stdio" | "http", command?, args?, env?, url?, enabledFor }`. Store:
  `upsertSkill`, `upsertMcpServer`, `upsertHook`, `config.presets`, `updateConfig`.
- Lugares con carga demorada: `loaded` del store (config + detección de binarios, 1-5 s al arrancar),
  `AgentDialog` (`refreshModels`/`refreshQuota`, hay un `loading` con spinner), `loadChatMessages` (chat),
  `history.loadHistory` (runs de un proyecto, `src/lib/history.ts:166`), `remoteStatus` (`RemotePanel`),
  `HomeScreen` antes de `loaded`.
- `src/index.css`: `@layer base` con border/body; no hay reglas de cursor.

## Cambios

### 1. Router de secciones (`src/components/settings/SettingsDialog.tsx`)
```ts
export interface SettingsSectionDef {
  id: SettingsSection; label: string; help: string; icon: LucideIcon;
  /** Body of the section. */
  component: React.ComponentType;
  /** Header actions (buttons) rendered right of the title, before the close button. */
  actions?: React.ComponentType;
}
export const SETTINGS_SECTIONS: SettingsSectionDef[] = [ … ];
```
Un componente por sección en `src/components/settings/`: `GeneralSection` (renombrar `GeneralSettings`),
`AgentsSection` (+ `AgentsSectionActions`), `ProfileSection` (+ acción Guardar), `PresetsSection`
(+ "Nueva orden"), `SkillsSection` (+ "Sugeridos" y "Nueva skill"), `McpSection` (+ "Sugeridos",
"Sincronizar con Antigravity", "Nuevo MCP"), `HooksSection` (+ "Nuevo hook"), `ContextSection`
(+ Guardar), `RemoteSection` (mover `RemotePanel` acá; sin acciones). Como las acciones viven en el header
y el cuerpo en otro componente, compartir el estado "diálogo abierto"/"borrador" con un contexto chico por
sección (`createContext` + provider montado por `SettingsDialog` alrededor de header+cuerpo de la sección
activa) o con un slice `settingsUi` en el store; elegir el contexto. `SettingsDialog` renderiza
`<active.actions/>` en el slot del comentario y el cuerpo con `<active.component/>`.
Borrar `src/components/ResourcesPanel.tsx` y `src/components/AgentsPanel.tsx` (su contenido pasa a
`AgentsSection`, sin el título duplicado ni la fila de botones).

### 2. Cerrar
`DialogContent showCloseButton={false}`; en el header, después de las acciones, un `Button variant="ghost"
size="icon"` con `X` y `aria-label="Cerrar"` que llama `closeSettings()`. Separar acciones y cerrar con un
`Separator orientation="vertical"` de 24px cuando hay acciones.

### 3. Manito
En `src/index.css` dentro de `@layer base`:
```css
button:not(:disabled), [role="button"]:not([aria-disabled="true"]), a[href], label[for], select, summary,
[data-slot="select-trigger"], [data-slot="dropdown-menu-item"], [data-slot="tabs-trigger"], [data-slot="switch"] { cursor: pointer; }
button:disabled { cursor: not-allowed; }
```
y revisar que `Button` (`src/components/ui/button.tsx`) no fuerce `cursor-default`. Los `div` clickeables que
existan (cards de proyecto en `HomeScreen`, ítems del sidebar, filas del feed) llevan `cursor-pointer` y
`role="button"`.

### 4. Empty states (`src/components/ui/empty-state.tsx`, nuevo)
`EmptyState({ icon, title, description, action?: { label, onClick } })`: centrado, icono grande muted,
título, texto y un `Button` CTA. Usarlo en: Agentes (sin agentes → "Creá tu primer agente"), Órdenes, Skills
("Agregá una skill o elegí una sugerida", CTA abre Sugeridos), MCP (idem), Hooks, Inicio (ya tiene uno, migrarlo
al componente), lista de chats del sidebar (proyecto sin chats: línea "Sin chats todavía" + "Nuevo chat"),
`OrchestratorThread` vacío (migrar), `ChatThread` vacío ("Escribí el primer mensaje"), feed de Comunicación
vacío ("Acá vas a ver lo que se dicen los agentes").

### 5. Skeletons
Usar `src/components/ui/skeleton.tsx`:
- Agentes: mientras `!loaded`, 3 cards skeleton (con la forma de una card de agente).
- `AgentDialog`: mientras carga modelos/cuota, skeleton de 3 líneas en el bloque Cuota y el select de
  modelo deshabilitado con placeholder "Cargando modelos…".
- Inicio: mientras `!loaded`, 3 cards skeleton.
- `ChatThread`: mientras `loadChatMessages` está en curso (agregar `chatLoading: Record<chatId, boolean>` al
  store, seteado en `loadChatMessages`), 3 burbujas skeleton alternadas.
- `OrchestratorThread`: mientras el historial del proyecto se carga por primera vez (agregar
  `historyLoading: Record<projectId, boolean>` seteado en `history.loadHistory`), 2 pares de burbujas skeleton.
- Remoto: mientras `remoteStatus` se refresca por primera vez, skeleton del bloque de URL/QR.

### 6. Sugeridos (`src/lib/suggested.ts`, nuevo, + `src/components/settings/SuggestedDialog.tsx`)
`SUGGESTED_MCP: Array<Omit<McpServer, "id" | "enabledFor"> & { description: string; requires?: string }>`:
- Filesystem: `npx -y @modelcontextprotocol/server-filesystem <carpeta>` ("Acceso a archivos de una carpeta";
  `requires: "Reemplazá <carpeta> por la ruta"`)
- GitHub: `npx -y @modelcontextprotocol/server-github`, env `GITHUB_PERSONAL_ACCESS_TOKEN: ""`
- Git: `uvx mcp-server-git` (requiere `uv`)
- Fetch: `uvx mcp-server-fetch` ("Descargar páginas web como texto")
- Memory: `npx -y @modelcontextprotocol/server-memory` ("Memoria persistente entre sesiones")
- Sequential Thinking: `npx -y @modelcontextprotocol/server-sequential-thinking`
- Playwright: `npx -y @playwright/mcp@latest` ("Controlar un navegador")
- Context7: `npx -y @upstash/context7-mcp` ("Documentación actualizada de librerías")
- PostgreSQL: `npx -y @modelcontextprotocol/server-postgres <connection-string>`
- SQLite: `uvx mcp-server-sqlite --db-path <archivo.db>`
- Brave Search: `npx -y @modelcontextprotocol/server-brave-search`, env `BRAVE_API_KEY: ""`
- Slack: `npx -y @modelcontextprotocol/server-slack`, env `SLACK_BOT_TOKEN: ""`, `SLACK_TEAM_ID: ""`
`SUGGESTED_SKILLS: Array<Omit<Skill, "id" | "enabledFor">>` con `content` en español, concreto (5-10 líneas
cada una): "Commits convencionales", "Revisión de código" (checklist), "Tests primero", "Documentar cambios"
(README/CHANGELOG), "Seguridad básica" (secretos, inputs, deps), "Respuestas concisas", "Plan antes de
implementar", "Verificar antes de terminar" (correr tests/typecheck), "Estilo TypeScript estricto",
"Accesibilidad básica en UI".
`SuggestedDialog({ kind: "mcp" | "skill" })`: lista con checkbox por ítem (nombre, descripción, comando o
resumen, aviso `requires`), ya agregados deshabilitados con badge "Agregado" (por nombre), botón "Agregar N
seleccionados" → `upsertMcpServer`/`upsertSkill` con `id: crypto.randomUUID()`, `enabledFor: "all"`, toast.

### 7. `PLAN.md`
Sección "UI" → Configuración: describir el router (`SETTINGS_SECTIONS`, `component`/`actions`), el
componente `EmptyState`, dónde hay skeletons y los sugeridos.

## Casos borde y decisiones ya tomadas
- No tocar `src/App.tsx`, `src/components/shell/Sidebar.tsx`, `src/index.css` más allá de las reglas de cursor
  (otro agente está cambiando la barra de ventana y el sidebar en paralelo), ni `src-tauri/*`, ni el CLI.
- `AgentDialog.tsx` solo cambia para los skeletons.
- Sin dependencias nuevas.
- Mantener funcionando `RemotePanel` (solo se mueve/renombra).
- Ancho del header: si hay muchas acciones, agrupar las secundarias ("Sincronizar con Antigravity",
  "Sugeridos") en un `DropdownMenu` con icono `MoreHorizontal` y dejar la primaria como botón.

## Fuera de alcance
- Barra de ventana, sidebar colapsable, logging, About, túnel remoto, scrollbars (otros planes).

## Verificación
Desde `C:\Users\matia\Desktop\projects\ais-wt-settings`:
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
```
Y `grep -rn "ResourcesPanel\|ResourceSection\|AgentsPanel" src` sin resultados.
