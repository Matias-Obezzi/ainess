# Informe — 032 Agentes que trabajan en su propio git worktree

Repo: `C:\Users\matia\Desktop\projects\ais-wt-wt`, rama `feat/agent-worktrees` (sin push).

## Qué se hizo

### Modelo (`src/types.ts`)
- `AgentConfig.worktree?: boolean` (el agente vive dentro de `Project.agents`, como quedó tras el
  trabajo de agentes por proyecto).
- `AgentWorktree { agentId, path, branch, base, createdAt, readyAt? }`.
- `AgentRuntime.preparing?: string`: el paso que se está ejecutando antes de que arranque la
  corrida ("Creando el worktree…", "Instalando dependencias…"). Solo en memoria.

### `src/lib/worktree.ts` (nuevo)
Parte pura: `worktreeSlug`, `worktreePath(workspaceDir, agentName)` → `<workspace>-wt-<slug>`,
`worktreeBranch(agentName)` → `ainess/<slug>`, `parseWorktreeList(stdout)` y `samePath`.

Parte con I/O:
- `ensureWorktree(project, agent, onStep?, known?)`: exige repo git (error claro si no), reusa el
  worktree ya registrado **y preparado**, si no hace `git worktree add [-b <rama>] <path>` desde la
  rama actual (detecta si la rama ya existe) y, cuando el repo tiene `package.json` y el worktree
  no tiene `node_modules`, corre `npm install` adentro con timeout de 600 s. Cada paso se informa
  por `onStep`.
- `removeWorktree(project, worktree, { deleteBranch })`: `git worktree remove --force`, más
  `git branch -D` si se pidió. Si la carpeta ya no está, hace `worktree prune` y lo reporta bien.
- `mergeWorktree(project, worktree)`: se **niega** si el workspace o el worktree tienen cambios sin
  commitear; si está limpio hace `git merge --no-ff <rama>`. Devuelve
  `merged | up-to-date | dirty-workspace | dirty-worktree | conflict | error` con el mensaje listo
  para mostrar. Un merge en conflicto se informa, nunca se deshace solo.
- `hasUncommittedChanges(dir)` para la columna de estado del panel.
- **Nunca** se crea un junction/symlink de `node_modules`: hay un comentario explícito en el
  archivo explicando por qué (`git worktree remove` sigue el enlace y borra el original).

### Store y persistencia
- `AppState.worktrees: Record<projectId, AgentWorktree[]>`, con `setWorktree` / `forgetWorktree` y
  los selectores `selectProjectWorktrees` / `selectWorktree`.
- Se persiste en el archivo de historial del proyecto (`src/lib/history.ts`), junto a runs,
  mensajes y aprobaciones. El disco solo **siembra** la lista la primera vez que se lee el
  proyecto: si adoptara el archivo en cada merge, un worktree recién eliminado reviviría.
  `clearHistory` conserva los worktrees; `removeProject` los olvida sin tocar el disco.

### Orquestador
- `startRun` resuelve el `cwd` con `resolveCwd` antes de construir el comando: el worktree del
  agente cuando tiene uno, `project.workspaceDir` si no. Antigravity y Copilot reciben ese mismo
  path como `--add-dir` porque ya lo derivan de `input.cwd`.
- Si preparar el worktree falla, la corrida queda en error con ese mensaje y no se lanza nada.
- El mensaje de error ahora es `err.message` en vez de `String(err)` (sin el prefijo `Error:`).

### UI (en español)
- **AgentDialog**: switch "Trabajar en su propio worktree" con la línea que explica la rama
  `ainess/<agente>`, la carpeta hermana y la instalación de dependencias. Deshabilitado, con la
  explicación, cuando el proyecto no es un repo git.
- **AgentNode y AgentInspector**: la rama en tipografía monoespaciada debajo del nombre (tooltip
  con la carpeta), y el paso de preparación en lugar del estado mientras se prepara.
- **WorktreePanel** (`src/components/WorktreePanel.tsx`), desde el botón "Worktrees" de la
  jerarquía: una fila por worktree con agente, rama (y de qué rama salió), carpeta, si tiene
  cambios sin commitear, y las acciones "Abrir carpeta", "Mergear a &lt;rama&gt;" (confirma y
  muestra el resultado en un toast) y "Eliminar" (diálogo con la casilla "Borrar también la rama" y
  después `confirmDelete`). Botón "Actualizar estado" para releer los `git status`.

### Documentación
- Sección nueva "Worktrees por agente" en `PLAN.md`, antes de la sección de UI.

## Commits

```
d865a70 Recognise a pnpm install inside a worktree too
70a5198 Subscribe the agent dialog to its own project's repo state only
4dff235 Write the agent worktrees down in PLAN.md and show the branch in the inspector
ad3bf09 Turn the worktree of an agent on, see it, and decide what to do with it
c43e0fd Give an agent its own git worktree to work in
```

## Verificación

Todo desde la raíz del worktree:

- `npx tsc --noEmit` → sin errores.
- `npm test` → 17 archivos, 183 tests, todos verdes. Incluye
  `src/lib/__tests__/worktree.test.ts` (13 tests): `worktreeSlug` y `worktreeBranch` con acentos,
  espacios y nombres impronunciables, `worktreePath` en Windows y POSIX (con y sin separador final,
  dos agentes nunca comparten carpeta), `parseWorktreeList` con varios worktrees (uno detached, uno
  bare, uno locked, CRLF) y `samePath`.
- `npm run build` → `tsc` + build de la app + build remoto, sin errores.
- No se tocó Rust, así que no hizo falta `cargo check`.

## Decisiones tomadas

1. **Firma de `removeWorktree` / `mergeWorktree`**: el plan las describía con `agentId`. Toman el
   `AgentWorktree` completo para que `src/lib/worktree.ts` no tenga que importar el store (queda
   testeable y sin ciclo con el orquestador). `ensureWorktree` recibe el registro conocido como
   cuarto parámetro opcional por lo mismo.
2. **"Abrir carpeta" usa `revealItemInDir`, no `openExternal`**: `openExternal` llama a `openUrl`,
   que no acepta rutas de Windows, y `opener:allow-open-path` **no** está en el permiso por defecto
   de la capability. `revealItemInDir` sí, así que se agregó `revealPath()` en
   `src/lib/open-external.ts` y no hubo que ampliar el alcance del plugin ni tocar Rust.
3. **Doble paso al eliminar**: el diálogo junta la opción "Borrar también la rama" y su botón dice
   "Eliminar…" (con puntos suspensivos), y recién ahí se llama a `confirmDelete`, como pedía el
   plan. Son dos pasos, pero se trata de borrar carpetas y ramas del repo del usuario.
4. **Reuso de un worktree existente**: el plan decía "si ya existe, devolvela sin tocar nada". Se
   respeta cuando el registro tiene `readyAt`; si no lo tiene (una instalación de dependencias que
   quedó a mitad de camino), se completa la preparación en vez de confiar en la carpeta a ciegas.
5. **Detección de `node_modules`**: se busca `node_modules/.package-lock.json` (npm),
   `.yarn-state.yml` (yarn) o `.modules.yaml` (pnpm). No existe un "path exists" en el transport y
   `readFileAbs` es lo que hay.
6. **`npm` en Windows**: es un shim `.cmd` que no siempre se puede spawnear directo, así que si la
   llamada directa no arranca se reintenta por `cmd.exe /d /s /c npm install`.
7. **Apagar el switch no borra nada** (como pedía el plan): el registro queda en el panel para que
   el usuario decida. Lo mismo al eliminar un agente: el worktree sigue listado y la fila dice
   "Agente eliminado", así se puede borrar la carpeta desde la app.
8. **Eliminar un proyecto** olvida sus registros pero **no** corre `git worktree remove`: nada
   destructivo pasa sin que el usuario lo pida.

## Pendientes o dudas

- **Detener durante la preparación**: si el usuario aprieta "Detener" mientras corre el
  `npm install`, no pasa nada y la corrida arranca igual cuando termina. Es una limitación que ya
  existía (`kill_run` sobre un run todavía no spawneado devuelve `false` y no cierra el run), pero
  con instalaciones de minutos se nota más. Se probó cortar el spawn con un chequeo de estado y se
  descartó: sin cerrar el run como corresponde, un padre esperando a un hijo quedaría colgado.
  Arreglarlo bien es un cambio aparte en `stopAgent`.
- `package-lock.json` figura modificado en el worktree (una línea `"peer": true` que agregó el
  `npm install` del setup). Venía así desde antes de empezar y no se commiteó.
- La vista remota (`src/remote/**`) quedó fuera de alcance, como pedía el plan: el transport remoto
  responde `null` a `readFileAbs`, así que preparar un worktree desde el celular no está soportado.
- No se hizo push.
