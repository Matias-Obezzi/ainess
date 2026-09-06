# Agentes que trabajan en su propio git worktree

Repo: C:\Users\matia\Desktop\projects\ais-wt-wt (worktree, rama `feat/agent-worktrees`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

Que un agente pueda trabajar en su **propio git worktree** del repo del proyecto, en su propia rama,
en vez de compartir la carpeta con todos los demás. Así dos agentes pueden implementar en paralelo
sin pisarse el índice de git, que es hoy el motivo por el que hay que despacharlos de a uno.

Cuando el agente termina, el usuario decide qué hacer con esa rama: mergearla a la rama base,
abrir la carpeta, o descartar el worktree.

## Contexto

Leé `PLAN.md` antes de empezar.

- Cada corrida se lanza en `src/lib/orchestrator.ts` (`startRun`) con
  `cwd: project.workspaceDir`. Ese es **el único lugar** que decide dónde corre un agente: si el
  agente tiene worktree, ahí va su carpeta en vez de la del proyecto.
- Ejecutar comandos: `getTransport().exec(program, args, cwd?, timeoutSecs?)`.
  `npm install` puede tardar minutos: usá un timeout amplio (600 s) y contá lo que está pasando.
- `src/lib/confirm.ts` tiene `confirmDelete`; `src/lib/open-external.ts` abre cosas afuera.
- El diálogo de agente es `src/components/AgentDialog.tsx`; el nodo y su menú,
  `src/components/AgentNode.tsx` y `src/components/menu-actions.tsx`.

**Ojo con la trampa de `node_modules`**: nunca crear un junction ni un symlink de `node_modules`
apuntando al del repo principal. `git worktree remove` sigue el enlace y borra el original. Si hace
falta, se instala de verdad dentro del worktree.

## Cambios

### 1. Modelo

- `AgentConfig` (que ahora vive dentro de `Project.agents`) suma `worktree?: boolean` ("trabaja en su propio worktree"). Si el proyecto de
  agentes ya movió `AgentConfig` adentro de `Project`, agregá el campo donde haya quedado.
- Estado nuevo en el store: `worktrees: Record<projectId, AgentWorktree[]>`, con

```ts
export interface AgentWorktree {
  agentId: string;
  /** Carpeta del worktree, hermana del workspace. */
  path: string;
  branch: string;
  /** Rama desde la que se creó. */
  base: string;
  createdAt: number;
  /** Última vez que se preparó (install incluido). */
  readyAt?: number;
}
```

Se persiste con el resto del estado del proyecto (mirá cómo lo hace `src/lib/history.ts`).

### 2. `src/lib/worktree.ts` (nuevo)

Parte pura y testeable:

- `worktreePath(workspaceDir, agentName): string` — carpeta hermana:
  `<workspace>-wt-<slug del agente>`. El slug: minúsculas, sin acentos, espacios a guiones.
- `worktreeBranch(agentName): string` — `ainess/<slug>`.
- `parseWorktreeList(stdout): { path: string; branch: string | null }[]` sobre
  `git worktree list --porcelain`.

Parte con I/O:

- `ensureWorktree(project, agent, onStep): Promise<AgentWorktree>`:
  1. `git -C <workspace> rev-parse --is-inside-work-tree`; si no es repo, tirá un error claro
     ("El proyecto no es un repositorio git").
  2. Si ya existe la carpeta y `git worktree list` la reconoce, devolvela sin tocar nada.
  3. Si no, `git -C <workspace> worktree add -b <branch> <path>` desde la rama actual. Si la rama ya
     existe, `git -C <workspace> worktree add <path> <branch>`.
  4. Si el repo tiene `package.json` y el worktree no tiene `node_modules`, correr `npm install`
     adentro. Informá cada paso por `onStep` para que la UI lo cuente en vivo.
- `removeWorktree(project, agentId, opts: { deleteBranch: boolean })`:
  `git -C <workspace> worktree remove --force <path>` y, si se pidió, `git branch -D <branch>`.
- `mergeWorktree(project, agentId)`: se niega si el workspace principal tiene cambios sin commitear
  (`git status --porcelain` no vacío) y si el worktree tiene cambios sin commitear. Si está todo
  limpio, `git -C <workspace> merge --no-ff <branch>`. Devolvé el resultado (mergeado, conflictos,
  o el motivo del rechazo) para mostrarlo.

### 3. Orquestador

En `startRun`, si el agente tiene `worktree` activo:

1. `await ensureWorktree(...)` antes de lanzar (con el estado del agente en "preparando" mientras
   tanto, o el equivalente que ya exista).
2. Usá `worktree.path` como `cwd` y, para Antigravity, también como `--add-dir`.
3. Si preparar el worktree falla, la corrida no arranca: el run queda en error con ese mensaje.

Nada de mergear automáticamente: eso lo decide el usuario.

### 4. UI

- **Diálogo de agente**: un switch "Trabajar en su propio worktree", con una línea que explique que
  se crea una rama `ainess/<agente>` y una carpeta hermana del proyecto, y que las dependencias se
  instalan ahí la primera vez.
- **Nodo de la jerarquía**: si el agente tiene worktree, mostrá la rama en tipografía monoespaciada
  debajo del nombre.
- **Panel de worktrees**: accesible desde la vista de jerarquía (botón "Worktrees"). Una fila por
  worktree: agente, rama, carpeta, si tiene cambios sin commitear, y acciones: "Abrir carpeta"
  (`openExternal`), "Mergear a <base>" (con confirmación y el resultado en un toast) y "Eliminar"
  (`confirmDelete`, con una casilla para borrar también la rama).
- Mientras se prepara un worktree, la UI dice en qué paso va ("Creando el worktree…",
  "Instalando dependencias…").

## Casos borde y decisiones ya tomadas

- Un merge con conflictos no se deshace solo: se avisa que quedó en conflicto y que hay que
  resolverlo a mano en la carpeta del proyecto.
- Si el usuario apaga el switch del worktree, la carpeta no se borra: se deja de usar y queda en el
  panel para que decida.
- Dos agentes nunca comparten worktree: la carpeta lleva el nombre del agente.
- Si el proyecto no es un repo git, el switch queda deshabilitado con la explicación.
- No agregues dependencias nuevas.
- Código en inglés, UI en español.

## Fuera de alcance

- La vista remota (`src/remote/**`).
- Crear PRs desde la app.
- i18n: no traduzcas nada.
- Nada de push: solo commits locales.

## Verificación

```
npx tsc --noEmit
npm test
npm run build
```

Tests obligatorios en `src/lib/__tests__/worktree.test.ts`: `worktreePath` y `worktreeBranch` (con
nombres con acentos y espacios) y `parseWorktreeList` (varios worktrees, uno con rama suelta).
