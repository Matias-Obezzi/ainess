# Informe — 026 Menús contextuales (click derecho)

## Qué se hizo

### Primitivos nuevos

- `src/components/ui/context-menu.tsx`: componente del registry shadcn sobre
  `{ ContextMenu as ContextMenuPrimitive } from "radix-ui"`, con las mismas clases, `data-slot`,
  tamaños y estados (`focus:bg-accent`, `data-[variant=destructive]`) que `dropdown-menu.tsx`.
  Exporta `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`,
  `ContextMenuSeparator`, `ContextMenuLabel`, `ContextMenuGroup`, `ContextMenuCheckboxItem`,
  `ContextMenuRadioGroup/RadioItem`, `ContextMenuShortcut`, `ContextMenuPortal` y `ContextMenuSub*`.
- `src/components/menu-actions.tsx`: tipo `MenuAction` (`key`, `label`, `icon`, `onSelect`,
  `disabled`, `destructive`, `separatorBefore`) más `DropdownActionItems` y `ContextActionItems`.
  Una sola lista de acciones se puede renderizar en el menú de tres puntos y en el de click derecho,
  así no se duplica nada.
- `src/lib/clipboard.ts`: `copyText(text, message)` con `toast.success` / `toast.error("No se pudo
  copiar")`, como hace `RemoteSection`.
- `src/lib/text.ts`: `hasMarkdown(text)` y `toPlainText(text)` para las acciones de copiado.
- `src/lib/__tests__/text.test.ts`: 5 tests de esos dos helpers.

### Elementos con menú contextual y sus acciones

| Elemento | Archivo | Acciones (en orden) |
| --- | --- | --- |
| Fila de proyecto en el sidebar | `shell/Sidebar.tsx` | Editar proyecto · Nuevo chat · Nueva conversación · Copiar ruta del proyecto (deshabilitada sin `workspaceDir`) — separador — **Eliminar** |
| Chat en el sidebar | `shell/Sidebar.tsx` | Abrir · Renombrar — separador — **Eliminar** |
| Nodo de agente en la jerarquía | `AgentNode.tsx` | Detener (deshabilitada si no está ocupado) · Indicar · Ver salida (deshabilitada sin runs) · Chatear — separador — Reiniciar sesión · Editar agente |
| Cabecera del inspector de agente | `shell/AgentInspector.tsx` | Las mismas seis, con "Ver salida" apuntando al run que muestra el panel |
| Respuesta del hilo del orquestador | `shell/OrchestratorThread.tsx` | Copiar texto · Copiar como markdown (deshabilitada si el texto no tiene formato) — separador — Ver detalle · Reintentar (solo en un run interrumpido) |
| Mensaje de chat | `shell/ChatThread.tsx` | Copiar texto · Copiar como markdown — separador — Ver detalle (solo en la respuesta de un agente; deshabilitada si el run ya no está) |
| Pestaña de terminal | `shell/TerminalDockSection.tsx` | Nueva terminal (deshabilitada sin shells o en el máximo) · Renombrar — separador — **Cerrar** |
| Tarjeta de proyecto en Inicio | `shell/HomeScreen.tsx` | Abrir · Editar · Copiar ruta (deshabilitada sin `workspaceDir`) — separador — **Eliminar** |
| Aprobación pendiente | `ApprovalsPanel.tsx` | Aprobar · Copiar la tarea — separador — **Rechazar** |

Ningún menú pasa de siete items, los destructivos van últimos y separados, y el click izquierdo
sigue haciendo exactamente lo mismo que antes. El área del xterm no se tocó: el click derecho ahí
sigue siendo de la terminal.

### Otros ajustes menores

- El sidebar tenía "Nueva conversación" inline dentro del `DropdownMenuItem`; se extrajo a
  `newConversation(projectId)` para compartirla entre los dos menús.
- `HomeScreen` ganó un `editProject(p)` (antes el botón "Editar" seteaba el estado inline).
- `OrchestratorThread` ganó `retry()` e `interrupted`, reusados por el botón "Reintentar" existente
  y por el item del menú.
- La nota de una aprobación y el input de renombrar una terminal hacen `stopPropagation` en
  `onContextMenu`: dentro de un campo el click derecho es del navegador, para pegar.
- `ChatBubble` ahora monta un `RunDetailDialog` (antes solo lo tenía el hilo del orquestador).

## Commits

| Hash | Mensaje |
| --- | --- |
| `ded3a99` | Add the context menu primitive and the shared menu action helpers |
| `ba29f5b` | Right-click menus on sidebar projects and chats |
| `13a6c7a` | Right-click menu on an agent node and on the inspector header |
| `8516a84` | Right-click menu on thread and chat messages: copy, detail, retry |
| `ee665d1` | Right-click menus on terminal tabs, home project cards and approvals |
| `c42fcc2` | Cover the plain-text and markdown helpers with tests |
| `5daae0d` | Restore the lockfile untouched by this branch |

Todo en `feat/context-menus`, sin push.

## Verificación

Desde la raíz del worktree, después del último commit:

- `npx tsc --noEmit` → **sin errores** (el proyecto tiene `noUnusedLocals`/`noUnusedParameters`, así
  que tampoco quedaron imports sueltos).
- `npm test` → **11 archivos, 107 tests, todos verdes** (incluye los 5 nuevos de `src/lib/text.ts`).
- `npm run build` → **OK** (front + remote). Los únicos warnings son los de siempre: chunk > 500 kB e
  `INEFFECTIVE_DYNAMIC_IMPORT` de `orchestrator.ts`, ambos previos a este cambio.

No se pudo hacer una prueba en vivo de la app: el puerto 1420 estaba ocupado por el dev server del
repo principal. Se levantó un `vite` aparte en el 5199 y la app carga bien en el navegador, pero sin
backend Tauri no se puede crear un proyecto (el campo de ruta es `readOnly`, depende del selector de
carpetas nativo), así que ningún elemento con menú llega a renderizarse. Queda pendiente la prueba
manual dentro de la app.

## Decisiones tomadas

1. **Etiquetas**: se usaron las que ya dice la app ("Indicar", "Chatear", "Editar agente") en vez de
   las del plan ("Dar una orden", "Abrir chat"), para no tener dos nombres para la misma acción.
2. **Íconos**: van sin `className`; el ítem del menú ya los lleva a `size-4` con el mismo selector
   que usa `dropdown-menu.tsx`, así se ven idénticos a los del menú de tres puntos que ya existía.
   El `h-3.5 w-3.5` del plan es el tamaño de los botones-ícono, no el de los items de menú.
3. **Destructivos**: se usó `variant="destructive"` del componente (que ya aplica `text-destructive`
   y el foco rojo) en vez de un `className="text-destructive"` suelto, que es lo que ya hacía el
   sidebar.
4. **"Copiar ruta del proyecto"** quedó solo en el menú de click derecho del sidebar, como dice el
   plan ("las mismas acciones… más Copiar ruta"); el menú de tres puntos quedó igual que antes. Lo
   mismo con "Abrir" en el chat.
5. **Inspector de agente**: el menú se puso en la cabecera (avatar, nombre, estado), que es lo que
   representa al agente, y no en todo el panel, para no robarle el click derecho al texto de los
   errores y las tareas.
6. **Aprobación**: el orden es Aprobar · Copiar la tarea — separador — Rechazar, para respetar la
   regla de "los destructivos van últimos y separados" (el plan las listaba como Aprobar, Rechazar,
   Copiar).
7. **Mensajes**: el menú va sobre la respuesta del agente. La burbuja con la consigna del usuario en
   el hilo del orquestador quedó sin menú (el plan pedía copiar el mensaje, y el texto copiable es el
   de la respuesta).
8. **"Copiar como markdown"** se muestra siempre pero deshabilitada cuando el texto no tiene formato,
   siguiendo la regla de deshabilitar en vez de esconder. "Reintentar" sí se esconde cuando el run no
   se interrumpió, que es la excepción que el propio plan da.
9. El `package-lock.json` venía con una línea modificada (`"peer": true`) desde antes de empezar; se
   revirtió para que la rama no arrastre ruido ajeno al cambio.

## Pendientes o dudas

- Falta la prueba manual en la app real (ver Verificación). Lo que conviene mirar: que el menú del
  nodo no pelee con el drag de React Flow, y que el click derecho sobre una tarjeta de Inicio no
  dispare el `onClick` de la tarjeta.
- La vista remota (`src/remote/**`) quedó sin tocar, como pide el plan.
- Si en algún momento se quiere que el menú de tres puntos del sidebar también ofrezca "Copiar ruta"
  y "Abrir", es cambiar un flag en `projectActions` / `chatActions`.
