## Qué se hizo
Se actualizó el modelo de datos (`AppConfig` v3 en `types.ts`) para soportar múltiples proyectos en la configuración, guardando los mensajes, ejecuciones (runs) y estado de los agentes separados por proyecto (projectId) en `store.ts`. 
Se adaptó el orquestador (`orchestrator.ts`) para despachar tareas heredando el `projectId` y ejecutar los comandos apuntando a la ruta `workspaceDir` del proyecto correspondiente.
Se actualizaron los componentes de la UI (`Header`, `PromptPanel`, `CommunicationPanel`, `HierarchyGraph`, `AgentNode`) incorporando el selector de proyectos y añadiendo una nueva pestaña "Proyectos" con la gestión CRUD (utilizando el nuevo componente `ProjectDialog` y `ProjectsPanel`). El CLI (`main.ts`) fue actualizado con el subcomando `projects` y la lógica para resolver el proyecto mediante la opción `--project` o `--workspace`.

## Commits
- `2229d17`: feat: add multi-project support in UI and CLI
- `0ca9751`: docs: add projects to README and add test script

## Verificación
Se corrió `npx tsc --noEmit` resolviendo todos los errores de tipos provocados por el cambio en el `store`. 
Se ejecutó `npm run build` (tauri app) y `npm run build:cli` sin errores.
Se probó la interfaz de comandos con el script de prueba para la CLI: se agregaron dos proyectos, se listaron correctamente y se instanció al agente en uno de ellos. El agente resolvió la tarea satisfactoriamente y persistió el archivo en la ruta esperada.

## Decisiones tomadas
- Se mantuvo `activeTaskRunId` a nivel local (UI state) indexado por `projectId`, de manera que cada proyecto mantenga rastro de su tarea activa de manera independiente al cambiar de pestaña.
- En la UI, si no hay un proyecto activo o no hay ninguno configurado, se muestra un estado vacío (un mensaje incitando a crear un proyecto) en vez de ocultar por completo las vistas, mejorando la UX.
- Si un agente está ejecutando una tarea en un proyecto que no está actualmente seleccionado en la UI, se agregó un pequeño badge indicativo "ocupado en: [nombre-proyecto]" en el nodo del grafo de jerarquía para darle visibilidad de fondo al usuario.

## Pendientes o dudas
- Ninguno por el momento.
