# Agentes por proyecto, instancias repetidas y formaciones

Repo: C:\Users\matia\Desktop\projects\ais-wt-agents (worktree, rama `feat/project-agents`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

Hoy los agentes son una lista global (`config.agents`) que comparten todos los proyectos. Queremos:

1. Que **cada proyecto tenga sus propios agentes y su propia jerarquía**.
2. Que Configuración → Agentes deje de ser "los agentes" y pase a ser **detección**: qué CLIs hay
   instalados, con qué versión y qué cuota, para saber qué se le puede ofrecer al usuario.
3. Que se puedan tener **varias instancias del mismo CLI con roles distintos** en un proyecto (dos
   Claude, uno planificador y otro revisor, por ejemplo), gestionadas desde la vista de jerarquía.
4. Que existan **formaciones**: plantillas de equipo guardadas, con una marcada como predeterminada,
   que el usuario elige y puede editar antes de crear un proyecto.

## Contexto

Leé `PLAN.md` antes de empezar (arquitectura y contratos).

- `src/types.ts`: `AgentConfig` (id, name, provider, role, parentId, model, autoApprove, description,
  systemPrompt, customCommand, color, requireApproval) y `AppConfig.agents: AgentConfig[]`.
- `src/store.ts`: `selectAgent(state, id)`, `selectChildren(state, agentId)`, `selectRoots(state)`,
  `selectSkillsFor(state, agentId)` y las acciones `addAgent`/`updateAgent`/`removeAgent`.
  `runtime` ya es `Record<projectId, Record<agentId, AgentRuntime>>`: eso no cambia.
- `config.agents` se lee en ~78 lugares (`grep -rn "config.agents" src`). La mayoría son listados
  para elegir un agente; casi todos tienen a mano el proyecto actual.
- El CLI (`src/cli/main.ts`) tiene `ais agents list|add|edit|remove|init`.
- `AppConfig.version` es 9 y `src/store.ts` tiene las migraciones al final de `runInit`.
- `src/lib/config-merge.ts` mergea por colecciones con `id`; `projects` ya está ahí.

## Cambios

### 1. `src/types.ts`

```ts
export interface Project {
  id: string;
  name: string;
  workspaceDir: string;
  color?: string;
  createdAt: number;
  /** The team that works on this project. Empty means the project has no agents yet. */
  agents: AgentConfig[];
}

/** A saved team template: what a new project starts with. */
export interface Formation {
  id: string;
  name: string;
  description?: string;
  /** Same shape as a project's agents; ids are regenerated when it is applied. */
  agents: AgentConfig[];
}
```

En `AppConfig`: sacá `agents` y agregá `formations: Formation[]` y `defaultFormationId: string | null`.
Subí `version` a `10`.

### 2. Migración (en `runInit`, `src/store.ts`)

Cuando `config.version < 10`:

- Cada proyecto existente recibe una **copia** de los agentes globales, con ids nuevos y los
  `parentId` remapeados a los ids nuevos de ese proyecto. Ojo: el `runtime` y el historial guardan
  ids viejos; para no perder el estado, en el **primer** proyecto (el de `lastProjectId`, o el
  primero si no hay) conservá los ids originales, y en los demás generá nuevos.
- Los agentes globales se guardan además como formación `"Mi equipo"`, que queda de predeterminada.
- `config.agents` se borra.

La migración no puede perder proyectos ni historial: si algo no se puede mapear, dejalo como está y
seguí.

### 3. Store

- `selectAgent(state, id)`: busca en **todos** los proyectos (los ids son únicos), así los ~78 usos
  que hoy resuelven por id siguen funcionando.
- Nuevo `selectProjectAgents(state, projectId): AgentConfig[]`.
- `selectChildren(state, agentId)` y `selectRoots(state)`: ahora necesitan el proyecto. Cambiá la
  firma a `(state, projectId, agentId)` / `(state, projectId)` y actualizá los llamadores. Donde el
  llamador solo tiene el agentId, resolvé el proyecto con el agente (`selectProjectOfAgent`).
- Acciones: `addAgent(projectId, agent)`, `updateAgent(projectId, id, patch)`,
  `removeAgent(projectId, id)`. Al borrar un agente, sus hijos pasan a colgar de su padre (no los
  borres en cascada) y se limpia su `runtime` en ese proyecto.
- `addProject(project, opts?: { formationId?: string })`: si viene una formación (o hay una por
  defecto), copia sus agentes con ids nuevos y crea el `runtime` de cada uno.
- Formaciones: `addFormation`, `updateFormation`, `removeFormation`, `setDefaultFormation(id|null)`,
  y `saveProjectAsFormation(projectId, name)` (guarda el equipo actual del proyecto como plantilla).
- `src/lib/config-merge.ts`: sumá `formations` a `ID_COLLECTIONS`. Los agentes ahora viajan dentro de
  cada proyecto, así que el merge de `projects` los cubre.

### 4. Varias instancias del mismo CLI

Ya es posible por modelo (cada agente tiene su id), pero la UI lo impide en la práctica. Asegurate de
que:

- El diálogo de agente permita crear otro agente con el mismo `provider` sin quejarse, y que el
  nombre sea lo único que tiene que ser único **dentro del proyecto** (case-insensitive).
- Al crear uno nuevo, si ya hay otro del mismo proveedor, el nombre por defecto sea
  `<Proveedor> 2`, `<Proveedor> 3`, etc.
- El bloque `delegate` resuelve por nombre (ver `parseDelegations` y `handleExit` en
  `src/lib/orchestrator.ts`): con nombres únicos por proyecto sigue funcionando. Verificá que la
  búsqueda del hijo use los agentes **del proyecto del run**, no la lista global.

### 5. Vista de jerarquía: gestionar el equipo del proyecto

En `src/components/HierarchyGraph.tsx` (y el nodo/inspector):

- Botón "Agregar agente" que abre el diálogo ya existente, creando en el proyecto actual.
- En el menú del nodo (que ya tiene click derecho y tres puntos): "Duplicar", que crea otro agente
  con el mismo proveedor y modelo, nombre nuevo y el mismo padre.
- "Eliminar" con la confirmación que ya existe (`confirmDelete`).
- Un botón "Guardar como formación" que llama a `saveProjectAsFormation`.

### 6. Configuración → Agentes pasa a ser detección

`src/components/settings/AgentsSection.tsx` deja de listar agentes y muestra:

- Una fila por proveedor conocido (`PROVIDERS`): logo, nombre, si está detectado y dónde, la versión
  y su cuota (reusá `QuotaRing`/`summarizeAgentQuota`), más el botón "Autodetectar" que ya existe y
  el override de ruta si ya estaba.
- Debajo, la sección **Formaciones**: lista de formaciones con su equipo resumido (cuántos agentes y
  de qué proveedores), botones para crear, editar, duplicar, borrar y marcar la predeterminada.
  El editor de una formación reusa el mismo diálogo de agente, trabajando sobre la formación.
- El texto de ayuda de la sección (en `SETTINGS_SECTIONS`, `SettingsDialog.tsx`) y sus `options`
  tienen que reflejar esto.

### 7. Crear un proyecto: elegir y editar la formación

En el diálogo de proyecto (`src/components/ProjectDialog.tsx`):

- Un select de formación, con la predeterminada preseleccionada y una opción "Sin agentes".
- Debajo, la lista de agentes que va a crear, editable antes de confirmar: cambiar nombre, rol,
  modelo, quitar uno, agregar otro. Lo que se guarda en el proyecto es lo que quedó en esa lista.
- Al editar un proyecto existente, esta parte no aparece (el equipo se gestiona desde la jerarquía).

### 8. CLI

`ais agents list|add|edit|remove` ahora trabajan sobre un proyecto: aceptan `-p <proyecto>` o
`-w <dir>` como el resto de los comandos, y si no se puede resolver el proyecto, error claro.
Sumá `ais formations list` y `ais formations apply <nombre> -p <proyecto>`.

### 9. Todo lo demás que leía `config.agents`

Recorré `grep -rn "config.agents" src` y llevá cada uso al proyecto correspondiente:
`Composer`, `ChatDialog`, `InstructDialog`, `SearchPalette`, `ApprovalsPanel`, `QuotaIndicator`,
`useQuotaSync`, `src/remote/RemoteApp.tsx`, `src/lib/remote.ts` (el snapshot), `src/lib/chat.ts`,
`src/lib/orchestrator.ts`, `src/lib/hooks.ts` y el CLI. Cuando el contexto no tiene proyecto (por
ejemplo la sincronización de cuota), usá la unión de los agentes de todos los proyectos.

## Casos borde y decisiones ya tomadas

- Un proyecto sin agentes es válido: la UI ofrece crear el equipo (botón que abre la jerarquía o
  aplica una formación), y el composer avisa que no hay a quién mandarle nada.
- Los `enabledFor` de skills y MCP siguen guardando ids de agente. Al aplicar una formación los ids
  son nuevos, así que esas asignaciones puntuales no se copian; `"all"` sí. Anotalo en el informe.
- No borres el historial ni el runtime de un proyecto al cambiar su equipo.
- No agregues dependencias nuevas.
- Código en inglés, UI en español.

## Fuera de alcance

- El tablero de tareas, el grafo de tareas y las notificaciones: son otros planes en curso.
- i18n: viene después, no traduzcas nada todavía.
- Worktrees por agente: otro plan.

## Verificación

Desde la raíz del worktree:

```
npx tsc --noEmit
npm test
npm run build
cd src-tauri && cargo check
```

Sumá tests de la migración en `src/lib/__tests__/` (config version 9 → 10: los agentes globales
terminan en cada proyecto, el primero conserva los ids, se crea la formación por defecto) y de
`addProject` con formación (ids nuevos, `parentId` remapeado, runtime creado).
