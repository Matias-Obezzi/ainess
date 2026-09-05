# Informe — 013 Nueva shell de la app

## Qué se hizo

Se reemplazó la navegación por 7 pestañas por una shell tipo "Claude desktop", completa y
funcionando. Todo lo que andaba antes (runs, delegaciones, aprobaciones, chats, instruir, detener,
remoto) sigue igual: no se tocó `src/lib/*` (salvo el nuevo `format.ts`), ni el CLI, ni la página
remota, ni `src-tauri/`.

**Estado de navegación en el store (`src/store.ts`)**
- Nuevos tipos exportados `Screen`, `ProjectMode`, `SettingsSection`.
- Nuevo estado: `screen`, `projectMode`, `commPanelOpen`, `settingsSection`, `sidebarCollapsed`.
- Nuevas acciones: `openHome`, `openProject(projectId, chatId?)`, `openSettings(section?)`,
  `setProjectMode`, `toggleCommPanel(open?)`, `toggleSidebarProject`.
- Persistencia en `localStorage` bajo `ais.ui` con `typeof localStorage !== "undefined"` + try/catch
  (el CLI importa el store en node y no tiene `localStorage`).
- `runInit` restaura `projectMode`, `commPanelOpen`, `settingsSection` y `sidebarCollapsed`; abre
  `screen: "project"` si `lastProjectId` sigue existiendo, si no `home` (y `settings` si era la
  última pantalla). Si el `lastProjectId` guardado ya no existe, se limpia `currentProjectId`.
- `removeProject` ahora también borra los chats del proyecto, limpia `currentChatId` y vuelve a
  `home` cuando se elimina el proyecto abierto.

**Componentes nuevos (`src/components/shell/`)**
- `Sidebar.tsx` (260px): Inicio, Nuevo proyecto, árbol de proyectos colapsables con punto de color,
  badge naranja de agentes trabajando y menú contextual (Editar proyecto / Nuevo chat / Eliminar);
  dentro de cada proyecto "Orquestador", los chats (icono individual/compartido + puntito verde si
  el chat está contestando, menú Renombrar / Eliminar) y "+ Nuevo chat". Pie con "N trabajando",
  badge ámbar de aprobaciones pendientes y el engranaje de Configuración.
- `HomeScreen.tsx`: grilla 1/2/3 columnas de cards de proyecto con carpeta, actividad (agentes
  trabajando con su `currentTask` truncado a 80, o la última tarea raíz con badge de estado y
  "hace X", o "Sin actividad todavía"), tareas activas, runs guardados y Abrir/Editar/Eliminar.
  Estado vacío con "Crear el primer proyecto". Reemplaza a `ProjectsPanel.tsx`.
- `ProjectScreen.tsx`: barra superior de 48px, `ApprovalsPanel`, cuerpo (grafo / hilo del
  orquestador / hilo de chat) y `Composer` fijo abajo.
- `OrchestratorThread.tsx`: runs raíz del proyecto como conversación, con burbuja del usuario,
  burbuja del agente con borde de su color, cronómetro mientras corre, chips de delegaciones,
  colapso a 12 líneas con "Ver más", badges de Error/Detenida, botón Detalles (`RunDetailDialog`),
  autoscroll con botón "Nuevos mensajes" y estado vacío explicativo.
- `ChatThread.tsx`: extraído de `ChatPanel.tsx` (cabecera con nombre/modo/participantes + Editar y
  Eliminar, burbujas, "Escribiendo…"). Sin lista de chats ni composer propio.
- `Composer.tsx`: reemplaza a `PromptPanel.tsx`. Textarea autoexpandible (Ctrl+Enter), flecha
  arriba/abajo para recuperar prompts enviados en la sesión, selects de Destino / Modelo (con
  "Otro…") / Órdenes predefinidas en modo orquestador, alerta si falta el CLI del provider, y
  botón Enviar que pasa a Detener mientras el destino (o el chat) está ocupado.
- `CommSidePanel.tsx`: panel derecho de 380px con `CommunicationPanel` adentro; bajo 1100px se
  superpone en vez de comprimir el hilo.
- `SettingsScreen.tsx`: Volver + pestañas Agentes / Recursos, con el valor atado a
  `settingsSection`.

**Otros cambios**
- `src/App.tsx` reescrito: `Sidebar` + columna principal + `CommSidePanel`, sin `Header` ni `Tabs`.
  En Inicio muestra `ApprovalsPanel all`, en Proyecto el `ApprovalsPanel` del proyecto.
- `src/lib/format.ts` nuevo: `formatTimeAgo`, `formatElapsed`, `truncate` y `formatClock`.
- `src/components/AgentNode.tsx`: "Chatear" ahora llama a `openProject(projectId, chatId)` +
  `setProjectMode("chat")`; se eliminó el evento `ais:open-tab`.
- Borrados: `Header.tsx`, `PromptPanel.tsx`, `ProjectsPanel.tsx`, `ChatPanel.tsx`.
- `PLAN.md`: la sección "UI" describe la shell nueva en lugar de las pestañas.
- No se tocó el contenido de `AgentsPanel.tsx` ni `AgentDialog.tsx` (los edita otro agente); solo
  se importan desde `SettingsScreen.tsx`.

## Commits

| Hash | Mensaje |
|---|---|
| `ed83568` | Store: shell navigation state (screen, project mode, comm panel, sidebar) + format helpers |
| `5ad8a43` | New app shell: project sidebar, home grid, project screen and side comm panel |
| `75347f2` | Move the mode toggle off centre and document the new shell in PLAN.md |

Sin push (no corresponde a este agente).

## Verificación

Todo desde la raíz del repo, todo en verde:

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | OK, sin errores |
| `npm test` | 2 archivos, 19 tests, todos pasan |
| `npm run build` | OK |
| `npm run build:cli` | OK (el store sigue importable en node) |
| `grep -rn "PromptPanel\|ProjectsPanel\|ChatPanel\|components/Header\|ais:open-tab" src/ PLAN.md` | sin coincidencias |

Además se probó la UI a mano en el navegador (había un `vite dev` corriendo en el puerto 1420),
sembrando estado con `window.__ais` (dos proyectos, un chat, runs raíz + hijo + ronda 2, mensajes):
- Inicio: cards con actividad "Trabajando: Antigravity — …", "Sin actividad todavía", contadores.
- Proyecto: hilo del orquestador con burbuja del usuario, respuesta con chip de delegación,
  segunda burbuja "Ronda 2 · Trabajando… 2:54" con cronómetro vivo, composer abajo.
- Toggle Chat ↔ Jerarquía: el grafo se ve a pantalla completa con el composer pegado abajo.
- "Chatear" desde un nodo del grafo abre el chat del agente y cambia a modo chat.
- Panel de Comunicación: abre/cierra y a ancho chico se superpone en vez de comprimir.
- Sidebar: colapso por proyecto, menú contextual del proyecto, resaltado del chat activo.
- Configuración: Volver + pestañas Agentes/Recursos con contenido scrolleable.
- `localStorage["ais.ui"]` se actualiza con cada cambio de pantalla/modo/panel.

## Decisiones tomadas

1. **Toggle Chat/Jerarquía a la derecha del centro, no centrado.** El plan pedía el toggle "al
   centro" de la barra superior, pero `<Island />` flota fijo sobre el centro del borde superior de
   la ventana y tapaba (y bloqueaba el click de) los dos botones mientras había agentes trabajando.
   El toggle quedó con `ml-auto`, pegado al grupo de la derecha, que es la única posición que nunca
   colisiona con el pill del island. Con el panel de Comunicación abierto la barra se angosta y
   puede haber solape parcial y transitorio, pero solo mientras algo corre.
2. **Chips de delegaciones por hijos directos.** El plan decía filtrar por
   `rootRunId === run.rootRunId && parentRunId !== null`; eso repite los mismos chips en cada
   burbuja de continuación de la misma tarea. Se usa `parentRunId === run.id` (hijos directos), que
   es un subconjunto y muestra las delegaciones de ese run puntual.
3. **`removeProject` también borra los chats del proyecto.** El plan no lo pedía, pero el sidebar
   filtra los chats por `projectId`, así que si no se borran quedan huérfanos e invisibles en la
   config para siempre.
4. **Eliminar proyecto/chat usa `island.confirm`** (como ya hacía `AgentsPanel`), no `confirm()`
   nativo como el viejo `ProjectsPanel`.
5. **`ChatDialog` se monta solo cuando está abierto y con `key`,** porque inicializa su estado con
   `useState` a partir de `editChatId`; sin remontarlo, editar un chat después de crear otro
   mostraría datos viejos.
6. **Textarea del composer:** en vez de calcular la altura a mano se aprovecha `field-sizing-content`
   que ya trae el `Textarea` de la librería, con `min-h-[60px] max-h-[200px]` (≈2 a 8 filas).
7. **Aprobaciones en Inicio:** en la home se muestra `ApprovalsPanel all` (todas las pendientes,
   con el nombre del proyecto), porque desde ahí no hay un proyecto "actual" evidente.
8. **Historial de prompts del composer** vive en un array a nivel de módulo (memoria de la sesión),
   sin lista visible, con flecha arriba/abajo, tal como pedía el plan.

## Pendientes o dudas

- El commit `ed83568` incluye, sin querer, una normalización de finales de línea de
  `.claude/scripts/copilot-run.sh` que git tenía pendiente en el working copy. No cambia el
  contenido del script.
- No se corrió `npm run tauri dev` ni `cargo check`: el plan no los pedía y no se tocó
  `src-tauri/`. La verificación visual se hizo sobre el `vite dev` que ya estaba levantado, con el
  transporte nulo del navegador (no se ejecutaron agentes reales).
- El `<Island />` sigue flotando sobre la barra superior del proyecto. Si molesta, la solución de
  fondo sería reservarle una franja propia arriba de todo (unos 48px) o moverlo a otra posición;
  quedó fuera de alcance de este plan.
- La cabecera de filtros de `CommunicationPanel` se ve algo apretada dentro de los 380px del panel
  lateral (los badges de tipo hacen wrap). Es el componente existente, no se modificó su contenido.
