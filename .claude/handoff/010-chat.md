# Chat: conversación directa con un agente o chat compartido entre varios agentes con roles

Repo: C:\Users\matia\Desktop\projects\ais
Rama: la activa (main), sin cambiar de rama ni crear otras

## Objetivo
Poder usar un agente directamente, como un chat, sin pasar por la jerarquía ni por la delegación. Dos modos:
- **Individual**: una conversación con un solo agente (mantiene su sesión).
- **Compartido**: una conversación donde participan varios agentes, cada uno con un rol dado para ese chat (por ejemplo "arquitecto" y "crítico"); cada mensaje del usuario lo responden por turnos viendo lo que dijeron los demás.
Funciona en la app (pestaña Chat) y en el CLI (`ais chat`).

## Contexto
- Leer `PLAN.md`, `src/types.ts`, `src/store.ts`, `src/lib/orchestrator.ts` (`instructAgent` y `startRun` con `resume`), `src/lib/providers.ts` (`buildSystemPrompt`), `src/cli/main.ts`, `CommunicationPanel.tsx`/`MessageItem.tsx` (estilos reutilizables).
- Las sesiones (`sessionId`) ya permiten continuar una conversación por proveedor (Claude `--resume`, agy `--conversation`). Los chats usan sesiones propias, separadas de las de la jerarquía: guardar `chatSessions: Record<chatId, Record<agentId, sessionId>>` en el runtime del store (no persistido).

## Cambios
1. Modelo (`src/types.ts`):
   ```ts
   export interface ChatParticipant { agentId: string; role: string; model?: string; }
   export interface Chat { id: string; projectId: string; name: string; mode: "individual" | "shared"; participants: ChatParticipant[]; createdAt: number; }
   export interface ChatMessage { id: string; chatId: string; ts: number; from: "user" | string /*agentId*/; text: string; runId?: string; status?: "pending" | "done" | "error"; }
   ```
   Los chats se persisten en la config (`chats: Chat[]`, version 6); los mensajes viven en memoria en el store (`chatMessages: Record<chatId, ChatMessage[]>`) y además se guardan en `<configDir>/chats/<chatId>.json` vía `Transport.writeTextFile` (y se cargan al abrir el chat con `Transport.readTextFile(relativePath)`, método nuevo a agregar en los tres transports y en Rust `read_config_file`).
2. Orquestador (`src/lib/chat.ts`, nuevo): 
   - `sendChatMessage(chatId, text)`: agrega el mensaje del usuario; luego, **por turnos** en el orden de `participants`, lanza un run por participante con `startRun` (exportarlo o crear `startChatRun`) usando: `resume` con la sesión del chat, `model` del participante si está, `parentRunId: null`, `rootRunId` = un id de "turno" de chat, y un system prompt propio: rol del participante en el chat ("En esta conversación tu rol es: <role>"), lista de los demás participantes con sus roles, perfil/contexto compartido/skills como siempre, y la instrucción "Respondé al último mensaje del usuario; podés referirte a lo que dijeron los otros participantes". El prompt del run es el último mensaje del usuario más, en modo compartido, las respuestas de los participantes anteriores del mismo turno como `### <nombre> (<rol>)\n<texto>`. Cada respuesta se agrega como `ChatMessage` cuando llega el `result`. El turno termina cuando respondió el último participante.
   - Los runs de chat NO parsean bloques `delegate` ni disparan continuaciones de jerarquía: marcarlos con `Run.kind: "chat"` (campo nuevo, opcional, default "task") y en `onRunFinished` desviar los runs `chat` a `chat.ts` (`onChatRunFinished`).
   - `stopChat(chatId)` mata el run en curso del turno. Los mensajes de chat también aparecen en el feed de Comunicación con `kind: "text"`/`"result"` y `toAgentId: "user"`.
3. Store: `createChat({ projectId, name, mode, participants })`, `updateChat`, `removeChat`, `sendChatMessage`, `stopChat`, `currentChatId`.
4. UI: nueva pestaña **Chat** (`ChatPanel.tsx`): lista lateral de chats del proyecto actual (con botón "Nuevo chat" → `ChatDialog.tsx`: nombre, modo, participantes (agentes con `Input` de rol y `Select` de modelo opcional), y a la derecha la conversación (burbujas: usuario a la derecha, agentes a la izquierda con su color y nombre + rol; markdown NO hace falta, `whitespace-pre-wrap`), indicador "escribiendo…" por participante en curso, textarea con Ctrl+Enter, botón Detener. Un atajo desde el grafo: en `AgentNode` botón "Chatear" que crea (o reutiliza) el chat individual de ese agente en el proyecto actual y abre la pestaña Chat.
5. CLI: `ais chat -a <agente> [-w dir]` abre un REPL simple (`node:readline`) con el agente: cada línea del usuario dispara un turno, imprime la respuesta, `/salir` termina, `/nuevo` reinicia la sesión. `ais chat --shared "Claude:arquitecto,Antigravity:crítico" [-w dir]` hace lo mismo en modo compartido (imprime cada participante con su color). `ais chat send <chatId|nombre> "texto"` para un turno único no interactivo (imprime las respuestas y sale).
6. `README.md`: sección "Chat".

## Casos borde y decisiones ya tomadas
- Un chat pertenece a un proyecto (usa su workspace como cwd).
- Si un participante falla, el turno sigue con los demás y el error se muestra como mensaje.
- Un chat individual con un planificador NO delega (modo chat puro).
- No tocar `src/components/ui/**`. Bundle web sin `node:*`. Texto visible en español.

## Fuera de alcance
- Adjuntar archivos. Editar mensajes. Streaming token a token (basta con "escribiendo…" y la respuesta completa).

## Verificación
```
npx tsc --noEmit
npm run build
npm run build:cli
cd src-tauri && cargo check && cd ..
echo Decime hola en una linea | node bin/ais.js chat -a Antigravity -w %TEMP%\ais-cli-test
node bin/ais.js chat --shared "Antigravity:optimista,Antigravity:pesimista" -w %TEMP%\ais-cli-test  (escribir "¿Conviene usar Tauri?" y /salir)
```
Commitear con mensajes en inglés. No hacer push.
