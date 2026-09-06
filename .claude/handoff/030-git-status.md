# Estado de git: rama y pull requests del proyecto

Repo: C:\Users\matia\Desktop\projects\ais-wt-git (worktree, rama `feat/git-status`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

Que el usuario vea, sin salir de la app, en qué estado está el repo del proyecto: la rama actual, si
tiene cambios sin commitear, cuánto está adelante o atrás del remoto, y los pull requests abiertos
con su estado de revisión y de CI. Se muestra en dos lugares: el sidebar del proyecto y la cabecera
del chat del proyecto.

## Contexto

Leé `PLAN.md` antes de empezar.

- Cada proyecto tiene `workspaceDir`: ahí se corren los comandos.
- Para ejecutar: `getTransport().exec(program, args, cwd?, timeoutSecs?)` devuelve
  `{ code, stdout, stderr }` y ya existe en los cuatro transports (`src/lib/transport.ts`). En el
  navegador devuelve vacío, así que la UI tiene que aguantar "sin datos" sin romperse.
- `src/lib/quota.ts` es un buen ejemplo de módulo que combina parseo puro (testeado) con llamadas al
  transport.
- El sidebar del proyecto está en `src/components/shell/Sidebar.tsx`; la cabecera del proyecto, en
  `src/components/shell/ProjectScreen.tsx`.
- Hay componentes `Badge`, `Tooltip`, `Popover` y `Skeleton` en `src/components/ui/`.

## Cambios

### 1. `src/lib/git.ts` (nuevo, parseo puro y testeado)

```ts
export interface GitStatus {
  branch: string | null;
  /** Cambios sin commitear (contando staged y no staged). */
  dirty: number;
  ahead: number;
  behind: number;
  /** Nombre del remoto rastreado, si hay. */
  upstream: string | null;
}

export interface PullRequest {
  number: number;
  title: string;
  state: "open" | "draft" | "merged" | "closed";
  /** Rama de origen. */
  head: string;
  /** Resumen del CI: "passing" | "failing" | "pending" | "none". */
  checks: "passing" | "failing" | "pending" | "none";
  /** Revisión: "approved" | "changes-requested" | "pending" | "none". */
  review: "approved" | "changes-requested" | "pending" | "none";
  url: string;
  updatedAt: number;
}

/** Lee `git status --porcelain=v2 --branch`. */
export function parseGitStatus(stdout: string): GitStatus;

/** Lee la salida JSON de `gh pr list`. Tolera campos faltantes y JSON inválido. */
export function parsePullRequests(json: string): PullRequest[];
```

`parseGitStatus` sobre `--porcelain=v2 --branch`: las líneas `# branch.head`, `# branch.upstream` y
`# branch.ab +N -M` dan rama, upstream y adelante/atrás; cada línea que no empieza con `#` es un
cambio. Un repo sin commits (`branch.oid (initial)`) devuelve la rama con cero de todo.

`parsePullRequests` sobre lo que devuelve
`gh pr list --json number,title,state,isDraft,headRefName,url,updatedAt,statusCheckRollup,reviewDecision`:
- `isDraft` manda sobre `state` para el valor `"draft"`.
- `statusCheckRollup` es una lista de checks; si alguno falló → `"failing"`, si alguno está en curso o
  pendiente → `"pending"`, si están todos bien → `"passing"`, si no hay ninguno → `"none"`.
- `reviewDecision`: `APPROVED` → `"approved"`, `CHANGES_REQUESTED` → `"changes-requested"`,
  `REVIEW_REQUIRED` o vacío con revisores pedidos → `"pending"`, si no `"none"`.

### 2. `src/lib/git-repo.ts` (nuevo, el que ejecuta)

```ts
export interface RepoState {
  /** false cuando la carpeta no es un repo git. */
  isRepo: boolean;
  status: GitStatus | null;
  pullRequests: PullRequest[];
  /** Por qué no hay PRs: sin `gh`, sin sesión, o sin remoto de GitHub. */
  prsUnavailable?: "no-gh" | "no-auth" | "no-remote";
  fetchedAt: number;
}

export async function readRepoState(workspaceDir: string): Promise<RepoState>;
```

- `git rev-parse --is-inside-work-tree` decide `isRepo`; si no lo es, devolvé el resto vacío sin
  error.
- `git status --porcelain=v2 --branch` para el estado.
- PRs solo si hay `gh`: corré `gh pr list --json … --limit 20` en el `workspaceDir`. Si el comando no
  existe → `"no-gh"`; si la salida menciona autenticación → `"no-auth"`; si no hay remoto de GitHub →
  `"no-remote"`. Nunca tires: devolvé el motivo.
- Timeout corto en cada exec (10 s alcanza) y nada de bloquear la UI.

### 3. Store

- `repoState: Record<projectId, RepoState>` y `refreshRepoState(projectId)`.
- Un hook `src/hooks/useRepoSync.ts` montado en `App.tsx` que refresca el proyecto actual al abrirlo
  y cada 60 s, y también cuando termina la última corrida activa del proyecto (igual que hace
  `useQuotaSync`, mirá ese archivo antes de escribir el tuyo).

### 4. UI: sidebar

En la fila del proyecto en `Sidebar.tsx`, cuando el proyecto es un repo:

- Debajo del nombre, una línea chica con el ícono `GitBranch`, la rama con `truncate`, y a la
  derecha las señales compactas: `●N` si hay cambios sin commitear, `↑N ↓N` si está adelante o atrás,
  y `PR N` con el color del peor estado (rojo si algún CI falla, ámbar si hay revisión pedida, verde
  si todo bien).
- El tooltip explica cada número en palabras.
- Si no es repo, no se muestra nada (ni error).

### 5. UI: cabecera del proyecto

En `ProjectScreen.tsx`, junto al nombre y la ruta, un botón fantasma con la rama actual que abre un
`Popover` con el detalle:

- Bloque de rama: rama, upstream, cambios sin commitear, adelante/atrás.
- Lista de PRs abiertos: número, título con `truncate`, la rama de origen, y dos chapitas, una de CI
  y otra de revisión, con los mismos colores del sidebar. Cada fila abre el PR en el navegador
  (`openExternal` de `src/lib/open-external.ts`).
- Botón "Actualizar" que llama a `refreshRepoState`.
- Cuando no hay PRs por falta de `gh` o de sesión, una línea que lo dice y, para `"no-gh"`, el
  comando `winget install GitHub.cli`.

## Casos borde y decisiones ya tomadas

- Nada de escribir en el repo: esto es solo lectura. Ni `fetch`, ni `pull`, ni crear ramas.
- Un repo enorme no puede colgar la UI: los comandos van con timeout y el estado se guarda en el
  store, no se recalcula en cada render.
- Si `gh` está pero el repo no es de GitHub, se muestra el estado de git igual.
- No agregues dependencias nuevas.
- Código en inglés, UI en español.

## Fuera de alcance

- La vista remota (`src/remote/**`).
- Crear, mergear o revisar PRs desde la app.
- Nada de push: solo commits locales.

## Verificación

```
npx tsc --noEmit
npm test
npm run build
```

Tests obligatorios en `src/lib/__tests__/git.test.ts` para `parseGitStatus` (rama con upstream y
adelante/atrás, repo sucio, repo recién iniciado sin commits) y `parsePullRequests` (draft, CI que
falla, revisión aprobada, JSON inválido → lista vacía).
