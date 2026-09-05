# AIS (Agentic Interaction System)

AIS es una aplicaci贸n de escritorio que orquesta agentes de IA (como Claude Code, Antigravity y GitHub Copilot CLI) para resolver tareas complejas de desarrollo de software en tu workspace local de forma aut贸noma.

## Requisitos

- **Node.js** (v18+)
- **Rust** (con Cargo)
- **WebView2** (Windows)
- **CLIs de los agentes** que quieras usar:
  - Claude Code (`npm install -g @anthropic-ai/claude-code`)
  - Antigravity (`pip install google-antigravity`)
  - GitHub Copilot CLI (`npm install -g @githubnext/github-copilot-cli`)

## C贸mo correr y construir

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Correr en modo desarrollo:
   ```bash
   npm run tauri dev
   ```
3. Construir para producci贸n:
   ```bash
   npm run tauri build
   ```

## C贸mo funciona la delegaci贸n

AIS utiliza una arquitectura jer谩rquica de agentes, donde los agentes se dividen por roles:
- **Planner**: Planea, razona y delega tareas a otros agentes.
- **Implementer**: Ejecuta instrucciones concretas (modifica c贸digo, corre comandos).

Un planner puede delegar tareas a sus hijos usando un bloque especial en su respuesta:

```delegate
[agent_name]
Instrucciones detalladas de la tarea a ejecutar
```

El orquestador de AIS lee este bloque, pausa al planner, e inicia un `Run` para el agente indicado. Una vez que el implementador finaliza y devuelve una respuesta, AIS la inyecta como resultado (`result`) en la misma sesi贸n del planner para que contin煤e (esto se llama una **ronda**).

AIS mantiene **sesiones** interactivas persistentes con los agentes en segundo plano, por lo que retienen el contexto completo.

## Configuraci贸n y agentes personalizados

Puedes agregar y configurar agentes desde la secci贸n "Agentes" de la app. Los agentes personalizados (`custom`) te permiten ejecutar cualquier CLI. Para ellos, debes especificar el programa y sus argumentos. Usa `{prompt}` como comod铆n para inyectar las instrucciones de la tarea en los argumentos.

La configuraci贸n y el estado de la aplicaci贸n se guardan autom谩ticamente en:
`%APPDATA%\com.matias.ais\config.json`

> **Nota sobre Antigravity**: Antigravity CLI (`agy`) requiere permisos sobre el directorio del workspace (`--add-dir`). AIS se encarga de inyectar autom谩ticamente esta bandera al invocarlo.

## Recursos compartidos

AIS permite compartir recursos entre distintos agentes para estandarizar el comportamiento del equipo:
- **Skills**: Instrucciones y convenciones que se inyectan en el prompt del sistema.
- **Servidores MCP**: Herramientas extra. Para Claude se configuran con --mcp-config por sesi髇, y para Antigravity (gy mcp) se sincronizan de forma global a la m醧uina usando is mcp sync.
- **Contexto compartido**: Un bloque de texto que se inyecta a todos los agentes para darles contexto sobre el proyecto o equipo.

### CLI (Recursos)

- **Agentes**: 
  - is agents add --name QA --provider antigravity --role reviewer --parent Claude
  - is agents list
  - is agents remove QA
- **Skills**:
  - is skills add convenciones --file RULES.md --agents Claude,QA
  - is skills list
  - is skills remove convenciones
- **MCP**:
  - is mcp add mi-server --command npx --args "-y @modelcontextprotocol/server-filesystem /dir"
  - is mcp add fetch --url https://api.example.com/sse
  - is mcp sync (sincroniza con Antigravity)
- **Contexto**:
  - is context set --file context.txt
  - is context clear

