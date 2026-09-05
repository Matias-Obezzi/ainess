# Pulido de UI: auto-scroll, detalle de runs, estado de tarea y README

Repo: C:\Users\matia\Desktop\projects\ais
Rama: la activa (main), sin cambiar de rama ni crear otras

## Objetivo
Cerrar los pendientes de UX detectados al probar la app de punta a punta, y dejar un README en español. `npx tsc --noEmit` y `npm run build` tienen que pasar.

## Contexto
- Leer `PLAN.md` (arquitectura), `src/store.ts` (API del store; ahora `Run` tiene `rootRunId`), `src/types.ts`.
- Componentes existentes en `src/components/`: `PromptPanel.tsx`, `CommunicationPanel.tsx`, `MessageItem.tsx`, `HierarchyGraph.tsx`, `AgentNode.tsx`, `InstructDialog.tsx`, `AgentsPanel.tsx`, `AgentDialog.tsx`, `Header.tsx`, `StatusDot.tsx`; hooks en `src/hooks/`; labels en `src/lib/labels.ts`.
- La app ya fue probada end-to-end: un planificador Antigravity delegó a un implementador Antigravity, el archivo se creó en el workspace y la tarea se cerró sola (`activeTaskRunId` vuelve a `null`). "Detener" sobre un planificador en espera mata a los hijos y cancela la continuación.
- `run.rawLines` guarda las últimas 2000 líneas crudas de stdout/stderr de cada run (JSON de agy/claude o texto plano). `run.prompt` es el prompt enviado, `run.output` la respuesta final.

## Cambios
1. `src/components/CommunicationPanel.tsx`: auto-scroll condicional. Mantener un `ref` al contenedor scrolleable y un estado `stickToBottom` (true por defecto). En `onScroll` del contenedor: `stickToBottom = scrollHeight - scrollTop - clientHeight < 40`. Cuando cambian `messages`, hacer scroll al final solo si `stickToBottom`. Mostrar un botón flotante chico "Ir al final" (abajo a la derecha del feed) cuando `stickToBottom` es false y hay mensajes nuevos; al clic, scrollear al final y volver a pegar. Ojo: `ScrollArea` de Radix envuelve el viewport; si es más simple, usar un `div` con `overflow-y-auto` para el feed.
2. Detalle de run. Nuevo `src/components/RunDetailDialog.tsx`: `Dialog` grande (`max-w-4xl`, alto ~80vh) que recibe `runId` y muestra: agente, estado, ronda, inicio/fin, duración; el prompt (`whitespace-pre-wrap`, colapsable); la salida final; y la salida cruda (`rawLines` unidas, `font-mono text-xs`, en un contenedor `overflow-auto`). Abrirlo desde: (a) `AgentNode.tsx` con un botón "Ver salida" que abre el último run del agente (buscar en `runs` el run más reciente por `startedAt` con ese `agentId`; deshabilitado si no hay ninguno); (b) `MessageItem.tsx`: si el mensaje tiene `runId`, un icono chico (lucide `FileText`) al final de la fila que abre ese run.
3. `src/components/PromptPanel.tsx`: cuando `activeTaskRunId` no es null, mostrar una tarjeta "Tarea en curso" con: nombre del agente raíz, ronda actual (la mayor `round` entre los runs con ese `rootRunId`), tiempo transcurrido (contador que se actualiza cada segundo), cantidad de runs en estado `running`, y un botón destructivo "Detener tarea" que llama `stopAll()`. Cuando termina, mostrar durante la sesión un resumen "Última tarea: terminada hace X" con el texto del último mensaje `result` dirigido a `user` (truncado, expandible).
4. `src/components/AgentsPanel.tsx`: el texto "CLI: Cargando…" solo mientras `loaded` es false; después mostrar "No detectado" (con color de advertencia) cuando `binaries[provider]` es null o undefined, y la ruta + versión cuando existe. Para provider `custom` mostrar el programa configurado en vez del binario detectado.
5. `README.md` (reemplazar el del scaffold), en español: qué es AIS, requisitos (Node, Rust, WebView2, los CLIs: Claude Code y Antigravity `agy`), cómo correr (`npm install`, `npm run tauri dev`, `npm run tauri build`), cómo funciona la delegación (roles, bloque ```delegate, rondas, sesiones), cómo agregar agentes y comandos custom (`{prompt}`), dónde se guarda la config (`%APPDATA%\com.matias.ais\config.json`), y la nota de que Antigravity necesita `--add-dir` (ya lo hace la app).

## Casos borde y decisiones ya tomadas
- No tocar `src/store.ts`, `src/lib/*`, `src/types.ts`, `src-tauri/**`. Si hace falta algo del store, anotarlo en el informe.
- Todo el texto visible en español.
- Nada de dependencias nuevas.
- El contador de tiempo transcurrido debe limpiar su `setInterval` al desmontar.

## Fuera de alcance
- Persistencia de runs entre reinicios. Tests.

## Verificación
Desde la raíz del repo:
```
npx tsc --noEmit
npm run build
```
Ambos sin errores. Commitear con mensajes en inglés. No hacer push.
