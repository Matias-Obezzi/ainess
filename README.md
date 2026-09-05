# AIS (Agentic Interaction System)

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
  - is mcp add fetch --url https://api.example.com/sse
  - is mcp sync (sincroniza con Antigravity)
- **Contexto**:
  - is context set --file context.txt
  - is context clear

