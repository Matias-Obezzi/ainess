# Proyectos: varias carpetas con tareas ejecutándose a la vez

Repo: C:\Users\matia\Desktop\projects\ais
Rama: la activa (main), sin cambiar de rama ni crear otras

## Objetivo
Que el usuario pueda tener varios **proyectos** (cada uno = una carpeta/workspace) y lanzar tareas en varios a la vez, con estado, sesiones, runs y mensajes separados por proyecto. Los agentes siguen siendo globales (una sola jerarquía compartida), pero su estado de ejecución es por proyecto. App y CLI.

## Contexto
- Leer `PLAN.md`, `src/types.ts`, `src/store.ts`, `src/lib/orchestrator.ts`, `src/cli/main.ts`, y los componentes que usan `workspaceDir`, `runtime`, `runs`, `messages`, `activeTaskRunId` (`Header.tsx`, `PromptPanel.tsx`, `CommunicationPanel.tsx`, `HierarchyGraph.tsx`, `AgentNode.tsx`, `AgentsPanel.tsx`, hooks).
- Hoy hay un único `workspaceDir` en la config y `runtime` está indexado por `agentId`. Un agente no puede tener dos runs simultáneos; con proyectos, sí puede (uno por proyecto).

## Cambios
1. Modelo (`src/types.ts`), config `version: 3` con migración desde 2:
   ```ts
   export interface Project { id: string; name: string; workspaceDir: string; color?: string; createdAt: number; }
   // AppConfig: reemplazar workspaceDir por
   projects: Project[]; lastProjectId: string | null;
   ```
   Migración: si había `workspaceDir` no nulo, crear un proyecto "Principal" con esa carpeta; si no, `projects: []`.
   `Run` gana `projectId: string`. `CommMessage` gana `projectId?: string` (los mensajes `system` globales pueden no tenerlo). `AgentRuntime` no cambia de forma pero el store la indexa por proyecto.
2. Store (`src/store.ts`):
   - `runtime: Record<string /*projectId*/, Record<string /*agentId*/, AgentRuntime>>`, `activeTaskRunId: Record<string /*projectId*/, string | null>`, `currentProjectId: string | null` (UI), `projects` en `config`.
   - Acciones: `addProject({ name, workspaceDir, color? })`, `updateProject(id, patch)`, `removeProject(id)` (mata sus runs primero con `stopAll(projectId)`), `setCurrentProject(id)` (persistir en `lastProjectId`).
   - `submitPrompt(text, targetAgentId, projectId)`, `instructAgent(agentId, text, projectId)`, `stopAgent(agentId, projectId)`, `stopAll(projectId?)` (sin argumento: todos los proyectos), `resetSession(agentId, projectId)`, `clearMessages(projectId?)`.
   - Selectores: `selectRuntime(state, projectId, agentId)` (devuelve idle por defecto si no existe), `selectProjectMessages(state, projectId)`, `selectRunningCount(state, projectId?)`, `selectProject(state, id)`.
   - Quitar `setWorkspaceDir`; el CLI y la UI usan proyectos.
3. Orquestador (`src/lib/orchestrator.ts`): todo el ciclo recibe `projectId` (lo lleva el `Run`): `cwd` = `project.workspaceDir`, runtime/sesiones por proyecto, `activeTaskRunId[projectId]`, cola de instrucciones por proyecto. Un mismo agente puede estar `working` en dos proyectos a la vez. Las continuaciones y delegaciones heredan el `projectId` del run padre.
4. UI:
   - `Header.tsx`: reemplazar el botón de workspace por un **selector de proyecto** (`Select` con los proyectos + opción "Nuevo proyecto…" que abre `ProjectDialog.tsx`: nombre, carpeta con el diálogo nativo, color). Al lado, un indicador por proyecto con runs activos (badge con número) para que se vea que hay otros proyectos trabajando. "Detener todo" detiene el proyecto actual; con `Shift` o desde un menú, todos.
   - `PromptPanel`, `CommunicationPanel`, `HierarchyGraph`/`AgentNode`, `useActivityIsland`, `useNotifications`: filtrar por `currentProjectId`. Si no hay proyecto, mostrar un estado vacío con botón "Crear proyecto".
   - Nueva pestaña **Proyectos** (`ProjectsPanel.tsx`): cards con nombre, carpeta, runs activos, última tarea, botones Abrir (setCurrentProject), Editar, Eliminar (confirmación con `island.confirm`).
   - El grafo muestra el estado del agente en el proyecto actual; si el agente está trabajando en otro proyecto, mostrar un badge chico "ocupado en <proyecto>".
5. CLI (`src/cli/main.ts`): `-w/--workspace <dir>` busca un proyecto con esa carpeta (normalizando la ruta) y si no existe lo crea (nombre = nombre de la carpeta) y lo persiste; `-p/--project <nombre>` elige por nombre; sin ninguno usa `process.cwd()`. Subcomandos `ais projects list|add <nombre> --dir <carpeta>|remove <nombre>`. La salida en vivo se filtra por el proyecto de la corrida.
6. `README.md`: sección "Proyectos".

## Casos borde y decisiones ya tomadas
- Dos tareas simultáneas en el MISMO proyecto no se permiten (el CLI/UI avisa "ya hay una tarea en curso en este proyecto"); en proyectos distintos sí.
- Al borrar un proyecto se descartan sus runs y mensajes de memoria.
- No tocar `src/components/ui/**`. Mantener el bundle web sin `node:*`.
- Texto visible en español.

## Fuera de alcance
- Agentes distintos por proyecto (la jerarquía es global). Persistir runs.

## Verificación
```
npx tsc --noEmit
npm run build
npm run build:cli
mkdir %TEMP%\ais-p1 %TEMP%\ais-p2
node bin/ais.js projects add p1 --dir %TEMP%\ais-p1
node bin/ais.js projects list
node bin/ais.js -a Antigravity -w %TEMP%\ais-p2 "Creá un archivo a.txt con el texto: proyecto dos"
type %TEMP%\ais-p2\a.txt
node bin/ais.js projects list      (debe mostrar p1 y ais-p2)
```
Commitear con mensajes en inglés. No hacer push.
