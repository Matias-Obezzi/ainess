# Informe de Prueba de Humo (000-smoke)

## Qué se hizo
- Se leyó el plan de handoff en `000-smoke.md`.
- Se listaron las carpetas de primer nivel del repositorio: `.claude`, `.vscode`, `node_modules`, `public`, `src`, `src-tauri`.
- Se ejecutaron los comandos de verificación solicitados: `git log --oneline -n 3` y `node -v`.
- Se generó el presente informe en `000-smoke.report.md`.

## Commits
- Ninguno (el plan especificó explícitamente no modificar archivos del proyecto ni realizar commits).

## Verificación
- **Listado de directorios**: `Get-ChildItem -Directory` retornó `.claude`, `.vscode`, `node_modules`, `public`, `src`, `src-tauri`.
- **Git log**: `git log --oneline -n 3` retornó `d21ea27 Scaffold Tauri app, plan, contracts and Antigravity handoff flow`.
- **Node**: `node -v` retornó `v25.1.0`.
- **Existencia del informe**: Verificada la creación de `000-smoke.report.md`.

## Decisiones tomadas
- Se utilizó `git log --oneline -n 3` en lugar del pipe `head -3` para compatibilidad nativa con PowerShell en Windows.
- Se respetó la instrucción explícita del plan de no modificar archivos del proyecto ni generar commits para esta prueba de humo.

## Pendientes o dudas
- Ninguno. El flujo de handoff funciona correctamente.
