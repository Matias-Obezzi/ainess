# Menús contextuales (click derecho) en toda la app

Repo: C:\Users\matia\Desktop\projects\ais-wt-ctx (worktree, rama `feat/context-menus`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

Que el click derecho en cualquier elemento importante de la app abra un menú con acciones propias de
ese elemento, en vez de no hacer nada (hoy no hay ningún menú contextual). Las acciones ya existen en
la app: esto es exponerlas donde el usuario tiene el mouse, no inventar comportamiento nuevo.

## Contexto

- Falta el primitivo: hay `src/components/ui/dropdown-menu.tsx` pero **no** `context-menu`. Agregalo
  como componente del registry shadcn (`radix-ui` ya es dependencia directa: importá
  `{ ContextMenu as ContextMenuPrimitive } from "radix-ui"`, igual que hace `dropdown-menu.tsx` con
  `DropdownMenu`). El archivo nuevo es `src/components/ui/context-menu.tsx` y tiene que exportar
  `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`,
  `ContextMenuLabel` y `ContextMenuSub*` si te hace falta. Copiá el estilo (clases, `data-slot`,
  tamaños, `focus:bg-accent`) de `dropdown-menu.tsx` para que se vean idénticos.
- Las acciones de un agente ya están centralizadas en `src/components/agent-actions.tsx`
  (`useAgentActions`: stop, instruct, viewOutput, openChat, resetSession, editAgent, más los diálogos
  que abren). Reusalo, no dupliques lógica.
- El store (`src/store.ts`) tiene todo lo demás: `openProject`, `updateProject`, `removeProject`,
  `openTerminal`, `closeTerminal`, `renameTerminal`, `setActiveTerminal`, `openSettings`,
  `submitPrompt`, `resetSession`, `addChat`/`removeChat`, etc.
- Confirmaciones: `src/lib/confirm.ts` exporta `confirmDelete(what, name?, detail?)`. Toda acción
  destructiva del menú tiene que pasar por ahí, como ya hacen los botones equivalentes.
- Copiar al portapapeles: `navigator.clipboard.writeText` con `toast.success("… copiado")` /
  `toast.error("No se pudo copiar")`, igual que `RemoteSection`.
- Estética y textos: UI en español, código en inglés. Íconos de `lucide-react`, del mismo tamaño que
  usan los menús actuales (`h-3.5 w-3.5`).

## Cambios

### 1. `src/components/ui/context-menu.tsx` (nuevo)

El componente del registry, con las mismas clases que `dropdown-menu.tsx`.

### 2. Dónde va cada menú

Envolvé cada elemento en `<ContextMenu><ContextMenuTrigger asChild>…</ContextMenuTrigger><ContextMenuContent>…</ContextMenuContent></ContextMenu>`.
Si el trigger no acepta `asChild` sin romper el layout, usá un wrapper `div` con `contents`.

1. **Proyecto en el sidebar** (`src/components/shell/Sidebar.tsx`): ya hay un menú de tres puntos con
   Editar / Nuevo chat / Nueva conversación / Eliminar. El click derecho sobre la fila del proyecto
   abre **las mismas** acciones (extraé los items a una función o componente compartido para no
   duplicarlos), más "Copiar ruta del proyecto".
2. **Chat en el sidebar**: Abrir, Renombrar (si ya existe esa acción; si no, Editar), Eliminar.
3. **Agente en la jerarquía** (`src/components/AgentNode.tsx`) y en el inspector
   (`src/components/shell/AgentInspector.tsx`): las acciones de `useAgentActions` (Detener, Dar una
   orden, Ver salida, Abrir chat, Reiniciar sesión, Editar), deshabilitando las que no aplican igual
   que hoy hace el menú del nodo.
4. **Mensaje del hilo del orquestador** (`src/components/shell/OrchestratorThread.tsx`) y del chat
   (`src/components/shell/ChatThread.tsx`): Copiar texto, Copiar como markdown si el mensaje tiene
   formato, y "Ver detalle" cuando el mensaje corresponde a un run (ya existe `RunDetailDialog`).
   En un run interrumpido, sumá "Reintentar" reusando el botón que ya está.
5. **Pestaña de terminal** (`src/components/shell/TerminalDockSection.tsx`): Nueva terminal,
   Renombrar, Cerrar. Sobre el área de la terminal en sí **no** pongas menú: el click derecho ahí lo
   usa xterm para pegar.
6. **Tarjeta de proyecto en el inicio** (`src/components/shell/HomeScreen.tsx`): Abrir, Editar,
   Copiar ruta, Eliminar.
7. **Aprobación pendiente** (`src/components/ApprovalsPanel.tsx`): Aprobar, Rechazar, Copiar la tarea.

En todos los casos el click izquierdo sigue haciendo exactamente lo que hace hoy.

### 3. Reglas

- Ningún menú puede tener más de siete items; agrupá con `ContextMenuSeparator`.
- Los items destructivos van últimos, separados, con `className="text-destructive"`.
- Un item que no aplica va **deshabilitado**, no escondido, salvo que no tenga sentido en absoluto
  (por ejemplo "Reintentar" en un run que no se interrumpió).
- No agregues dependencias nuevas.
- No toques el menú contextual nativo del navegador dentro de las terminales (xterm).

## Casos borde y decisiones ya tomadas

- Si una acción abre un diálogo (Editar, Dar una orden, Ver salida), el menú se cierra y el diálogo se
  abre, igual que desde los botones actuales.
- El click derecho no cambia la selección salvo donde ya la cambiaría el click izquierdo: en la fila
  de proyecto y en la pestaña de terminal, seleccionalo antes de abrir el menú (es lo que espera
  cualquiera que use un explorador de archivos).
- Si el proyecto no tiene `workspaceDir`, "Copiar ruta" va deshabilitado.

## Fuera de alcance

- La vista remota (`src/remote/**`): en el celular no hay click derecho.
- Cambiar el diseño de los componentes envueltos, más allá de agregarles el menú.
- Atajos de teclado nuevos.
- Nada de push: solo commits locales.

## Verificación

Desde la raíz del worktree:

```
npx tsc --noEmit
npm test
npm run build
```

Todo tiene que pasar sin warnings nuevos. Además, dejá anotado en el informe qué elementos quedaron
con menú y con qué acciones cada uno.
