# Nueva shell de la app: sidebar de proyectos, inicio, vista de proyecto (chat/jerarquía) y panel de comunicación

Repo: C:\Users\matia\Desktop\projects\ais (único repo)
Rama: la que esté activa en el repo (`main`), sin cambiar de rama ni crear otras

## Objetivo
Reemplazar la navegación por pestañas (Prompt / Comunicación / Jerarquía / Chat / Proyectos / Agentes / Recursos)
por una app tipo "Claude desktop": sidebar izquierdo con proyectos colapsables y sus chats, pantalla de
Inicio con grilla de proyectos, vista de proyecto con toggle Chat ↔ Jerarquía y el input de prompt siempre
abajo, panel de Comunicación opcional a la derecha, y Configuración (Agentes + Recursos) detrás de un
engranaje al pie del sidebar. Todo lo que hoy funciona (runs, delegaciones, aprobaciones, chats, instruir,
detener, remoto) tiene que seguir funcionando igual.

## Contexto
Leer `PLAN.md` y `CLAUDE.md` antes de empezar. Stack: Tauri 2 + React 19 + TS estricto (`noUnusedLocals`)
+ Tailwind 4 + componentes shadcn en `src/components/ui` (button, card, badge, dialog, dropdown-menu,
select, scroll-area, separator, switch, tabs, textarea, tooltip, input, label, alert). Iconos: `lucide-react`.
UI en español, código en inglés.

Cómo está hoy:
- `src/App.tsx`: `<Header/>` + `<Tabs>` con 7 pestañas. Escucha el evento `ais:open-tab` (lo dispara
  `src/components/AgentNode.tsx:38` para saltar a la pestaña Chat después de crear/seleccionar un chat).
- `src/components/Header.tsx`: título, `<Select>` de proyecto (con "Nuevo proyecto..."), badge de
  aprobaciones pendientes, "N trabajando", botón Detener (shift = todos los proyectos). Se elimina.
- `src/components/PromptPanel.tsx`: textarea + órdenes predefinidas (`config.presets`) + destino (agente) +
  modelo (`PROVIDERS[p].defaultModels` + "Otro...") + Enviar (Ctrl+Enter); tarjeta "Tarea en curso" (usa
  `activeTaskRunId[projectId]`, `runs` con `rootRunId`, ronda, tiempo, botón Detener tarea) o "Última tarea"
  (último `CommMessage` kind `result` con `toAgentId === "user"`); historial de prompts (`messages` kind `user`).
- `src/components/CommunicationPanel.tsx`: feed de `messages` del proyecto con filtros por agente y tipo,
  autoscroll, botón limpiar. Se reutiliza tal cual dentro del panel derecho.
- `src/components/HierarchyGraph.tsx` + `AgentNode.tsx`: grafo `@xyflow/react`; el nodo tiene Detener,
  Indicar (`InstructDialog`), ver último run (`RunDetailDialog`) y "Chatear" (crea/selecciona chat individual).
- `src/components/ChatPanel.tsx`: lista de chats del proyecto a la izquierda (240px) + hilo + composer +
  `ChatDialog` (crear/editar chat individual o compartido). Estado: `config.chats` (con `projectId`),
  `chatMessages[chatId]`, `currentChatId`, acciones `createChat/updateChat/removeChat/setCurrentChat/
  sendChatMessage/stopChat/loadChatMessages`, `isChatActive(chatId)` en `src/lib/chat.ts`.
- `src/components/ProjectsPanel.tsx`: grilla de cards de proyecto (color, carpeta, tareas activas, runs
  guardados, Abrir/Editar/Eliminar) + `ProjectDialog`. Se convierte en la pantalla de Inicio.
- `src/components/AgentsPanel.tsx` y `ResourcesPanel.tsx` (tabs Perfil/Órdenes/Skills/MCP/Hooks/Contexto/
  Remoto): pasan a Configuración sin cambios internos. OJO: otro agente está modificando en paralelo
  `AgentsPanel.tsx` y `AgentDialog.tsx` en otra rama; no toques el contenido de esos dos archivos, solo
  importalos.
- `src/components/ApprovalsPanel.tsx`: lista de aprobaciones pendientes; hoy va arriba de las pestañas.
- Store (`src/store.ts`, zustand): `currentProjectId`, `setCurrentProject`, `currentChatId`, `runs`,
  `messages`, `runtime[projectId][agentId]` (status working/waiting/idle, currentTask), `activeTaskRunId`,
  `approvals`, `submitPrompt(text, agentId, projectId, {model})`, `stopAll(projectId?)`, selectores
  `selectRunningCount(state, projectId?)`, `selectProject`, `selectAgent`. `Run` (`src/types.ts:164`):
  `parentRunId` (null = raíz), `rootRunId`, `kind` ("task" | "chat"), `status` (running/done/error/killed),
  `prompt`, `output`, `round`, `agentId`, `startedAt/endedAt`, `childRunIds`.
- `src/hooks/useActivityIsland.ts` y `useNotifications.ts`: se mantienen en App.
- Página remota (`src/remote/remote.html`) y CLI (`src/cli/main.ts`): no se tocan.

## Cambios

### 1. Estado de navegación en el store (`src/store.ts`, `src/types.ts` si hace falta)
Agregar a `AppState`:
```ts
screen: "home" | "project" | "settings";
projectMode: "chat" | "graph";
commPanelOpen: boolean;
settingsSection: "agents" | "resources";
sidebarCollapsed: Record<string, boolean>;   // projectId -> colapsado
openHome(): void;
openProject(projectId: string, chatId?: string | null): void;  // setCurrentProject + currentChatId + screen "project"
openSettings(section?: "agents" | "resources"): void;
setProjectMode(mode: "chat" | "graph"): void;
toggleCommPanel(open?: boolean): void;
toggleSidebarProject(projectId: string): void;
```
- `openProject` con `chatId` undefined deja `currentChatId` como está si es del mismo proyecto; con `null`
  selecciona la conversación del orquestador. Al abrir un chat, llamar `loadChatMessages`.
- Persistir `projectMode`, `commPanelOpen`, `sidebarCollapsed`, `settingsSection` y el último `screen` en
  `localStorage` (clave `ais.ui`), con try/catch (en el CLI no hay `localStorage`: guardar solo si
  `typeof localStorage !== "undefined"`). Al iniciar (`runInit`), si hay `lastProjectId` válido abrir
  `screen: "project"`, si no `home`.
- Reemplazar el evento `ais:open-tab` de `AgentNode.tsx` por `openProject(currentProjectId, chatId)`.

### 2. `src/App.tsx`
Layout: `div.h-screen.flex` → `<Sidebar/>` (izquierda) + columna principal (`flex-1 min-w-0 flex flex-col`)
+ `<CommSidePanel/>` (derecha, solo si `commPanelOpen` y `screen === "project"`). Mantener `Island`,
`Toaster`, `useActivityIsland`, `useNotifications`, `init`. Sin `Header`, sin `Tabs`.
La columna principal muestra según `screen`: `<HomeScreen/>`, `<ProjectScreen/>`, `<SettingsScreen/>`.
`<ApprovalsPanel/>` va arriba del contenido en home y project (como hoy).

### 3. `src/components/shell/Sidebar.tsx` (nuevo, ancho 260px, `border-r`, `bg-card`)
- Arriba: título "AIS" chico + botón "Inicio" (icono `Home`, resaltado si `screen === "home"`) y botón
  "Nuevo proyecto" (icono `Plus`, abre `ProjectDialog`).
- Lista de proyectos (scroll): por proyecto un encabezado clickeable con chevron (colapsa/expande, estado en
  `sidebarCollapsed`), punto de color, nombre, y a la derecha un badge naranja con la cantidad de agentes
  trabajando (`selectRunningCount(state, p.id)`, oculto si 0). Click en el nombre → `openProject(p.id, null)`.
  Menú contextual (`DropdownMenu`, icono `MoreHorizontal` al hover): Editar proyecto, Nuevo chat,
  Eliminar (con `island.confirm`, como hoy en ProjectsPanel).
  Dentro (si no está colapsado), ítems con indent:
  - "Orquestador" (icono `Bot`): la conversación principal del proyecto; activo si `currentProjectId === p.id
    && currentChatId === null && screen === "project"`.
  - Un ítem por chat de `config.chats.filter(c => c.projectId === p.id)` (icono `MessageCircle` individual /
    `Users` compartido, nombre, spinner chico si `isChatActive(chat.id)`); click → `openProject(p.id, chat.id)`.
    Menú por chat: Renombrar/editar (abre `ChatDialog` con `editChatId`), Eliminar.
  - Ítem "+ Nuevo chat" (texto muted) → abre `ChatDialog` con el proyecto seleccionado (setear
    `currentProjectId` antes, `ChatDialog` usa `currentProjectId`).
- Pie: línea de estado ("N trabajando" total + badge ámbar de aprobaciones pendientes, click → si hay
  proyecto abrirlo) y botón engranaje "Configuración" (`Settings` icon) → `openSettings()`, resaltado si
  `screen === "settings"`.

### 4. `src/components/shell/HomeScreen.tsx` (nuevo; reemplaza `ProjectsPanel.tsx`, borrar el viejo)
Título "Proyectos" + botón "Nuevo proyecto". Grilla de cards (1/2/3 columnas). Cada card:
- punto de color + nombre + carpeta (truncada, icono `Folder`).
- Estado de actividad, calculado con un `useMemo` sobre `runs`/`runtime` (nunca un selector que devuelva
  un objeto nuevo; ver comentario en ProjectsPanel actual):
  - si hay agentes trabajando: "Trabajando: {agente} — {currentTask truncado a 80}" (por cada agente en
    working/waiting, máximo 2 líneas) con `StatusDot`.
  - si no: último run raíz (`parentRunId === null && kind !== "chat"`, mayor `startedAt`): "Última tarea:
    {prompt truncado a 80}", badge con status (Terminada / Error / Detenida), "hace X" (helper
    `formatTimeAgo` ya existe en PromptPanel: moverlo a `src/lib/format.ts` con `formatElapsed`).
  - si no hay runs: "Sin actividad todavía".
- "N tareas activas · M runs guardados".
- Click en la card (no en los botones) → `openProject(p.id, null)`. Botones: Abrir, Editar, Eliminar.
- Estado vacío: texto + botón "Crear el primer proyecto".

### 5. `src/components/shell/ProjectScreen.tsx` (nuevo)
Estructura vertical:
- Barra superior (`border-b`, h-12): punto de color + nombre del proyecto + carpeta muted; al centro un
  toggle de dos botones (grupo con `Button variant={mode===x?"secondary":"ghost"}`): "Chat" (`MessageSquare`)
  y "Jerarquía" (`GitBranch`) → `setProjectMode`; a la derecha: badge "N trabajando" del proyecto, botón
  "Comunicación" (`PanelRight`, variant secondary si abierto) → `toggleCommPanel()`, botón "Detener"
  (destructive, disabled si nada corre; shift+click = todos los proyectos, como el Header actual).
- `ApprovalsPanel` (si hay pendientes).
- Cuerpo (`flex-1 min-h-0`):
  - `projectMode === "graph"` → `<HierarchyGraph/>` a pantalla completa.
  - `projectMode === "chat"` y `currentChatId === null` → `<OrchestratorThread/>`.
  - `projectMode === "chat"` y `currentChatId` → `<ChatThread chatId/>`.
- Abajo siempre: `<Composer/>`.

### 6. `src/components/shell/OrchestratorThread.tsx` (nuevo)
Hilo scrolleable (autoscroll al fondo al agregar runs, con botón "Nuevos mensajes ↓" si el usuario subió;
reutilizar la lógica de `CommunicationPanel`). Fuente: `runs` del proyecto con `parentRunId === null &&
kind !== "chat"`, ordenados por `startedAt`. Por cada run raíz:
- Burbuja del usuario (alineada a la derecha, `bg-primary text-primary-foreground`): `prompt`, debajo en
  chico "→ {agente} · {modelo si hay} · {hora}". Si el run tiene `round > 0` es una continuación
  automática (no lo generó el usuario): en ese caso NO mostrar burbuja de usuario, solo la de respuesta con
  etiqueta "Ronda {round+1}".
- Burbuja del agente (izquierda, `bg-muted`, borde izquierdo con `agent.color`): nombre del agente +
  `StatusDot`; contenido:
  - `status === "running"`: "Trabajando…" con spinner, tiempo transcurrido (tick cada 1 s como PromptPanel),
    y lista de delegaciones activas: hijos (`runs` con `rootRunId === run.rootRunId && parentRunId !== null`)
    como chips "{agente}: {prompt truncado 60}" con `StatusDot` de su status.
  - terminado: `output` en `whitespace-pre-wrap` (colapsado a 12 líneas con "Ver más" si es largo), chips de
    hijos con su estado final, badge de estado si `error`/`killed` (texto "[detenido por el usuario]" ya viene
    en output), botón chico "Detalles" → `RunDetailDialog` (ya existe, recibe runId).
- Vacío: mensaje centrado "Escribí abajo qué querés que haga el equipo. El planificador (Claude) analiza,
  delega a los implementadores y te responde acá." con un ejemplo.

### 7. `src/components/shell/ChatThread.tsx` (nuevo; extraer de `ChatPanel.tsx`, borrar `ChatPanel.tsx`)
La parte de hilo de `ChatPanel` (burbujas por `chatMessages[chatId]`, `from === "user"` derecha, agente
izquierda con su nombre/color, tick de 500 ms mientras `isChatActive`). Sin la lista de chats (está en el
sidebar) y sin composer (va el `Composer` común). Cabecera chica con nombre del chat, modo (Individual /
Compartido) y participantes con rol; botón Editar (ChatDialog) y Eliminar.

### 8. `src/components/shell/Composer.tsx` (nuevo; reemplaza `PromptPanel.tsx`, borrar el viejo)
Pegado abajo (`border-t`, `p-3`). Modo según `currentChatId`:
- Orquestador (`currentChatId === null`): Textarea autoexpandible (min 2 filas, máx ~8) con placeholder
  "Pedile algo al equipo… (Ctrl+Enter para enviar)"; fila inferior: select Destino (default planificador
  raíz, como PromptPanel), select Modelo (`PROVIDERS[p].defaultModels` + "Otro…" con input), select
  Órdenes predefinidas (igual que hoy, agrega al texto), a la derecha botón Enviar (`Send`) o, si el destino
  está `working`, botón Detener (`Square`, destructive) que hace `stopAll(projectId)`. Alerta inline si
  `binaries[provider] === null` ("No se detectó el CLI de X. Configuralo en Configuración → Agentes").
  Enviar = `submitPrompt(text, targetId, projectId, { model })`, limpiar el texto.
- Chat (`currentChatId` set): misma Textarea, placeholder "Mensaje para {nombre del chat}…", Enviar =
  `sendChatMessage(chatId, text)`; Detener = `stopChat(chatId)` mientras `isChatActive`.
- Flecha arriba con el textarea vacío recupera el último prompt enviado (historial en memoria, como el
  "Historial" de PromptPanel pero sin lista visible).
- Funciona igual en modo Jerarquía (el composer no depende de `projectMode`).

### 9. `src/components/shell/CommSidePanel.tsx` (nuevo)
Panel derecho de 380px (`border-l`, `bg-card`), cabecera "Comunicación" con subtítulo muted "Todo lo que se
dicen los agentes y vos" y botón cerrar (`X`) → `toggleCommPanel(false)`. Cuerpo: `<CommunicationPanel/>`
existente (ajustar su contenedor para que use `h-full` y no asuma padding externo).

### 10. `src/components/shell/SettingsScreen.tsx` (nuevo)
Cabecera con botón "Volver" (`ArrowLeft`, vuelve a `project` si hay `currentProjectId`, si no a `home`) y
título "Configuración". `Tabs` con dos pestañas: "Agentes" → `<AgentsPanel/>`, "Recursos" →
`<ResourcesPanel/>`; valor = `settingsSection`, `onValueChange` lo guarda. Contenido scrolleable.

### 11. Limpieza
- Borrar `Header.tsx`, `PromptPanel.tsx`, `ProjectsPanel.tsx`, `ChatPanel.tsx` y toda referencia.
- `src/lib/format.ts`: `formatTimeAgo(ts, now)`, `formatElapsed(secs)`, `truncate(text, n)`.
- Página remota y CLI intactos. `npm run build:cli` tiene que seguir pasando (el CLI importa el store: nada
  de `window`/`localStorage` sin guard en `store.ts`).
- Actualizar en `PLAN.md` la sección de UI (reemplazar la descripción de pestañas por la nueva estructura:
  sidebar / inicio / proyecto (chat|jerarquía) / comunicación lateral / configuración).

## Casos borde y decisiones ya tomadas
- Sin proyectos: Inicio muestra el estado vacío; el sidebar muestra "Sin proyectos" y el botón Nuevo proyecto.
- Al eliminar el proyecto actual: `removeProject` ya limpia `currentProjectId`; además volver a `home`.
- Al eliminar el chat actual: volver al Orquestador del mismo proyecto (`currentChatId = null`).
- `openProject` de un proyecto distinto al actual con `chatId` undefined → `currentChatId = null`.
- El panel de Comunicación se abre/cierra por proyecto en general (un solo booleano), no por proyecto.
- Ancho mínimo: si la ventana es angosta (< 1100px) el panel de comunicación se superpone (`absolute right-0`)
  en vez de comprimir el hilo. No hace falta sidebar colapsable a iconos.
- Tema oscuro: usar solo tokens (`bg-card`, `text-muted-foreground`, `border-border`…), nunca colores fijos
  salvo el color del proyecto/agente.
- Los `Select` de shadcn no aceptan `value=""`: usar "none"/"null" como hoy.
- No agregar dependencias nuevas.

## Fuera de alcance
- `AgentsPanel.tsx`, `AgentDialog.tsx` (otro agente los está cambiando), `ResourcesPanel.tsx` y sus diálogos,
  `src/lib/*` (salvo `format.ts` nuevo), `src/cli/*`, `src/remote/*`, `src-tauri/*`, protocolo de delegación.

## Verificación
Desde la raíz del repo, todo tiene que pasar:
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
```
Además revisar a mano que no queden imports a los componentes borrados (`grep -rn "PromptPanel\|ProjectsPanel\|ChatPanel\|Header\"" src`), y que `grep -rn "ais:open-tab" src` no devuelva nada.
