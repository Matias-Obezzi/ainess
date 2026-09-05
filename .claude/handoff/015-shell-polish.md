# Pulido de la shell nueva: grafo, pastilla de actividad y panel de comunicación

Repo: C:\Users\matia\Desktop\projects\ais (único repo)
Rama: la que esté activa en el repo (`main`), sin cambiar de rama ni crear otras

## Objetivo
Corregir tres problemas visuales encontrados en la revisión de la shell nueva (planes 013 y 014, ya
mergeados en `main`), sin cambiar comportamiento.

## Contexto
Leer `PLAN.md` (sección "UI") antes de empezar. Stack: React 19 + TS estricto (`noUnusedLocals`) +
Tailwind 4 + shadcn en `src/components/ui`. UI en español, código en inglés.

1. **Los nodos del grafo se superponen.** `src/components/HierarchyGraph.tsx` calcula posiciones con
   `nodeWidth = 260` y `nodeHeight = 180`, pero `AgentNode.tsx` renderiza una `Card` de 220px de ancho que
   con los badges, estado, tarea actual (hasta 2 líneas) y dos filas de botones mide ~200-230px de alto.
   Resultado: la fila de implementadores tapa los botones "Ver salida"/"Chatear" del planificador.
2. **La pastilla flotante de actividad tapa la barra superior del proyecto.** `src/hooks/useActivityIsland.ts`
   muestra un `island.show({ id: "activity", … "N agentes trabajando" })` con `<Island position="top" />`
   (en `src/App.tsx`), que flota centrado arriba y se superpone a la carpeta del proyecto y, si la ventana es
   angosta, al toggle Chat/Jerarquía de `src/components/shell/ProjectScreen.tsx`. Esa información ya está en
   tres lugares (pie del sidebar "N trabajando", badge de la barra del proyecto y cards de Inicio).
3. **La cabecera de filtros de Comunicación queda apretada en el panel lateral.**
   `src/components/CommunicationPanel.tsx` muestra un `Select` de agente + 7 badges de tipo + botón
   Limpiar en una fila; dentro de los 380px de `src/components/shell/CommSidePanel.tsx` hace wrap en tres
   líneas desprolijas.

## Cambios
1. `src/components/HierarchyGraph.tsx`: `nodeWidth = 280`, `nodeHeight = 260` (separación vertical
   suficiente para la card más alta). Mantener el `fitView`.
2. `src/hooks/useActivityIsland.ts`: eliminar el hook y su uso en `src/App.tsx` (dejar montado `<Island />`
   porque `island.confirm` lo necesita para los diálogos de confirmación). Borrar el archivo del hook si
   no queda ningún otro uso. Si `island.show` con id "activity" se usa en otro lado (`grep -rn '"activity"' src`),
   quitarlo también.
3. `src/components/CommunicationPanel.tsx`: reemplazar la fila de badges de tipo por un `DropdownMenu`
   (`src/components/ui/dropdown-menu.tsx`, tiene `DropdownMenuCheckboxItem`) con título "Tipos" y un
   checkbox por `MessageKind` (etiquetas de `kindLabel` en `src/lib/labels.ts`), manteniendo el mismo estado
   `filterKinds`. La cabecera queda en una sola fila: `Select` de agente (flex-1), botón "Tipos" (con un
   contador "Tipos (5/7)" cuando no están todos marcados) y el botón Limpiar como icono (`Trash2`) con
   `title="Limpiar"`. Nada más cambia en el feed.

## Casos borde y decisiones ya tomadas
- No tocar `src/lib/*`, el store, el CLI, la página remota ni `src-tauri/*`.
- No agregar dependencias.
- Usar solo tokens de tema (`bg-card`, `text-muted-foreground`, …).

## Fuera de alcance
- Cualquier otro ajuste visual o funcional.

## Verificación
Desde la raíz del repo, todo tiene que pasar:
```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
```
Y `grep -rn "useActivityIsland" src` no debe devolver nada.
