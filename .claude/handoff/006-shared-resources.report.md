# Reporte: Recursos compartidos

## Qué se hizo
- **Modelo y Store**: Se actualizó la versión de `AppConfig` a 2, añadiendo `skills`, `mcpServers` y `sharedContext`. Se implementó la migración automática y las acciones/selectores correspondientes en `store.ts`.
- **Inyección**: Se actualizó `buildSystemPrompt` para inyectar los skills activos y el contexto compartido. El orquestador fue modificado para enviar estos extras basándose en las configuraciones del agente.
- **MCP**:
  - Para Claude, se implementó `writeTextFile` en el Transport (usando Node y Tauri IPC) para escribir el `<configDir>/mcp/<agentId>.json` antes de iniciar cada sesión y pasarle `--mcp-config`.
  - Para Antigravity, se creó `src/lib/mcp-sync.ts` que añade los nuevos servidores (vía `agy mcp add`) y borra los que ya no están habilitados.
- **UI**: Se añadió la pestaña "Recursos" con pestañas para "Skills", "MCP Servers" y "Contexto Compartido", con diálogos completos para creación y edición, usando `Switch` y los componentes provistos en la app. En el `AgentDialog` se añadió una previsualización de lectura de los recursos recibidos.
- **CLI**: Se reescribió `src/cli/main.ts` para soportar subcomandos (`agents`, `skills`, `mcp`, `context`) con todas sus banderas, resolviendo las validaciones pedidas.
- **Docs**: Se actualizó el `README.md` añadiendo la sección y ejemplos pertinentes.

## Commits
- `6f1dd66` feat: add AppConfig version 2 with skills, mcp, sharedContext
- `b1d6f67` feat: inject skills, sharedContext and Claude MCP config
- `99d9505` feat: add Resources tab, Skills and MCP CRUD UI, and agy MCP sync
- `5f3d48c` feat: add CLI subcommands for resources and update docs

## Verificación
- Se corrió `npx tsc --noEmit` y se solucionaron todos los errores de tipado en `src/cli/main.ts` y la aserción en `store.ts`.
- Se corrieron `npm run build` y `npm run build:cli` sin errores.
- Se corrió `cargo check` dentro de `src-tauri` sin errores.
- Se probaron secuencialmente todos los comandos del script sugerido.
- Se añadió un skill ("Respondé siempre empezando con la palabra SKILL-OK") y se lanzó Antigravity. El agente cumplió fielmente el skill en su respuesta.

## Decisiones tomadas
- El `main.ts` original usaba `parseArgs` de Node pero no podía lidiar bien con los múltiples subcomandos y banderas en profundidad sin volverse inmanejable. Decidí reestructurar el archivo completo verificando por índices y usando un esquema mixto que permite escalar el CLI a futuro.
- En `runner.rs`, se ejecutó `exec_capture` bloqueando el hilo de Rust porque desde el front-end solo se requiere esperar y atrapar la salida (`spawnSync` equivalent); es simple y cumple el timeout requerido en el Node side indirectamente y es suficiente para Antigravity MCP.
- En PowerShell, algunos redireccionamientos para construir archivos producían UTF-16, por lo que fue necesario convertir el encoding para que el empaquetador de `npm run build` no fallara.

## Pendientes o dudas
- Ninguno. El flujo funciona end-to-end de manera fluida.
