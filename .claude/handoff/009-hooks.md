# Hooks: reglas que reaccionan a eventos (Slack, Discord, webhooks, comandos locales, instrucciones a agentes)

Repo: C:\Users\matia\Desktop\projects\ais
Rama: la activa (main), sin cambiar de rama ni crear otras

## Objetivo
El usuario define reglas "cuando pasa X, hacé Y": ante eventos del orquestador (tarea iniciada/terminada, delegación, run terminado, error, agente detenido, resultado al usuario) se ejecutan acciones: enviar un mensaje a Slack/Discord (webhook entrante), POST a un webhook genérico, ejecutar un comando en la PC, darle una instrucción a un agente, o mostrar una notificación. Funciona en la app y en el CLI, y las reglas son compartidas (misma config).

## Contexto
- Leer `PLAN.md`, `src/types.ts`, `src/store.ts`, `src/lib/orchestrator.ts` (dónde se producen los eventos: `submitPrompt`, delegaciones en `onRunFinished`, `handleExit`, `maybeContinueParent`, `stopAgent`), `src/lib/transport*.ts` (`exec` existe desde el plan 006), `src/cli/main.ts`, `ResourcesPanel.tsx`.
- En el webview de Tauri, `fetch` a dominios externos puede estar bloqueado por CSP/CORS: las llamadas HTTP salen por el backend. Agregar al `Transport` el método `httpPost(url: string, body: string, headers: Record<string,string>): Promise<{ status: number; body: string }>`: en Node con `fetch`; en Tauri con un comando Rust `http_post` usando el crate `reqwest` (features `["json","rustls-tls"]`, timeout 15 s) o `tauri-plugin-http` (elegir uno, documentarlo). Null transport: rechaza con error.

## Cambios
1. Modelo (`src/types.ts`), config `version: 5`:
   ```ts
   export type HookEvent = "task.started" | "task.finished" | "task.failed" | "delegation" | "run.finished" | "run.failed" | "agent.stopped" | "result";
   export type HookAction =
     | { type: "slack"; webhookUrl: string; template: string }
     | { type: "discord"; webhookUrl: string; template: string }
     | { type: "webhook"; url: string; method?: "POST"; headers?: Record<string,string>; bodyTemplate: string }
     | { type: "command"; program: string; args: string[]; cwd?: "workspace" | string }
     | { type: "instruct"; agentId: string; template: string }
     | { type: "notify"; title: string; template: string };
   export interface Hook { id: string; name: string; event: HookEvent; enabled: boolean; filter?: { agentId?: string; projectId?: string }; action: HookAction; }
   // AppConfig: hooks: Hook[]
   ```
2. Plantillas: `src/lib/template.ts` con `renderTemplate(tpl, vars)` que reemplaza `{{clave}}` (y `{{clave|N}}` = truncado a N chars). Variables disponibles en todos los eventos: `event`, `project`, `workspace`, `agent`, `agentRole`, `runId`, `round`, `prompt`, `output`, `error`, `taskPrompt` (prompt raíz de la tarea), `time`. Para `delegation`: además `toAgent`, `task`, `model`. Documentar la lista en la UI (tooltip/ayuda) y en el README.
3. Dispatcher: `src/lib/hooks.ts` con `emitHookEvent(event, vars, ctx)`: busca hooks habilitados que matcheen `event` y `filter`, y ejecuta cada acción sin bloquear el ciclo (`void`), con manejo de errores → mensaje `system` en el feed del proyecto ("Hook X falló: …"). Acciones:
   - `slack`: `httpPost(webhookUrl, JSON.stringify({ text: render(template) }), { "Content-Type": "application/json" })`.
   - `discord`: igual con `{ content: render(template) }` (máximo 2000 chars).
   - `webhook`: POST con `bodyTemplate` renderizado y headers dados.
   - `command`: `Transport.exec(program, args renderizados, cwd)`; el `cwd: "workspace"` se resuelve a la carpeta del proyecto. Registrar stdout/stderr truncados como mensaje `system`.
   - `instruct`: `instructAgent(agentId, render(template), projectId)`; protección anti-loop: un hook `instruct` no puede dispararse más de 5 veces por tarea (contador por `rootRunId`).
   - `notify`: `toast.info(title, { description })` en la app; en el CLI imprimir en stderr con prefijo `[notificación]`.
   El orquestador llama a `emitHookEvent` en cada punto: `task.started` en `submitPrompt`; `delegation` por cada task; `run.finished`/`run.failed` en `onRunFinished`; `agent.stopped` cuando un run termina `killed`; `task.finished`/`task.failed` y `result` cuando se cierra el `activeTaskRunId` del proyecto.
4. Store: `upsertHook`, `removeHook`, `toggleHook(id, enabled)`, `testHook(id)` (dispara la acción con variables de ejemplo).
5. UI: en **Recursos**, sub-pestaña **Hooks**: lista (nombre, evento, acción, switch habilitado, botones Probar/Editar/Eliminar) y `HookDialog.tsx`: nombre, evento (`Select`), filtro por agente y proyecto (opcionales), tipo de acción (`Select`) y campos según el tipo; ayuda de plantillas con la lista de variables; presets de plantilla: Slack/Discord "✅ {{agent}} terminó en {{project}}: {{output|300}}".
6. CLI: `ais hooks list|add <nombre> --event E --action slack|discord|webhook|command|instruct|notify [--url U] [--template "..."] [--program P --args "..."] [--agent A] [--filter-agent A] [--filter-project P]|remove <nombre>|enable <nombre>|disable <nombre>|test <nombre>`.
7. `README.md`: sección "Hooks" con ejemplos de Slack (`https://hooks.slack.com/services/...`) y Discord (`https://discord.com/api/webhooks/...`), un ejemplo de comando local (abrir un archivo al terminar) y uno de instrucción encadenada (cuando termina el implementador, pedirle al revisor que revise).

## Casos borde y decisiones ya tomadas
- Los webhooks nunca bloquean el ciclo ni hacen fallar la tarea.
- Las URLs de webhooks se guardan en la config tal cual (el usuario es responsable de su seguridad); en la UI se muestran enmascaradas salvo al editar.
- No tocar `src/components/ui/**`. Bundle web sin `node:*`. Texto visible en español.

## Fuera de alcance
- Slack/Discord por API con tokens (solo webhooks entrantes). Recibir mensajes desde Slack/Discord.

## Verificación
```
npx tsc --noEmit
npm run build
npm run build:cli
cd src-tauri && cargo check && cd ..
node bin/ais.js hooks add eco --event result --action command --program cmd --args "/c echo RESULTADO: {{output|80}}"
node bin/ais.js -a Antigravity -w %TEMP%\ais-cli-test "Decime hola en una línea"
node bin/ais.js hooks test eco
node bin/ais.js hooks remove eco
```
El comando del hook debe verse ejecutado (mensaje `system` en la salida). Commitear con mensajes en inglés. No hacer push.
