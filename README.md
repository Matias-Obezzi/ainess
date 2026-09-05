# ainess (antes AIS - Agentic Interaction System)

AIS es una aplicaciÃ³n de escritorio que orquesta agentes de IA (como Claude Code, Antigravity y GitHub Copilot CLI) para resolver tareas complejas de desarrollo de software en tu workspace local de forma autÃ³noma.

## Requisitos

- **Node.js** (v18+)
- **Rust** (con Cargo)
- **WebView2** (Windows)
- **CLIs de los agentes** que quieras usar:
  - Claude Code (`npm install -g @anthropic-ai/claude-code`)
  - Antigravity (`pip install google-antigravity`)
  - GitHub Copilot CLI (`npm install -g @githubnext/github-copilot-cli`)

## CÃ³mo correr y construir

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Correr en modo desarrollo:
   ```bash
   npm run tauri dev
   ```
3. Construir para producciÃ³n:
   ```bash
   npm run tauri build
   ```

## CÃ³mo funciona la delegaciÃ³n

AIS utiliza una arquitectura jerÃ¡rquica de agentes, donde los agentes se dividen por roles:
- **Planner**: Planea, razona y delega tareas a otros agentes.
- **Implementer**: Ejecuta instrucciones concretas (modifica cÃ³digo, corre comandos).

Un planner puede delegar tareas a sus hijos usando un bloque especial en su respuesta:

```delegate
[agent_name]
Instrucciones detalladas de la tarea a ejecutar
```

El orquestador de AIS lee este bloque, pausa al planner, e inicia un `Run` para el agente indicado. Una vez que el implementador finaliza y devuelve una respuesta, AIS la inyecta como resultado (`result`) en la misma sesiÃ³n del planner para que continÃºe (esto se llama una **ronda**).

AIS mantiene **sesiones** interactivas persistentes con los agentes en segundo plano, por lo que retienen el contexto completo.

## ConfiguraciÃ³n y agentes personalizados

Puedes agregar y configurar agentes desde la secciÃ³n "Agentes" de la app. Los agentes personalizados (`custom`) te permiten ejecutar cualquier CLI. Para ellos, debes especificar el programa y sus argumentos. Usa `{prompt}` como comodÃ­n para inyectar las instrucciones de la tarea en los argumentos.

La configuraciÃ³n y el estado de la aplicaciÃ³n se guardan automÃ¡ticamente en:
`%APPDATA%\com.matias.ais\config.json`

> **Nota sobre Antigravity**: Antigravity CLI (`agy`) requiere permisos sobre el directorio del workspace (`--add-dir`). AIS se encarga de inyectar automÃ¡ticamente esta bandera al invocarlo.

## Recursos compartidos

AIS permite compartir recursos entre distintos agentes para estandarizar el comportamiento del equipo:
- **Skills**: Instrucciones y convenciones que se inyectan en el prompt del sistema.
- **Servidores MCP**: Herramientas extra. Para Claude se configuran con --mcp-config por sesión, y para Antigravity ( gy mcp) se sincronizan de forma global a la máquina usando  is mcp sync.
- **Contexto compartido**: Un bloque de texto que se inyecta a todos los agentes para darles contexto sobre el proyecto o equipo.

## Proyectos

AIS soporta múltiples proyectos simultáneamente. Cada proyecto está asociado a una carpeta (workspace) y mantiene sus propias tareas y estado. Puedes gestionar proyectos desde la pestaña "Proyectos" en la UI o mediante el CLI.
El CLI permite elegir el proyecto donde ejecutar las tareas usando `-p <nombre>` o resolviéndolo a partir de `-w <carpeta>`.

### CLI (Gestión y uso)

- **Proyectos**:
  - `ais projects add <nombre> --dir <carpeta>`
  - `ais projects list`
  - `ais projects remove <nombre>`
- **Ejecución (Run)**:
  - `ais run -p MiProyecto "Instrucciones de la tarea"`
  - `ais run -w C:\Ruta\Al\Workspace "Instrucciones de la tarea"`
- **Agentes**: 
  - `ais agents add --name QA --provider antigravity --role reviewer --parent Claude`
  - `ais agents list`
  - `ais agents remove QA`
- **Skills**:
  -  is skills add convenciones --file RULES.md --agents Claude,QA
  -  is skills list
  -  is skills remove convenciones
- **MCP**:
  -  is mcp add fetch --url https://api.example.com/sse
  -  is mcp sync (sincroniza con Antigravity)
- **Contexto**:
  -  is context set --file context.txt
  -  is context clear

## Hooks

Puedes configurar reglas para reaccionar a eventos del orquestador mediante la pestaña "Hooks" en la UI o desde el CLI.

**Variables disponibles en las plantillas**: `{{event}}`, `{{project}}`, `{{workspace}}`, `{{agent}}`, `{{agentRole}}`, `{{runId}}`, `{{round}}`, `{{prompt}}`, `{{output}}`, `{{error}}`, `{{taskPrompt}}`, `{{time}}`. Y para eventos `delegation`: `{{toAgent}}`, `{{task}}`, `{{model}}`.
También puedes truncar variables, por ejemplo: `{{output|300}}`.

**Ejemplos de comandos (CLI)**:
- **Slack (webhook entrante)**:
  `ais hooks add SlackNotify --event task.finished --action slack --url https://hooks.slack.com/services/T000... --template "✅ {{agent}} terminó en {{project}}: {{output|300}}"`
- **Discord**:
  `ais hooks add DiscordNotify --event task.failed --action discord --url https://discord.com/api/webhooks/... --template "❌ Error en {{project}}: {{error|500}}"`
- **Comando local (abrir reporte)**:
  `ais hooks add AbrirReporte --event result --action command --program code --args "{{workspace}}/report.md"`
- **Instrucción encadenada**:
  `ais hooks add Review --event run.finished --filter-agent Implementador --action instruct --agent Revisor --template "Revisá estos cambios: {{output}}"`

## Chat

Además de las tareas con delegación, podés hablar directamente con un agente o armar una conversación compartida entre varios, cada uno con un rol propio para ese chat. Los chats pertenecen a un proyecto (usan su carpeta como workspace) y cada agente mantiene su sesión, así que la conversación continúa donde quedó, incluso entre la app y el CLI.

- **Individual**: un solo agente. No delega ni parsea bloques `delegate`: es un chat puro.
- **Compartido**: varios agentes responden por turnos, en el orden de la lista, viendo lo que ya dijeron los demás en ese turno.

En la app: pestaña **Chat** → "Nuevo chat", elegí modo, participantes, rol y modelo opcional. Desde el grafo, el botón "Chatear" de un nodo abre su chat individual.

Desde la terminal:

```bash
ais chat -a Antigravity -w C:\repo                       # chat interactivo (vos> ...), /nuevo reinicia, /salir termina
ais chat --shared "Claude:arquitecto,Antigravity:crítico" -w C:\repo
ais chat send "CLI: Antigravity" "¿Qué pendientes quedaron?" -w C:\repo   # un turno, no interactivo
echo "Resumime el README" | ais chat -a Claude            # entrada por pipe: un turno por línea
```

Los mensajes y las sesiones se guardan en `%APPDATA%\com.matias.ais\chats\<id>.json`.

## Historial

Los runs y el feed de comunicación de cada proyecto se guardan en `%APPDATA%\com.matias.ais\history\<projectId>.json` (máximo 300 runs y 3000 mensajes por proyecto; de cada run se conservan las últimas 300 líneas crudas). Al abrir la app o el CLI se restauran solos; un run que quedó a medias cuando se cerró la app aparece como error "[interrumpido: la aplicación se cerró]".

Desde la terminal:

```bash
ais history -w C:\repo --limit 20     # últimos runs del proyecto
ais history show 3f2a                 # prompt, salida y líneas crudas de un run (prefijo del id)
ais status                            # runs guardados y último run por proyecto
```

El botón "Limpiar" de la pestaña Comunicación borra el historial del proyecto, en memoria y en disco.

## Aprobaciones

Podés exigir tu visto bueno antes de que un agente reciba una tarea delegada:

- Por agente: en Agentes → Editar, activá "Requiere tu aprobación para recibir tareas delegadas".
- Global: en Recursos → Perfil, activá "Aprobar todas las delegaciones".

Cuando el planificador delega, la tarea queda en espera y aparece arriba en la app, en el celular y en `ais approvals list`. Aprobás o rechazás (con una nota opcional que el planificador recibe como resultado). Las pendientes se guardan con el historial, así que sobreviven un reinicio. El evento de hook `approval.requested` permite avisarte por Slack o Discord.

```bash
ais approvals list
ais approvals approve 8bc8af51 --note "dale"
ais approvals reject 8bc8af51 --note "primero los tests"
```

`ais run` termina con código 3 cuando una delegación queda esperando aprobación; al aprobar desde el CLI, el agente hijo corre en ese mismo proceso.

## Acceso remoto desde el celular

Con el celular en la misma WiFi podés ver el estado de agentes y proyectos en vivo, leer el feed, mandar prompts o instrucciones, detener y aprobar delegaciones.

- En la app: Recursos → Remoto, activá el switch y escaneá el QR (o copiá la URL). La app lo levanta sola en cada arranque si queda activado.
- Desde la terminal: `ais serve` deja el servidor corriendo con el orquestador del CLI e imprime la URL.

```bash
ais serve --port 4710 -w C:\repo
ais remote url                  # URL con token
ais remote token --regenerate   # invalida la URL anterior
```

La URL lleva un token: sin él el servidor responde 401. Solo escucha en la red local (no hay HTTPS ni acceso desde afuera); si no carga, permití el puerto en el firewall de Windows. La página móvil (`src/remote/remote.html`) no usa internet ni frameworks.

Protocolo (para integrar otras herramientas): `GET /api/state`, `GET /api/events` (SSE con eventos `state`), `POST /api/prompt`, `/api/instruct`, `/api/stop`, `/api/approve`, `/api/chat`, todos con `Authorization: Bearer <token>` o `?token=`.
