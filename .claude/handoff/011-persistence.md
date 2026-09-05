# Persistencia de runs y mensajes por proyecto

Repo: C:\Users\matia\Desktop\projects\ais
Rama: la activa (main), sin cambiar de rama ni crear otras

## Objetivo
Que los runs y el feed de comunicación de cada proyecto sobrevivan a cerrar la app o terminar el CLI: al volver a abrir, la pestaña Comunicación, el historial de prompts y "Ver salida" muestran lo de antes. Con historial consultable desde el CLI (`ais history`, `ais status`).

## Contexto
- Leer `PLAN.md`, `src/types.ts` (`Run`, `CommMessage`), `src/store.ts` (`runs`, `messages`, `runtime`, `activeTaskRunId`, `currentProjectId`, `removeProject`, `clearMessages`), `src/lib/orchestrator.ts` (dónde se crean y cierran runs y mensajes), `src/lib/chat.ts` (ya persiste chats en `<configDir>/chats/<id>.json` con `Transport.writeTextFile/readTextFile`: copiar ese patrón), `src/cli/main.ts`.
- `Transport.writeTextFile(relativePath, content)` y `readTextFile(relativePath)` existen en los tres transports (Tauri escribe bajo `app_config_dir()`, Node bajo `%APPDATA%\com.matias.ais`).
- Hoy `runs` y `messages` viven solo en memoria.

## Cambios
1. `src/lib/history.ts` (nuevo):
   - Archivo por proyecto: `history/<projectId>.json` con `{ version: 1, runs: Run[], messages: CommMessage[] }`.
   - `saveHistory(projectId)` con debounce de 500 ms por proyecto (y un `flushHistory()` inmediato para usar antes de salir del CLI). Al guardar, recortar: máximo 300 runs y 3000 mensajes por proyecto (los más viejos se descartan), y `rawLines` de cada run a las últimas 300 líneas.
   - `loadHistory(projectId)`: lee el archivo (tolerante a archivo ausente o corrupto), marca como `error` con `output: "[interrumpido: la aplicación se cerró]"` y `endedAt = Date.now()` cualquier run que haya quedado `running`, y mezcla en el store sin pisar runs/mensajes que ya estén en memoria (por id).
   - `clearHistory(projectId)`: borra runs y mensajes del proyecto en memoria y escribe el archivo vacío.
   - Disparadores: el orquestador llama `saveHistory(run.projectId)` al crear un run, al recibir output (el debounce lo absorbe), al terminar un run y al agregar mensajes. Implementarlo con una suscripción única `useAppStore.subscribe` sobre `runs`/`messages` que detecta qué proyectos cambiaron y programa su guardado, para no tocar cada punto del orquestador.
2. Store: en `runInit()` cargar el historial del `lastProjectId` (o de todos los proyectos si son ≤ 5); `setCurrentProject(id)` carga el del proyecto si no fue cargado (`loadedHistory: Set<string>` en el módulo). `clearMessages(projectId)` pasa a llamar `clearHistory`. `removeProject` borra también su archivo (escribir `""` o `{}`; no hace falta un `deleteFile` nuevo). Acción nueva `clearHistory(projectId)` expuesta en `AppState`.
3. UI: en `CommunicationPanel` el botón "Limpiar" ahora borra también el historial persistido (confirmar con `island.confirm`). En `PromptPanel`, el historial de prompts sale de los mensajes `user` persistidos (ya debería funcionar solo). En `ProjectsPanel`, mostrar "N runs guardados" por proyecto.
4. CLI:
   - `ais history [-p nombre | -w dir] [--limit N] [--json]`: últimos N runs (default 20) del proyecto: fecha, agente, estado, ronda, prompt truncado a 80 y output truncado a 120. `ais history show <runId-prefijo>`: prompt y output completos y las rawLines.
   - `ais status [--json]`: por proyecto, agentes con estado distinto de idle (con su `currentTask` truncado), runs `running` y `activeTaskRunId`. Como el CLI es un proceso nuevo, el estado "en vivo" solo refleja lo persistido: dejarlo claro en el texto ("según el último guardado").
   - `ais run` debe llamar `flushHistory()` antes de `process.exit` en todos los caminos (fin normal, SIGINT, EPIPE).
5. `README.md`: sección "Historial" (dónde se guarda, límites, cómo borrarlo).

## Casos borde y decisiones ya tomadas
- Guardar solo el proyecto que cambió, nunca todos en cada tick.
- Si el archivo está corrupto, ignorarlo y sobrescribirlo en el próximo guardado (no romper el arranque).
- Mensajes sin `projectId` (system globales) no se persisten.
- No tocar `src/components/ui/**`. Bundle web sin `node:*`. Texto visible en español.

## Fuera de alcance
- Búsqueda en el historial. Exportar.

## Verificación
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
node bin/ais.js -a Antigravity -w %TEMP%\ais-cli-test "Decime hola en una línea"
node bin/ais.js history -w %TEMP%\ais-cli-test        (debe listar el run anterior)
node bin/ais.js status
dir %APPDATA%\com.matias.ais\history
```
Commitear con mensajes en inglés. No hacer push.
