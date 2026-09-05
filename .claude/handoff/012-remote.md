# Acceso remoto en la red local: estado, aprobaciones y mensajes desde el celular

Repo: C:\Users\matia\Desktop\projects\ais
Rama: la activa (main), sin cambiar de rama ni crear otras

## Objetivo
Desde el celular, en la misma red WiFi, abrir una URL y: ver el estado de los agentes y proyectos en vivo, leer el feed, mandar un prompt al planificador o una instrucción a un agente, detener, y **aprobar o rechazar** acciones que requieren permiso. Funciona con la app abierta y también con `ais serve` desde la terminal. Protegido con un token.

## Contexto
- Leer `PLAN.md`, `src/store.ts`, `src/lib/orchestrator.ts` (`startRun`, `onRunFinished` donde se despachan delegaciones, `submitPrompt`, `instructAgent`, `stopAgent`, `stopAll`), `src/lib/transport*.ts`, `src/lib/hooks.ts` (patrón de eventos), `src-tauri/src/lib.rs`, `src-tauri/src/http.rs` (ya usa `reqwest`; ver qué runtime async hay), `src/cli/main.ts`, `src/lib/history.ts` (plan 011).
- El estado vive en el proceso que orquesta (webview de Tauri o el CLI en Node). Por eso el servidor HTTP se implementa como **puente**: en Tauri lo levanta Rust y se comunica con el webview por eventos/comandos; en el CLI lo levanta Node directamente. El protocolo HTTP y la página móvil son los mismos en los dos casos.
- Sin WebSocket: usar **SSE** (`text/event-stream`) para empujar estado y `fetch POST` para comandos. Node no trae servidor WebSocket y SSE alcanza.

## Protocolo HTTP (igual en Rust y Node)
Todas las rutas exigen el token: query `?token=` o header `Authorization: Bearer <token>`. Sin token válido → 401. Escuchar en `0.0.0.0:<port>` (default 4710).
- `GET /` → la página móvil (HTML embebido, ver abajo). Acepta `?token=` y lo guarda en `localStorage`.
- `GET /api/state` → snapshot JSON: `{ projects: [{ id, name, workspaceDir, activeTaskRunId, running: number }], agents: [{ id, name, provider, role, parentId, color }], runtime: { [projectId]: { [agentId]: { status, currentTask } } }, messages: últimos 100 CommMessage (todos los proyectos), approvals: Approval[] pendientes, serverTime }`.
- `GET /api/events` → SSE; envía un evento `state` con el snapshot al conectar y cada vez que cambia algo (throttle 300 ms), y `ping` cada 20 s.
- `POST /api/prompt` `{ projectId, agentId?, text, model? }` → `submitPrompt` (agentId default: planner raíz). Responde `{ runId }` o `{ error }` si ya hay tarea activa en ese proyecto.
- `POST /api/instruct` `{ projectId, agentId, text }` → `instructAgent`.
- `POST /api/stop` `{ projectId, agentId? }` → `stopAgent` o `stopAll(projectId)`.
- `POST /api/approve` `{ approvalId, decision: "approve" | "reject", note? }`.
- `POST /api/chat` `{ chatId, text }` → `sendChatMessage` (opcional, si entra sin complicar).

## Cambios
1. **Aprobaciones** (`src/types.ts`, `src/store.ts`, `src/lib/orchestrator.ts`):
   ```ts
   export interface Approval { id: string; projectId: string; kind: "delegation" | "instruction"; agentId: string; toAgentId?: string; summary: string; payload: unknown; createdAt: number; status: "pending" | "approved" | "rejected"; note?: string }
   ```
   `AgentConfig.requireApproval?: boolean` y `AppConfig.approveDelegations?: boolean` (config version 7). Cuando el planificador delega y (`approveDelegations` o `child.requireApproval`), en vez de lanzar el run hijo se crea una `Approval` pendiente por task (summary = "<planner> → <hijo>: <task truncado>"), el padre queda `waiting`, mensaje `system` en el feed "Esperando aprobación…". `approve` lanza el run hijo tal como se habría lanzado (mismo parentRunId/round/rootRunId/model); `reject` cierra ese task con output "[rechazado por el usuario: <note>]" y, como con cualquier hijo terminado, cuando no queda nada pendiente el padre continúa con los resultados. Acciones del store: `approve(id, note?)`, `reject(id, note?)`, `selectPendingApprovals(state, projectId?)`. Persistir las aprobaciones pendientes en el historial (plan 011) para que sobrevivan un reinicio.
   UI: en `PromptPanel` (tarjeta de tarea en curso) y en `Header` un badge "N aprobaciones" que abre `ApprovalsPanel.tsx` (lista con Aprobar / Rechazar y campo de nota). En `AgentDialog` un `Switch` "Requiere aprobación para recibir tareas". En Recursos > Perfil, `Switch` "Aprobar todas las delegaciones". Toast al crearse una aprobación. Hook event nuevo `approval.requested` (plantilla con `{{summary}}`), para que un hook de Slack/Discord avise al celular.
2. **Página móvil** `src/remote/remote.html` (un solo archivo, HTML+CSS+JS vanilla, sin build, tema oscuro, responsive, en español): header con nombre del proyecto (selector si hay varios) y estado de conexión; sección "Aprobaciones" arriba del todo cuando hay pendientes (Aprobar/Rechazar); tarjetas de agentes con punto de estado y tarea actual; feed de los últimos mensajes (tipo, agente, texto truncado con "ver más"); barra inferior con textarea + selector de destino (planificador o agente) + Enviar, y botones Detener. Se conecta a `/api/events`, reintenta al cortarse, guarda el token de `?token=` en `localStorage` y lo manda en `Authorization`.
3. **Rust** (`src-tauri/src/remote.rs`, nuevo): servidor con `axum` + `tokio` (agregar a Cargo.toml: `axum = "0.8"`, `tokio = { version = "1", features = ["rt-multi-thread","macros","sync"] }`, `tokio-stream` para SSE, `local-ip-address = "0.6"` para mostrar la IP). Estado en Rust: `Arc<RwLock<serde_json::Value>>` con el último snapshot y un `tokio::sync::broadcast` para SSE. Comandos Tauri: `remote_start(port, token) -> Result<{ url, ip }>`, `remote_stop()`, `remote_status() -> { running, url, clients }`, `remote_push_state(snapshot: Value)` (el webview lo llama con throttle cuando cambia el store). Los `POST /api/*` se convierten en eventos Tauri `remote-command` `{ id, action, payload }` que el webview atiende (`src/lib/remote.ts`) ejecutando la acción del store y respondiendo con `invoke("remote_reply", { id, result })`; Rust espera la respuesta hasta 10 s (mapa `id → oneshot::Sender`). La página se sirve con `include_str!("../../src/remote/remote.html")`. Capability: el server escucha en todas las interfaces; no hace falta permiso extra de Tauri.
4. **TS** (`src/lib/remote.ts`): `buildSnapshot(state)`, `handleRemoteCommand(action, payload)`, `startRemote()/stopRemote()` que usan el transport: agregar al `Transport` `remoteStart(port, token)`, `remoteStop()`, `remoteStatus()`, `remotePushState(snapshot)`, `onRemoteCommand(handler)`. Tauri: los comandos de arriba. Node: `src/lib/remote-node.ts` con `node:http` (servir la página, SSE con `res.write`, POST con body JSON, misma validación de token) y llamando `handleRemoteCommand` directo. Null: no-op.
5. **Config** `remote: { enabled: boolean; port: number; token: string }` (token generado con `crypto.randomUUID()` la primera vez). Si `enabled`, la app arranca el servidor en `init()`.
6. **UI app**: en Recursos, sub-pestaña **Remoto**: `Switch` habilitar, puerto, URL completa con token (`http://<ip>:<port>/?token=…`), botón copiar, **código QR** de esa URL (instalar `qrcode` de npm y renderizar a `<canvas>`), botón "Regenerar token", contador de clientes conectados.
7. **CLI**: `ais serve [--port N] [-w dir | -p proyecto]` levanta el servidor Node, imprime la URL con token y queda corriendo (Ctrl+C para salir) atendiendo prompts que lleguen del celular; `ais remote url` imprime la URL; `ais remote token --regenerate`. `ais approvals list|approve <id> [--note]|reject <id> [--note]`.
8. `README.md`: sección "Acceso remoto desde el celular" (misma WiFi, QR, token, qué se puede hacer, aprobaciones) y "Aprobaciones".

## Casos borde y decisiones ya tomadas
- El servidor nunca se expone sin token. El token se muestra solo en la app/CLI.
- Si el puerto está ocupado, error claro en la UI y en el CLI.
- Un cliente que se desconecta no afecta nada; el snapshot se reconstruye al reconectar.
- En el CLI, `ais serve` sin proyecto usa el cwd como proyecto (como `run`).
- La página móvil no usa frameworks ni CDNs (tiene que andar sin internet).
- No tocar `src/components/ui/**`. Bundle web sin `node:*`. Texto visible en español.

## Fuera de alcance
- HTTPS. Acceso desde fuera de la LAN. Autenticación por usuario.

## Verificación
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
cd src-tauri && cargo check && cd ..
node bin/ais.js serve --port 4710 -w %TEMP%\ais-cli-test    (en otra terminal:)
curl -s http://localhost:4710/api/state -H "Authorization: Bearer <token>"
curl -s -X POST http://localhost:4710/api/prompt -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d "{\"projectId\":\"<id>\",\"agentId\":\"<id de Antigravity>\",\"text\":\"Decime hola en una línea\"}"
curl -s http://localhost:4710/ -H "Authorization: Bearer <token>" | findstr "<html"
curl -s -o NUL -w "%{http_code}" http://localhost:4710/api/state      (debe dar 401)
```
Además, con `approveDelegations` activo, una corrida del planificador debe crear una aprobación y `ais approvals approve <id>` debe lanzar al hijo. Commitear con mensajes en inglés. No hacer push.
