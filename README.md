# AIS (Agentic Interaction System)

AIS es una aplicación de escritorio que orquesta agentes de IA (como Claude Code, Antigravity y GitHub Copilot CLI) para resolver tareas complejas de desarrollo de software en tu workspace local de forma autónoma.

## Requisitos

- **Node.js** (v18+)
- **Rust** (con Cargo)
- **WebView2** (Windows)
- **CLIs de los agentes** que quieras usar:
  - Claude Code (`npm install -g @anthropic-ai/claude-code`)
  - Antigravity (`pip install google-antigravity`)
  - GitHub Copilot CLI (`npm install -g @githubnext/github-copilot-cli`)

## Cómo correr y construir

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Correr en modo desarrollo:
   ```bash
   npm run tauri dev
   ```
3. Construir para producción:
   ```bash
   npm run tauri build
   ```

## Cómo funciona la delegación

AIS utiliza una arquitectura jerárquica de agentes, donde los agentes se dividen por roles:
- **Planner**: Planea, razona y delega tareas a otros agentes.
- **Implementer**: Ejecuta instrucciones concretas (modifica código, corre comandos).

Un planner puede delegar tareas a sus hijos usando un bloque especial en su respuesta:

```delegate
[agent_name]
Instrucciones detalladas de la tarea a ejecutar
```

El orquestador de AIS lee este bloque, pausa al planner, e inicia un `Run` para el agente indicado. Una vez que el implementador finaliza y devuelve una respuesta, AIS la inyecta como resultado (`result`) en la misma sesión del planner para que continúe (esto se llama una **ronda**).

AIS mantiene **sesiones** interactivas persistentes con los agentes en segundo plano, por lo que retienen el contexto completo.

## Configuración y agentes personalizados

Puedes agregar y configurar agentes desde la sección "Agentes" de la app. Los agentes personalizados (`custom`) te permiten ejecutar cualquier CLI. Para ellos, debes especificar el programa y sus argumentos. Usa `{prompt}` como comodín para inyectar las instrucciones de la tarea en los argumentos.

La configuración y el estado de la aplicación se guardan automáticamente en:
`%APPDATA%\com.matias.ais\config.json`

> **Nota sobre Antigravity**: Antigravity CLI (`agy`) requiere permisos sobre el directorio del workspace (`--add-dir`). AIS se encarga de inyectar automáticamente esta bandera al invocarlo.
