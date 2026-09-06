# Informe — 030 Estado de git: rama y pull requests del proyecto

Rama: `feat/git-status` (worktree `C:\Users\matia\Desktop\projects\ais-wt-git`). Sin push.

## Qué se hizo

**`src/lib/git.ts` (nuevo, puro y testeado)**
- `parseGitStatus(stdout)` sobre `git status --porcelain=v2 --branch`: lee `# branch.head`,
  `# branch.upstream` y `# branch.ab +N -M`; cada línea que no arranca con `#` cuenta como un cambio
  (staged, sin stagear, renombrados, conflictos y untracked). Tolera CRLF, salida vacía, repo recién
  iniciado (`# branch.oid (initial)`) y HEAD suelto.
- `parsePullRequests(json)` sobre la salida de `gh pr list --json …`: `isDraft` manda sobre `state`;
  `statusCheckRollup` se reduce a `failing` / `pending` / `passing` / `none` (una falla gana sobre
  todo lo demás); `reviewDecision` a `approved` / `changes-requested` / `pending` / `none`. JSON
  inválido, no-array o items sin `number` devuelven lista vacía, nunca tiran.

**`src/lib/git-repo.ts` (nuevo, el que ejecuta)**
- `readRepoState(workspaceDir)`: `git rev-parse --is-inside-work-tree` decide `isRepo`;
  `git status --porcelain=v2 --branch` para el estado; `gh pr list --json … --limit 20` para los PRs.
- Timeout de 10 s por comando, todo solo lectura (ni `fetch`, ni `pull`, ni nada que escriba).
- Nunca tira: si `gh` no se puede lanzar → `prsUnavailable: "no-gh"`; si el error habla de sesión →
  `"no-auth"`; cualquier otro fallo → `"no-remote"`. En el navegador (`transport-null` devuelve
  `code: null`) queda `isRepo: false` y la UI no muestra nada.

**Store (`src/store.ts`)**
- `repoState: Record<projectId, RepoState>` y `refreshRepoState(projectId)`, con un mapa de lecturas
  en curso para que el timer, la apertura del proyecto y el fin de un run no disparen tres `git`
  encima. Se limpia en `removeProject`.

**`src/hooks/useRepoSync.ts` (nuevo)** — montado en `App.tsx` junto a `useQuotaSync`: refresca el
proyecto actual al abrirlo, cada 60 s y cuando termina el último run activo del proyecto.

**UI (`src/components/GitStatus.tsx`, nuevo)**
- `GitStatusLine` en la fila del proyecto del sidebar: ícono `GitBranch`, rama con `truncate` y, a la
  derecha, `●N` (cambios sin commitear, ámbar), `↑N` / `↓N` y `PR N` con el color del peor estado
  (rojo si algún CI falla, ámbar si algo espera revisión o CI, verde si está todo bien). Tooltip con
  cada número explicado en palabras. Si no es repo no se muestra nada.
- `GitBranchButton` en la cabecera de `ProjectScreen.tsx`, al lado de la ruta: botón fantasma con la
  rama y las mismas señales, y un `Popover` con el bloque de rama (rama, remoto, cambios sin
  commitear, adelante/atrás), la lista de PRs abiertos (número, título truncado, rama de origen y
  chapitas de CI y revisión) que abren el PR con `openExternal`, un botón "Actualizar" y, cuando no
  hay PRs por falta de `gh`/sesión/remoto, la línea que lo explica más `winget install GitHub.cli`
  para el caso `"no-gh"`.

Sin dependencias nuevas. UI en español, código y comentarios en inglés.

## Commits

- `1757a8c` — Read the repo state: git status and open pull requests (`src/lib/git.ts`,
  `src/lib/git-repo.ts`, `src/lib/__tests__/git.test.ts`, el plan).
- `b4a45f2` — Show the branch, its changes and the open PRs in the app (store, hook, `App.tsx`,
  `GitStatus.tsx`, `Sidebar.tsx`, `ProjectScreen.tsx`).

## Verificación

- `npx tsc --noEmit` — sin errores.
- `npm test` — 13 archivos, 126 tests en verde (8 nuevos en `src/lib/__tests__/git.test.ts`:
  rama con upstream y adelante/atrás, repo sucio con renombrados y untracked, repo recién iniciado,
  HEAD suelto y salida vacía; PR draft, CI con falla que gana sobre lo pendiente, revisión aprobada
  con todo verde, y JSON inválido o campos faltantes).
- `npm run build` — build de front y de la vista remota, sin errores.
- `npm run build:cli` — OK (solo los avisos `INEFFECTIVE_DYNAMIC_IMPORT` que ya existían).
- No se corrió `cargo check`: no se tocó nada de Rust.
- Contrastado contra la salida real de `git status --porcelain=v2 --branch` y de
  `gh pr list --json …` en este mismo worktree.

## Decisiones tomadas

- **HEAD suelto**: `branch.head (detached)` deja `branch` en `null`; el sidebar no dibuja la línea y
  el botón de la cabecera dice "sin rama" / "HEAD suelto". El plan no lo cubría.
- **Motivo por defecto de los PRs**: un fallo de `gh` que no menciona binario faltante ni sesión cae
  en `"no-remote"`, que es lo que el usuario ve igual ("no hay PRs para esta carpeta"). Los otros dos
  motivos se detectan por el texto del error (`no-auth` primero, después `no-gh`).
- **`reviewDecision` vacío** se mapea a `"none"`: la app no pide el campo `reviewRequests`, así que no
  hay forma de distinguir "vacío con revisores pedidos" sin agregar otro campo a la consulta.
- **Componentes en un archivo propio** (`src/components/GitStatus.tsx`) en vez de inline en
  `Sidebar.tsx` y `ProjectScreen.tsx`: los dos lugares comparten colores, etiquetas y el mismo
  pedazo de store.
- **Lecturas de-duplicadas** en el store (mapa de promesas en vuelo) para que el intervalo de 60 s no
  se pise con el refresco de fin de run.
- **Fuera del snapshot remoto**: `repoState` no se manda a la vista remota, que estaba fuera de
  alcance.

## Pendientes o dudas

- El commit `b4a45f2` arrastra una línea de `package-lock.json` (`"peer": true`) que ya estaba
  modificada en el worktree antes de empezar (la dejó el `npm install` del worktree). Es inocua, pero
  no es parte del cambio.
- No se levantó la app (`npm run tauri dev`): la verificación pedida por el plan es typecheck, tests y
  build, y el arranque de Tauri implica compilar Rust. El render real de la línea del sidebar y del
  popover no se miró en vivo.
- `gh pr list` no filtra por rama: muestra los PRs abiertos del repo, hasta 20, como pedía el plan.
