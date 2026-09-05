// Curated catalog offered from "Agregar sugeridos" in the Skills and MCP settings sections.
import type { McpServer, Skill } from "@/types";

export type SuggestedMcp = Omit<McpServer, "id" | "enabledFor"> & {
  description: string;
  /** Shown as a warning when the entry needs manual editing before it works (a path, a token). */
  requires?: string;
};

export const SUGGESTED_MCP: SuggestedMcp[] = [
  {
    name: "Filesystem",
    description: "Acceso a archivos de una carpeta",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "<carpeta>"],
    requires: "Reemplazá <carpeta> por la ruta",
  },
  {
    name: "GitHub",
    description: "Repositorios, issues y pull requests de GitHub",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
    requires: "Completá GITHUB_PERSONAL_ACCESS_TOKEN",
  },
  {
    name: "Git",
    description: "Operar un repositorio git local",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-git"],
    requires: "Requiere tener instalado uv",
  },
  {
    name: "Fetch",
    description: "Descargar páginas web como texto",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-fetch"],
    requires: "Requiere tener instalado uv",
  },
  {
    name: "Memory",
    description: "Memoria persistente entre sesiones",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
  },
  {
    name: "Sequential Thinking",
    description: "Razonamiento paso a paso para tareas complejas",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  },
  {
    name: "Playwright",
    description: "Controlar un navegador",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
  },
  {
    name: "Context7",
    description: "Documentación actualizada de librerías",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
  },
  {
    name: "PostgreSQL",
    description: "Consultar una base de datos PostgreSQL",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", "<connection-string>"],
    requires: "Reemplazá <connection-string> por la cadena de conexión",
  },
  {
    name: "SQLite",
    description: "Consultar una base de datos SQLite",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-sqlite", "--db-path", "<archivo.db>"],
    requires: "Reemplazá <archivo.db> por la ruta y requiere uv",
  },
  {
    name: "Brave Search",
    description: "Buscar en la web con Brave Search",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "" },
    requires: "Completá BRAVE_API_KEY",
  },
  {
    name: "Slack",
    description: "Leer y enviar mensajes de Slack",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: { SLACK_BOT_TOKEN: "", SLACK_TEAM_ID: "" },
    requires: "Completá SLACK_BOT_TOKEN y SLACK_TEAM_ID",
  },
];

export const SUGGESTED_SKILLS: Array<Omit<Skill, "id" | "enabledFor">> = [
  {
    name: "Commits convencionales",
    description: "Mensajes de commit consistentes",
    content: `Al hacer commits, usá el formato Conventional Commits:
- feat: nueva funcionalidad
- fix: corrección de un bug
- refactor: cambio de código sin alterar comportamiento
- docs: solo documentación
- test: agregar o corregir tests
- chore: tareas de mantenimiento

El mensaje debe empezar en minúscula, en modo imperativo ("agrega", no "agregado"),
y explicar el "por qué" cuando no sea obvio.`,
  },
  {
    name: "Revisión de código",
    description: "Checklist antes de aprobar un cambio",
    content: `Antes de dar por buena una revisión de código, chequeá:
- ¿El cambio resuelve el problema pedido sin tocar código no relacionado?
- ¿Hay manejo de errores para las rutas que pueden fallar?
- ¿Los nombres de variables y funciones son claros?
- ¿Se agregaron o actualizaron tests para el comportamiento nuevo?
- ¿Hay código duplicado que se podría extraer?
- ¿Quedaron console.log, TODOs o comentarios de debug?`,
  },
  {
    name: "Tests primero",
    description: "Escribir el test antes de la implementación",
    content: `Cuando implementes una funcionalidad nueva o corrijas un bug:
1. Escribí primero un test que falle mostrando el comportamiento esperado.
2. Implementá el código mínimo para que el test pase.
3. Refactorizá manteniendo los tests en verde.
4. Corré toda la suite de tests antes de dar por terminada la tarea, no solo el test nuevo.`,
  },
  {
    name: "Documentar cambios",
    description: "Mantener README y CHANGELOG al día",
    content: `Cuando un cambio afecta cómo se usa o configura el proyecto:
- Actualizá el README si cambia un comando, una opción o el setup.
- Si existe un CHANGELOG, agregá una entrada breve describiendo el cambio.
- No documentes detalles de implementación que puedan quedar obsoletos rápido; documentá
  el comportamiento observable.`,
  },
  {
    name: "Seguridad básica",
    description: "Secretos, inputs y dependencias",
    content: `Antes de cerrar una tarea, revisá:
- Que no queden credenciales, tokens o claves hardcodeadas en el código o en commits.
- Que los inputs de usuario se validen antes de usarlos en queries, comandos de shell o rutas
  de archivo (evitar inyección SQL, command injection y path traversal).
- Que las dependencias nuevas sean de una fuente confiable y no dupliquen algo ya instalado.`,
  },
  {
    name: "Respuestas concisas",
    description: "Ir al grano en las explicaciones",
    content: `Al responder o explicar un cambio, priorizá la brevedad:
- Explicá el "qué" y el "por qué" en pocas líneas antes de mostrar código.
- Evitá repetir el plan completo o narrar cada paso intermedio.
- Si el pedido es simple, la respuesta también debe serlo.`,
  },
  {
    name: "Plan antes de implementar",
    description: "Pensar el enfoque antes de tocar código",
    content: `Para tareas que tocan más de un archivo o tienen ambigüedad:
1. Primero explorá el código relevante para entender el estado actual.
2. Esbozá un plan corto (qué archivos cambian y por qué) antes de escribir código.
3. Si el pedido es ambiguo, tomá la decisión más conservadora y anotala, no preguntes si podés
  seguir de forma autónoma.`,
  },
  {
    name: "Verificar antes de terminar",
    description: "Correr tests y typecheck antes de cerrar",
    content: `Antes de considerar una tarea terminada:
- Corré el build/typecheck del proyecto y arreglá los errores que introduzcas.
- Corré la suite de tests relevante, no solo la que creíste afectada.
- Si el proyecto tiene lint configurado, corré también el lint sobre los archivos tocados.
- No des la tarea por terminada si alguna de estas verificaciones falla.`,
  },
  {
    name: "Estilo TypeScript estricto",
    description: "Buenas prácticas de tipado",
    content: `Al escribir TypeScript:
- Evitá "any"; usá tipos concretos o genéricos.
- No dejes variables o imports sin usar (noUnusedLocals).
- Preferí interfaces/tipos explícitos en los contratos públicos (props, retornos de funciones
  exportadas) y dejá que el resto se infiera.
- Manejá los "null"/"undefined" explícitamente en vez de castear con "!" salvo que sea
  imposible que ocurra.`,
  },
  {
    name: "Accesibilidad básica en UI",
    description: "Checklist rápido de accesibilidad",
    content: `Al construir componentes de interfaz:
- Todo elemento clickeable debe ser un <button>, un <a> o tener role="button" y ser
  navegable por teclado.
- Los inputs deben tener un <label> asociado (o aria-label si no hay label visible).
- Los íconos que transmiten información (no solo decorativos) deben tener texto alternativo
  o aria-label.
- Verificá que el contraste de texto sobre fondo sea legible, especialmente en estados
  deshabilitados o "muted".`,
  },
];
