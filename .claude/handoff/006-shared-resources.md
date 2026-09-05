# Recursos compartidos: skills, servidores MCP, contexto compartido y gestión de agentes por CLI

Repo: C:\Users\matia\Desktop\projects\ais
Rama: la activa (main), sin cambiar de rama ni crear otras

## Objetivo
Que todos los agentes compartan un mismo conjunto de recursos administrables desde la app y desde el CLI: **skills** (instrucciones reutilizables), **servidores MCP** y un **contexto compartido** del equipo. Y que el CLI permita crear, editar y borrar agentes sin abrir la app. `npx tsc --noEmit`, `npm run build` y `npm run build:cli` tienen que pasar.

## Contexto
- Leer `PLAN.md`, `src/types.ts`, `src/store.ts`, `src/lib/providers.ts` (`buildSystemPrompt`, `buildCommand`), `src/lib/transport*.ts`, `src/cli/main.ts` (plan 005 ya aplicado), `src/components/AgentsPanel.tsx` y `AgentDialog.tsx` (patrón de CRUD a copiar), `src-tauri/src/config.rs`.
- Claude Code acepta `--mcp-config <archivo.json>` con el formato `{ "mcpServers": { "<nombre>": { "command": "...", "args": [...], "env": {...} } | { "type": "http", "url": "..." } } }`. Antigravity (`agy`) no tiene flag por corrida: tiene los subcomandos `agy mcp add|remove|list|enable|disable` (correr `agy mcp --help` y `agy mcp add --help` para ver la sintaxis exacta antes de implementar).
- Los skills se inyectan como texto en el system prompt: funciona igual para todos los providers (Claude, agy, copilot, gemini, codex, custom).

## Cambios
1. Modelo (`src/types.ts`), config `version: 2` con migración desde 1 (campos nuevos con defaults vacíos):
   ```ts
   export interface Skill { id: string; name: string; description?: string; content: string; enabledFor: "all" | string[]; }
   export interface McpServer { id: string; name: string; transport: "stdio" | "http"; command?: string; args?: string[]; env?: Record<string, string>; url?: string; enabledFor: "all" | string[]; }
   export interface AppConfig { version: 2; agents: AgentConfig[]; workspaceDir: string | null; maxRounds: number; skills: Skill[]; mcpServers: McpServer[]; sharedContext: string; }
   ```
   `enabledFor: "all"` es el default (todo compartido). `string[]` = ids de agentes.
2. Store (`src/store.ts`): acciones `upsertSkill`, `removeSkill`, `upsertMcpServer`, `removeMcpServer`, `setSharedContext(text)`, todas persistidas con el mismo debounce. `runInit` migra la config vieja (`version` 1 o sin `skills`) agregando `skills: []`, `mcpServers: []`, `sharedContext: ""` y `version: 2`, y la guarda. Selectores puros: `selectSkillsFor(state, agentId)`, `selectMcpFor(state, agentId)`.
3. Inyección (`src/lib/providers.ts`): `buildSystemPrompt(agent, children, extras: { skills: Skill[]; sharedContext: string })`. Después del rol y antes de `agent.systemPrompt`, agregar si corresponde:
   ```
   ## Contexto compartido del equipo
   <sharedContext>

   ## Skills
   ### <skill.name>
   <skill.content>
   ```
   El orquestador (`src/lib/orchestrator.ts`) pasa los extras usando los selectores del store.
4. MCP por provider:
   - Claude: antes de cada run, si el agente tiene servidores MCP habilitados, escribir `<configDir>/mcp/<agentId>.json` con el formato de arriba y agregar `--mcp-config <ruta>` a los args. Para escribir el archivo agregar al `Transport` el método `writeTextFile(relativePath: string, content: string): Promise<string>` (devuelve la ruta absoluta; relativo al directorio de config de la app). Implementarlo en Node (`fs`) y en Tauri con un comando Rust nuevo `write_config_file(app, relative_path, content) -> Result<String, String>` en `src-tauri/src/config.rs` (crear carpetas intermedias, rechazar rutas con `..`), registrado en `lib.rs`. El transport null devuelve la ruta sin escribir.
   - Antigravity: no hay flag por corrida. Implementar `syncMcpToAntigravity(servers)` en `src/lib/mcp-sync.ts` que ejecuta `agy mcp list` y después `agy mcp add ...` para los que falten (y `agy mcp remove` para los que la app marcó como borrados en esta sesión, si la sintaxis lo permite). Se dispara desde la UI con un botón "Sincronizar con Antigravity" y desde el CLI con `ais mcp sync`. Necesita ejecutar procesos: usar `Transport.spawnRun` con un `runId` temporal y recolectar la salida, o agregar `Transport.exec(program, args): Promise<{ code, stdout, stderr }>` (preferido; implementarlo en Node con `spawnSync` y en Tauri con un comando Rust `exec_capture` en `runner.rs` con timeout de 60 s y `creation_flags` de Windows).
5. UI: nueva pestaña **Recursos** en `src/App.tsx` con `src/components/ResourcesPanel.tsx` y sub-pestañas:
   - **Skills**: lista de cards (nombre, descripción, agentes habilitados como badges o "Todos"), botones Nuevo/Editar/Eliminar. `SkillDialog.tsx`: nombre, descripción, contenido (`Textarea` grande, monoespaciado), selector de agentes (`Switch` "Todos los agentes" y, si está apagado, checkboxes por agente; usar `@/components/ui/switch` y botones toggle, no hay checkbox instalado).
   - **MCP**: lista de servidores (nombre, transporte, comando/url, agentes habilitados). `McpDialog.tsx`: nombre, transporte (`Select`), comando + args (un `Input` con args separados por espacio) o url, env (textarea `CLAVE=valor` por línea), agentes habilitados. Botón "Sincronizar con Antigravity" que llama a `syncMcpToAntigravity` y muestra el resultado con `toast`.
   - **Contexto compartido**: `Textarea` grande con el texto y botón Guardar (o guardado automático con debounce), con una nota "Se agrega al system prompt de todos los agentes".
   - En `AgentDialog.tsx` agregar una sección de solo lectura "Recursos que recibe" con los skills y MCP que le aplican.
6. CLI (`src/cli/main.ts`), subcomandos nuevos (todos con `--json` opcional para salida JSON):
   - `ais agents list` (igual a `ais agents`), `ais agents add --name N --provider P --role R [--parent NombrePadre] [--model M] [--auto-approve] [--description D] [--system-prompt-file f.md] [--color #hex] [--program P --args "..."]`, `ais agents edit <nombre> [mismos flags]`, `ais agents remove <nombre>`.
   - `ais skills list|add <nombre> --file archivo.md [--description D] [--agents a,b]|edit <nombre> [...]|remove <nombre>|show <nombre>`.
   - `ais mcp list|add <nombre> (--command C [--args "..."] [--env K=V ...] | --url U) [--agents a,b]|remove <nombre>|sync`.
   - `ais context show`, `ais context set --file archivo.md` (o leer de stdin), `ais context clear`.
   - Todas persisten en la misma config que la app (a través de `saveConfig` del store; esperar a que termine antes de salir).
7. `README.md`: sección "Recursos compartidos" explicando skills, MCP (con la nota de Claude `--mcp-config` vs Antigravity `agy mcp`), contexto compartido, y los subcomandos del CLI con ejemplos.

## Casos borde y decisiones ya tomadas
- Nombres de agentes, skills y servidores son únicos (case-insensitive) dentro de su tipo; el CLI falla con código 2 si hay colisión.
- Si un agente referenciado en `enabledFor` fue borrado, ignorarlo (limpiar al guardar).
- Un skill vacío (contenido en blanco) no se inyecta.
- El archivo `mcp/<agentId>.json` se regenera en cada run (no hace falta borrarlo).
- No romper el bundle web con imports de `node:*` (misma regla del plan 005). No tocar `src/components/ui/**`.
- Texto visible en español.

## Fuera de alcance
- Instalar skills desde repositorios remotos. Editor con resaltado.

## Verificación
```
npx tsc --noEmit
npm run build
npm run build:cli
cd src-tauri && cargo check && cd ..
node bin/ais.js skills add prueba --file PLAN.md --description "skill de prueba"
node bin/ais.js skills list
node bin/ais.js context set --file CLAUDE.md
node bin/ais.js agents add --name Tester --provider antigravity --role implementer --parent Claude --model gemini-3.8-flash-high --auto-approve
node bin/ais.js agents list
node bin/ais.js agents remove Tester
node bin/ais.js skills remove prueba
node bin/ais.js context clear
```
Todo sin errores. Además una corrida real corta contra Antigravity con un skill activo que diga "Respondé siempre empezando con la palabra SKILL-OK" y verificar que la respuesta empieza así:
```
node bin/ais.js skills add saludo --file <archivo con ese texto>
node bin/ais.js -a Antigravity -w %TEMP%\ais-cli-test "Decime hola en una línea"
node bin/ais.js skills remove saludo
```
Commitear con mensajes en inglés. No hacer push.
