# Centro de notificaciones con campanita en la barra de ventana

Repo: C:\Users\matia\Desktop\projects\ais-wt-notif (worktree, rama `feat/notifications`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

Un ícono de campanita en la barra de ventana, a la izquierda del botón de acceso remoto, con un
contador de cosas sin leer. Al tocarlo se abre un panel flotante con todo lo que pasó y, sobre todo,
con lo que necesita la atención del usuario: aprobaciones esperando, tareas que terminaron o
fallaron, corridas interrumpidas, el túnel que se cayó, una actualización disponible.

## Contexto

Leé `PLAN.md` antes de empezar.

- La barra está en `src/components/shell/TitleBar.tsx`. A la derecha ya viven `RemoteButton` y los
  controles de ventana; la campanita va antes del botón remoto.
- Los toasts efímeros ya existen (`src/components/ui/toast.tsx`) y los usa medio proyecto: **no** los
  reemplaces. Esto es el historial persistente de lo que pasó, no el aviso del momento.
- Notificaciones del sistema: `src/hooks/useSystemNotifications.ts` ya avisa por el sistema
  operativo cuando hay una aprobación o termina una tarea, según `config.tray`. Ese hook es el mejor
  lugar para ver qué eventos ya se detectan y con qué condiciones; el centro nuevo tiene que
  alimentarse de los mismos hechos, sin duplicar la lógica de detección si podés reusarla.
- `src/components/ui/popover.tsx` ya está en el proyecto.
- El store (`src/store.ts`) tiene `approvals`, `runs`, `runtime`, `tunnelStatus`, `remoteStatus`.
- `src/lib/logger.ts` no sirve para esto: es el log a archivo.

## Cambios

### 1. Modelo (`src/types.ts`)

```ts
export type NotificationKind =
  | "approval"      // una delegación espera tu visto bueno
  | "task-done"     // una tarea terminó
  | "task-failed"   // una tarea falló
  | "interrupted"   // una corrida quedó cortada al cerrar la app
  | "tunnel"        // el túnel se cayó o cambió de estado
  | "update"        // hay una versión nueva
  | "info";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  /** Una línea de detalle; sin markdown. */
  body?: string;
  ts: number;
  read: boolean;
  /** Para poder llevar al usuario a donde pasó. */
  projectId?: string;
  agentId?: string;
  runId?: string;
  approvalId?: string;
}
```

### 2. Store

- Estado `notifications: AppNotification[]` (en memoria, tope 200, las más nuevas primero) y
  `notificationsOpen: boolean`.
- Acciones: `notify(n: Omit<AppNotification, "id" | "ts" | "read">)`, `markNotificationsRead()`,
  `markNotificationRead(id)`, `dismissNotification(id)`, `clearNotifications()`,
  `toggleNotifications(open?)`.
- `notify` **deduplica**: si ya hay una sin leer con el mismo `kind` y el mismo
  `approvalId`/`runId`, actualiza esa en vez de agregar otra.
- No se persisten en disco: son de la sesión. (Las aprobaciones pendientes ya se persisten aparte.)

### 3. Quién crea notificaciones

Elegí el punto más cercano al hecho, sin duplicar:

- Aprobación pedida: donde hoy se crea la aprobación (`src/lib/orchestrator.ts`, cerca del
  `emitHookEvent("approval.requested", …)`).
- Tarea terminada o fallada: en `handleExit` del orquestador, en las mismas ramas donde ya se emiten
  los hooks `task.finished` / `task.failed`.
- Corrida interrumpida: en `src/lib/history.ts`, donde las corridas que quedaron `running` en disco
  pasan a `killed` al arrancar.
- Túnel caído: en `refreshTunnelStatus` del store, cuando pasa de corriendo a "Se cayó el túnel".
- Actualización disponible: en `src/hooks/useUpdateCheck.ts`, cuando el chequeo encuentra versión
  nueva.

Los textos van en español, cortos, con el nombre del agente y del proyecto cuando aplican
("Claude terminó en uiness", "El Implementador falló en Valoranchi").

### 4. La campanita (`src/components/shell/NotificationBell.tsx`, nuevo)

- Botón fantasma con `Bell` de lucide, del mismo tamaño que los otros de la barra (`h-7 w-7`).
- Si hay sin leer, un puntito o un badge chico con el número (hasta "9+"). Sin nada sin leer, el
  ícono va en `text-muted-foreground` y sin badge.
- Al abrir, un `Popover` alineado a la derecha, ancho ~360 px y alto máximo ~70vh con scroll:
  - Encabezado: "Notificaciones" + "Marcar todas como leídas" (deshabilitado si no hay) y un botón
    para vaciar.
  - Lista: ícono según `kind` (con color: ámbar para `approval`, verde para `task-done`, rojo para
    `task-failed`, gris para el resto), título, el detalle en una línea con `truncate`, y la hora
    relativa (hay helpers en `src/lib/format.ts`, revisá antes de escribir otro).
  - Cada fila es clickeable cuando lleva a algún lado: una aprobación abre su proyecto, una tarea
    abre el proyecto y, si hay `runId`, su detalle (`RunDetailDialog` ya existe). Al hacer click, se
    marca leída y se cierra el panel.
  - Estado vacío: usá `EmptyState` (`src/components/ui/empty-state.tsx`) con un texto tranquilo.
- Abrir el panel **no** marca todo como leído: eso lo hace el botón.

### 5. Detalles

- El panel tiene que quedar por debajo de la barra de ventana, que va siempre arriba de todo
  (`--titlebar-h`, ver `src/index.css` y `TitleBar.tsx`).
- Nada de sonidos.
- No agregues dependencias nuevas.
- Código en inglés, UI en español.

## Casos borde y decisiones ya tomadas

- Una aprobación que el usuario resuelve (aprueba o rechaza) marca su notificación como leída.
- Si llegan muchas en ráfaga, la lista se corta en 200 y las viejas se caen; no hay paginación.
- La campanita se muestra siempre, con o sin proyecto abierto.
- No dupliques la notificación del sistema operativo: ese hook sigue como está.

## Fuera de alcance

- La vista remota (`src/remote/**`).
- Persistir el historial de notificaciones en disco.
- Nada de push: solo commits locales.

## Verificación

```
npx tsc --noEmit
npm test
npm run build
```

Sumá tests de la lógica pura que escribas (por ejemplo la deduplicación y el recorte a 200) en
`src/lib/__tests__/`. Si para eso te conviene sacar esa lógica a `src/lib/notifications.ts`, hacelo.
