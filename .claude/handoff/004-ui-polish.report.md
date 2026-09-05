## Qué se hizo
- Se agregó autoscroll condicional en `CommunicationPanel.tsx` (con un botón de "Ir al final" para scrollear manualmente si se desactiva el sticky-to-bottom al scrollear hacia arriba).
- Se creó `RunDetailDialog.tsx` para mostrar los detalles y la salida completa (incluyendo `rawLines`) de un `run` particular.
- Se enlazó la apertura del `RunDetailDialog` desde `AgentNode.tsx` (con un botón "Ver salida" para el último run) y desde `MessageItem.tsx` (botón con el icono `FileText` cuando el mensaje tiene asociado un `runId`).
- Se rediseñó el componente `PromptPanel.tsx` para mostrar una tarjeta flotante de "Tarea en curso" mientras una tarea de planificador se esté ejecutando, incluyendo tiempo transcurrido (actualizado al segundo), la ronda actual y contador de runs activos. También se muestra la última tarea si acaba de finalizar (y no hay tarea activa).
- Se actualizó el estado condicional "CLI: Cargando..." y "No detectado" en `AgentsPanel.tsx`, mostrando la configuración custom cuando aplica.
- Se reemplazó el `README.md` original por uno en español detallando los requisitos, modos de ejecución, cómo funciona el mecanismo de delegación, roles de agentes, y advertencias particulares (como la de `--add-dir` en Antigravity).

## Commits (hash y mensaje)
- `023d566`: feat: implement ui polish for auto-scroll, run detail dialog, and prompt panel
- `696cdeb`: feat: improve cli detection text and rewrite readme
- `9a5f064`: fix: remove unused StatusDot import

## Verificación (qué corriste y resultado)
Se corrieron los siguientes comandos para verificar la correctitud:
- `npx tsc --noEmit`: Falló inicialmente debido a una importación sin uso de `StatusDot` en `PromptPanel.tsx`. Luego de resolverlo, se volvió a ejecutar resultando exitoso (0 errores).
- `npm run build`: Ejecutado luego del `tsc`, terminó exitosamente (compilación en Vite y build para entorno del cliente).

## Decisiones tomadas
- Se reemplazó la dependencia inexistente de `date-fns` por la API de fechas nativa de JavaScript (`new Date(ts).toLocaleTimeString()`, `Math.floor(x/1000)`) para el formateo de tiempo y evitar agregar dependencias nuevas.
- En vez de un `ScrollArea` provisto por Radix para el `CommunicationPanel`, se optó por un simple `div` con `overflow-y-auto` que facilitara medir la posición real y atar un ref al final para el control del auto-scroll. 
- En el diseño de la tarjeta del `PromptPanel` para "Tarea en curso", se removió la lista anterior que iteraba por todos los agentes con sus `StatusDot` (que no formaba parte del requisito estricto en el plan y simplifica la UI del panel de prompt).

## Pendientes o dudas
- Ninguno. La implementación de la UI se ejecutó de punta a punta cubriendo la especificación de UX y se aseguró que funcione sin errores de tipado o empaquetado.
