# AIS — Orquestador local de agentes de IA

Tauri 2 + React 19 + TypeScript + Tailwind 4 + componentes `@uiness` (registry shadcn en
`src/components/ui`). UI en español, código en inglés. `PLAN.md` es la fuente de verdad de la
arquitectura y los contratos (tipos, comandos Rust, protocolo de delegación).

Comandos: `npx tsc --noEmit` (front), `npm test` (unit, vitest), `cd src-tauri && cargo check` (back), `npm run build:cli` (CLI), `npm run tauri dev` (app), `npm run tauri build` (instalador).

## Handoff a Antigravity

Claude Code planifica y Antigravity implementa. Antigravity se invoca headless con su CLI
(`~/.gemini/bin/agy.exe`), sin que el usuario intervenga.

Flujo:
1. Investigar y escribir el plan en `.claude/handoff/NNN-slug.md` (numerar en orden). Usar `.claude/handoff/TEMPLATE.md`.
2. Despachar en background con Bash: `.claude/scripts/agy-run.sh .claude/handoff/NNN-slug.md` (opcionales `--model`, `--effort`, `--timeout`; `AGY_ADD_DIR=<dir>` para trabajar en un worktree). Para GitHub Copilot CLI: `.claude/scripts/copilot-run.sh <plan> [--model claude-sonnet-5] [--repo <dir>]`. Cuando la cuota de Antigravity está agotada y Copilot no tiene el modelo pedido, un subagente Claude (`Agent` con `model: "opus"`) implementa el plan con el mismo prompt.
   Para correr dos implementadores a la vez: un worktree por implementador (`git worktree add -b feat/x ../ais-wt-x main`), `npm install` adentro (nunca un junction de `node_modules`: `git worktree remove` lo sigue y borra el real), mergear a `main` al terminar.
3. Cuando termina, leer `.claude/handoff/NNN-slug.report.md` y revisar el diff real (`git show`), correr tests, typecheck, lint y build uno mismo. No confiar en el campo `status` del JSON.
4. Si algo está mal, arreglarlo: cosas chicas directo, cosas grandes con un plan de corrección `NNNb-slug.md`. Repetir hasta que pase todo.
5. Cuando está bien, hacer `git push` (si hay remoto). El push es responsabilidad de Claude.
6. Reportar al usuario un resumen consolidado en español. Nunca pasarle output crudo.

Reglas para el plan:
- Un plan por repo. Trabajar en la rama activa, nunca cambiar de rama.
- Ser concreto: archivos a tocar, comportamiento esperado, casos borde, comandos de verificación exactos.
- El implementador no puede hacer preguntas, así que las decisiones se toman en el plan.
- Nunca despachar dos planes al mismo repo en paralelo (comparten el índice de git).

Resultados de cada corrida: `<plan>.result.json`, `<plan>.report.md`, `<plan>.log`.
