# Plan de Mejoras Solicitadas

## 1. Contador "x trabajando" y Popover de agentes activos
- **Bug**: Agentes con estado `waiting` se contaban como trabajando (`r.status === "working" || r.status === "waiting"`). Corregir para contar únicamente `status === "working"`.
- **Feature**: Hacer interactivo el indicador "x trabajando" (en el Sidebar y donde aplique) mediante un Popover similar al de `QuotaIndicator`, mostrando los agentes que están corriendo activamente, el proyecto y tarea en la que trabajan, permitiendo clickear para ir a dicho proyecto/chat.

## 2. Bug de texto fantasma / auto-complete / wrapping en Composer
- **Bug**: En `Composer.tsx`, el `<div>` de resaltado/fantasma (`composer-layer`) y el `<Textarea>` (`composer-input`) difieren en wrapping cuando hay prompts largos o palabras de 4-5 letras al final de la línea.
- **Causas a resolver**:
  - Unificar reglas de wrapping CSS (`word-break`, `overflow-wrap`, `hyphens`, `whitespace-pre-wrap`).
  - Sincronizar métricas de fuente, line-height, letter-spacing, padding y bordes exactos.
  - El texto sugerido (ghost text) no debe forzar el salto de línea prematuro del texto escrito por el usuario en el layer de fondo.

## 3. Navegación al clickear notificaciones
- **Feature**: En `NotificationBell.tsx`, al clickear una notificación de pregunta (`kind === "question"`) o relacionada a un agente/chat, navegar al proyecto y al chat correspondiente (`openProject(projectId, chatId, "chat")`) en lugar de únicamente abrir el diálogo de detalles o dejar la vista genérica.
- Guardar `chatId` en la notificación (`AppNotification`) cuando esté disponible en `orchestrator.ts`.

## 4. Reemplazo de Ctrl+F por búsqueda en chat y navegación a mensaje
- **Feature**: Atajo `Ctrl+F` (y `Cmd+F` en Mac) registrado en `shortcuts.ts` y capturado en `App.tsx` para abrir la paleta de búsqueda preseleccionando o filtrando mensajes de chat.
- **Feature**: Al seleccionar un resultado de mensaje en `SearchPalette.tsx`, abrir el proyecto y chat correspondiente, asegurar que los mensajes estén cargados en el historial del chat, scrollear hasta el mensaje específico y aplicar un efecto visual de foco/resaltado temporal.

## 5. Continuar automáticamente al volver los tokens en Claude y soporte de Quota en ChatThread
- **Bug / Feature**:
  - En `src/lib/quota.ts`, expandir los patrones de `OUT_OF_QUOTA` para contemplar las diversas formas en las que Claude Code y su API reportan falta de tokens / límites de uso ("out of tokens", "token limit", "usage limit", "rate limit exceeded", etc.).
  - En `src/lib/orchestrator.ts`, los runs de chat (`kind === "chat"`) actualmente retornan en `onRunFinished` sin verificar agotamiento de cuota ni activar `parkQuotaRetry`. Habilitar el chequeo y estacionamiento con reintento automático para runs de chat.
  - En `ChatThread.tsx`, renderizar el componente `QuotaCard` en mensajes que fallaron por cuota (al igual que se hace en `OrchestratorThread`), permitiendo pausar, reintentar automáticamente al volver la cuota, o cambiar de modelo.

## 6. Opción "Open in" en menú contextual de proyecto
- **Mejora**: En `src/components/shell/Sidebar.tsx`, ocultar la opción "Open in..." (`project.openIn`) del menú del proyecto si `editors.length === 0`, de modo que solo sea visible si hay al menos un editor de código instalado/detectado en el sistema.

## 7. Corrección de bloqueo "is in the middle of something else" tras reinicio/crash
- **Bug**: Tras reiniciar el sistema o cerrar de golpe, `interrupted-runtime.ts` asignaba `status: 'stopped', currentRunId: run.id`. En `orchestrator.ts`, `busy` solo chequeaba `!!currentRunId`, considerando al agente ocupado indefinidamente.
- **Solución**: Validar que el agente esté ocupado únicamente si `status === 'working'` y la corrida en `currentRunId` existe y está viva (`isLiveRun(status)`).

## 8. Mascota interactiva y generativa del proyecto
- **Feature**: Componente `ProjectMascot` que se adapta visualmente según:
  - Nombre del proyecto (hashing determinístico para rasgos, accesorios, expresiones).
  - Color del proyecto (color principal y sombras del personaje).
  - Proveedor/modelo del agente orquestador (detalles o insignias temáticas).
- **Ubicación**: En los estados vacíos de los hilos de chat y orquestador (`OrchestratorThread` y `ChatThread`), aprovechando el espacio libre con presencia viva y amigable.
