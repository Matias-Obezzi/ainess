# 028 — Agentes por proyecto, instancias repetidas y formaciones

Rama: `feat/project-agents` (worktree `C:\Users\matia\Desktop\projects\ais-wt-agents`). Sin push.

## Qué se hizo

**Tipos y config (`src/types.ts`)**
- `Project.agents: AgentConfig[]` y `Formation { id, name, description?, agents }`.
- `AppConfig`: se sacó `agents`, se agregaron `formations: Formation[]` y
  `defaultFormationId: string | null`. `version: 10`.

**Store (`src/store.ts`)**
- Migración 9 → 10 dentro de `runInit`: cada proyecto recibe una copia del equipo global; el
  proyecto de `lastProjectId` (o el primero) **conserva los ids originales** para no romper
  `runtime`, historial ni `enabledFor` de skills/MCP; los demás reciben ids nuevos con `parentId`
  remapeado. El equipo global además se guarda como formación **"Mi equipo"**, que queda
  predeterminada. `config.agents` se borra y la config se reescribe (`isSeed`).
- Selectores: `selectProjectAgents`, `selectAllAgents` (unión de todos los proyectos, cacheada por
  identidad de `config.projects` para no romper la igualdad referencial de zustand), `selectAgent`
  (busca en todos los proyectos), `selectProjectOfAgent`, `selectFormation`,
  `selectChildren(state, projectId, agentId)`, `selectRoots(state, projectId)`, `nextAgentName`.
- Acciones: `addAgent(projectId, agent)`, `updateAgent(projectId, id, patch)`,
  `removeAgent(projectId, id)` (los hijos pasan a colgar del padre del borrado, se limpia su
  runtime y las asignaciones puntuales de skills/MCP), `addProject(project, opts?)`,
  `applyFormation`, `upsertFormation`, `removeFormation`, `setDefaultFormation`,
  `saveProjectAsFormation`. Se eliminó `upsertAgent`.
- `cloneAgents()` (ids nuevos + `parentId` remapeado) y `runtimeFor()` compartidos.
- Seed de instalación nueva: la formación "Mi equipo" (Claude planner + Antigravity + Copilot),
  marcada como predeterminada; ya no hay agentes sueltos.
- `src/lib/config-merge.ts`: `formations` entra en `ID_COLLECTIONS` (los agentes viajan dentro de
  `projects`, que ya estaba).

**Orquestación y libs**
- `orchestrator.ts`: `selectChildren` usa el proyecto del run, así la resolución del bloque
  `delegate` (por nombre) mira solo el equipo de ese proyecto. `instructAgent` exige que el agente
  pertenezca al equipo del proyecto y ya no depende de que exista la fila de runtime.
- `remote.ts`: el snapshot manda los agentes de todos los proyectos, cada uno con su `projectId`;
  `remote-client.ts` los reparte por proyecto al hidratar. El comando `prompt` valida contra el
  equipo del proyecto.

**UI**
- **Jerarquía** (`HierarchyGraph.tsx`): muestra el equipo del proyecto actual; toolbar con
  "Agregar agente" y "Guardar como formación" (diálogo con nombre); empty state que invita a crear
  el primer agente.
- **Nodo e inspector** (`AgentNode.tsx`, `AgentInspector.tsx`, `agent-actions.tsx`): "Editar agente"
  abre el `AgentDialog` (antes iba a Configuración), más "Duplicar" (mismo proveedor, modelo y
  padre, nombre libre) y "Eliminar" con `confirmDelete`. Están en el menú de tres puntos, en el
  click derecho y como botones del inspector.
- **`AgentDialog`**: acepta `projectId`, `agents` (roster) y `onSave`; sin `onSave` escribe en el
  proyecto (`addAgent`/`updateAgent`), con `onSave` devuelve el agente (lo usan la formación y el
  diálogo de proyecto). Varias instancias del mismo proveedor son válidas; lo único que tiene que
  ser único en el equipo es el nombre (case-insensitive, con aviso y Guardar deshabilitado). El
  nombre por defecto sigue al proveedor elegido: "Claude", "Claude 2", …
- **Configuración → Agentes** (`AgentsSection.tsx`): ya no lista agentes. Arriba "IAs instaladas"
  (una card por proveedor detectable: logo, detectado/no detectado, ruta y versión, cuota con
  `QuotaRing` + `summarizeAgentQuota`, "Cargar a mano"/"Limpiar override", "Actualizar cuota") con
  el botón "Autodetectar" en el header; abajo "Formaciones" (resumen de agentes y proveedores,
  Editar, Duplicar, Predeterminada, Eliminar) y "Nueva formación" en el header. El `help` y las
  `options` de `SETTINGS_SECTIONS` reflejan esto.
- **`ProjectDialog`**: al crear, select de formación (predeterminada preseleccionada + "Sin
  agentes") y la lista editable de agentes que se van a crear (agregar, editar, quitar). Al editar
  un proyecto existente esa parte no aparece.
- **Composer**: el destino y la cuota salen del equipo del proyecto; si el proyecto no tiene
  agentes, aviso ("armá el equipo desde la vista de Jerarquía") y placeholder acorde.
- Resto de los usos (`ApprovalsPanel`, `ChatDialog`, `CommunicationPanel`, `MessageItem`,
  `RunDetailDialog`, `HookDialog`, `McpDialog`, `SkillDialog`, `PresetDialog`, secciones de
  MCP/Skills/Órdenes, `HomeScreen`, `Sidebar`, `SearchPalette`, `ChatThread`,
  `OrchestratorThread`, `RunActivity`, `useNotifications`, `useSystemNotifications`,
  `useQuotaSync`, `RemoteApp`): listados por proyecto donde hay proyecto, unión de todos donde solo
  hay un id. En la paleta de búsqueda un agente ahora abre la jerarquía de su proyecto.

**CLI (`src/cli/main.ts`)**
- `ais agents list|add|edit|remove|init` trabajan sobre un proyecto (`-p <nombre>` / `-w <dir>`, y
  si no, el cwd, creándolo como el resto de los comandos). Nombres únicos por proyecto.
- Nuevo `ais formations list` y `ais formations apply <nombre> [-p|-w]`.
- `ais run`: primero resuelve el proyecto y después el agente dentro de su equipo; sin agentes el
  error dice cómo aplicar una formación.
- `quota`, `presets`, `hooks`, `skills`, `mcp`, `chat`, `history`, `status`, `approvals` y el feed
  en vivo resuelven agentes con helpers (`agentById`, `agentByName`, `projectAgentByName`).

**Docs**: `PLAN.md` (sección nueva "Agentes por proyecto y formaciones", API del store, jerarquía,
Configuración → Agentes, snapshot remoto) y `README.md` (proyectos, jerarquía y CLI).

## Commits

| hash | mensaje |
| --- | --- |
| `0a9f741` | Give every project its own team of agents, plus formations |
| `b136759` | Test the 9 -> 10 migration and the per-project team actions |
| `bb02d58` | Document the per-project teams and formations in PLAN.md and the README |
| `ce2959b` | Keep agent names unique when a formation joins a team that already has one |
| `dde1d15` | Tolerate a project written by an older build having no team yet |
| `9a12485` | Duplicate an agent as "Claude 3" instead of "Claude 2 2" |

## Verificación

Todo desde la raíz del worktree, todo en verde:

- `npx tsc --noEmit` → sin errores.
- `npm test` → 13 archivos, 127 tests. Nuevo `src/lib/__tests__/store-agents.test.ts` (9 tests):
  migración 9 → 10 (ids conservados en el primer proyecto, copia con ids nuevos y `parentId`
  remapeado en los demás, formación "Mi equipo" predeterminada, runtime por agente, config
  reescrita, `enabledFor` intacto), `addProject` (con formación, con "sin agentes", con equipo
  explícito), `applyFormation` (nombres únicos, runtime nuevo sin pisar el existente) y
  `removeAgent` (re-parenteo, solo en ese proyecto). `config-merge.test.ts` actualizado.
- `npm run build` y `npm run build:cli` → OK.
- `cd src-tauri && cargo check` → OK (el lado Rust no conoce `agents`, no cambió nada ahí).
- Prueba manual del CLI compilado contra un `APPDATA` de scratch con una config v9 real: la
  migración deja los ids originales en el proyecto de `lastProjectId`, ids nuevos en el otro, crea
  la formación predeterminada, y funcionan `agents list/add/edit/remove`, el rechazo de nombres
  duplicados, `formations list` y `formations apply` (renombrando a "Claude 2" al colisionar).

## Decisiones tomadas

- **`enabledFor` de skills y MCP**: como dice el plan, al aplicar una formación (o al copiar el
  equipo a los proyectos que no conservan ids) las asignaciones puntuales por agente **no** se
  copian; `"all"` sí sigue aplicando. El proyecto que conserva los ids (el de `lastProjectId`)
  mantiene sus asignaciones intactas; los demás quedan solo con las `"all"`.
- **Ids únicos entre proyectos**: `selectAgent` busca en todos los proyectos, así los ~78 usos que
  resolvían por id siguen andando sin tocarlos.
- **`selectAllAgents` cacheado** por identidad de `config.projects`: si devolviera un array nuevo en
  cada render, zustand entraría en un bucle de re-render.
- **Nombres únicos por proyecto**: los valida el diálogo, el CLI y `applyFormation` (que renombra a
  "Claude 2" en vez de dejar dos "Claude" que romperían la delegación por nombre).
- **`applyFormation` suma, no reemplaza**: nunca borra el equipo que ya estaba (ni su historial ni
  su runtime).
- **Detección**: la lista de "IAs instaladas" excluye `custom`, que no se detecta (se configura por
  agente con "Programa"/"Argumentos").
- **Pickers globales**: skills, MCP, hooks y órdenes son configuración global, así que sus selects
  de agente listan la unión de todos los proyectos (con el nombre del agente, sin el del proyecto).
- **`instructAgent`** ahora ignora un agente que no está en el equipo de ese proyecto: un hook
  `instruct` que apunte a un agente de otro proyecto no hace nada (antes el runtime global lo
  permitía). Es coherente con el modelo nuevo, pero es un cambio de comportamiento.
- **Robustez**: toda lectura de `project.agents` tolera el campo ausente, porque `mergeConfig` puede
  traer del disco un proyecto escrito por un build viejo mientras este proceso corre.

## Pendientes o dudas

- **No se pudo probar la UI en vivo**: el puerto 1420 está ocupado por un proceso del usuario y en
  este entorno no se pueden abrir puertos (`EADDRINUSE` también en un puerto libre), así que la
  verificación de la UI es typecheck + build + revisión de código. Intenté un test de render con
  `renderToStaticMarkup` pero zustand entrega el estado *inicial* en SSR (`getInitialState`), así
  que no sirve para componentes que leen del store, y no agregué jsdom por la regla de no sumar
  dependencias. Conviene una pasada manual por: crear proyecto con formación, jerarquía
  (agregar/duplicar/eliminar/guardar como formación) y Configuración → Agentes.
- **Migración en caliente**: si el usuario abre el build nuevo mientras sigue corriendo una app o un
  `ais serve` viejo (v9), el proceso viejo puede reescribir la config sin `formations` al guardar
  (su `mergeConfig` no conoce el campo). Conviene cerrar todo antes de estrenar esta versión.
- **`package-lock.json`** aparece modificado en el worktree desde antes de este trabajo; no lo toqué
  ni lo commiteé.
- Las formaciones no validan nombres duplicados entre sí (dos formaciones pueden llamarse igual);
  `ais formations apply` toma la primera que coincida.
