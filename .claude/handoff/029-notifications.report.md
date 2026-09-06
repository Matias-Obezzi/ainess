# Informe — 029 Centro de notificaciones con campanita

Rama: `feat/notifications` (worktree `C:\Users\matia\Desktop\projects\ais-wt-notif`). Sin push.

## Qué se hizo

**Modelo (`src/types.ts`)** — se agregaron `NotificationKind` y `AppNotification` tal cual el plan.

**Lógica pura (`src/lib/notifications.ts`, nuevo)** — todo lo que decide qué entra en la lista, para
poder testearlo aparte del store: `pushNotification` (dedup + tope), `unreadCount`, `unreadBadge`
(hasta "9+"), `markAllRead`, `markRead`, `markApprovalRead`, `dismissNotification` y
`MAX_NOTIFICATIONS = 200`. La deduplicación arma una clave `kind:approvalId ?? runId`: si ya hay una
**sin leer** con esa clave, se refresca (título, detalle y hora) y sube al tope en vez de sumar otra.
Las que no tienen a qué agarrarse (túnel, actualización) nunca deduplican.

**Store (`src/store.ts`)** — `notifications: AppNotification[]` y `notificationsOpen: boolean`, en
memoria y nunca en disco, más las acciones `notify`, `markNotificationsRead`,
`markNotificationRead`, `markApprovalNotificationsRead`, `dismissNotification`,
`clearNotifications` y `toggleNotifications`.

**Quién notifica** — cada uno en el punto más cercano al hecho, sin duplicar la detección:

| Hecho | Dónde |
| --- | --- |
| Aprobación pedida | `requestApproval` (`src/lib/orchestrator.ts`), junto al `emitHookEvent("approval.requested", …)` |
| Aprobación resuelta | `settleApproval` marca leída la notificación de esa aprobación |
| Tarea terminada / fallada | las mismas ramas que emiten `task.finished` / `task.failed`, en `onRunFinished` y en `maybeContinueParent` |
| Corrida interrumpida | `mergeFromDisk` (`src/lib/history.ts`), donde las `running` de un proceso muerto pasan a `killed` |
| Túnel caído | `refreshTunnelStatus` del store, en la transición de corriendo a caído |
| Actualización disponible | `src/hooks/useUpdateCheck.ts`, cuando el chequeo encuentra versión nueva |

Textos en español y cortos, con el nombre del agente y del proyecto: "Claude terminó en uiness",
"El Implementador falló en Valoranchi", "Claude pide tu permiso en uiness", "Claude quedó a medias
en uiness", "Se cayó el túnel", "ainess 0.2.0 disponible".

**Campanita (`src/components/shell/NotificationBell.tsx`, nuevo)** — botón fantasma `h-7 w-7` con
`Bell`, montado en `TitleBar.tsx` a la izquierda del botón remoto y visible siempre. Sin nada sin
leer va en `text-muted-foreground` y sin badge; con algo, un badge chico con el número hasta "9+".
El `Popover` va alineado a la derecha, 360 px de ancho, lista con scroll propio a `max-h-[70vh]`,
encabezado "Notificaciones" con "Marcar todas como leídas" y "Vaciar" (deshabilitados cuando no
aplican), ícono por `kind` (ámbar aprobación, verde terminada, rojo fallada, gris el resto), hora
relativa con `formatTimeAgo` y el detalle en una línea con `truncate`. Abrir el panel no marca nada
como leído. Cada fila que lleva a algún lado es un botón: marca leída, cierra el panel, abre el
proyecto y, si hay `runId`, el `RunDetailDialog`. Vacío: `EmptyState` con "Todo tranquilo".

**`PLAN.md`** — se documentó el centro de notificaciones dentro de "Bandeja y notificaciones", ya
que el plan del repo es la fuente de verdad de los contratos.

No se tocaron los toasts, `useSystemNotifications` ni `src/remote/**`. No se agregaron dependencias.

## Commits

- `cf0f13a` Add a notification center behind a bell in the window bar
- `2e037ae` Scroll the notification list itself and keep it clear of the bar

## Verificación

Todo desde la raíz del worktree:

- `npx tsc --noEmit` — sin errores.
- `npm test` — 13 archivos, 128 tests. Los 10 nuevos están en
  `src/lib/__tests__/notifications.test.ts` (orden, dedup por aprobación y por run, kinds distintos
  no se mezclan, una ya leída no se pisa, sin clave nunca deduplica, tope de 200 tirando las viejas,
  contador/badge y las tres formas de marcar leído).
- `npm run build` — ok (app + build remoto).

Además se levantó el dev server **del worktree** en el puerto 1425 y se probó la campanita en el
navegador: badge, panel abierto bajo la barra, seis notificaciones de distinto `kind` con sus
colores y horas, truncado del detalle, scroll con 36 entradas, "Marcar todas como leídas" (que deja
el panel abierto y baja el contador a cero) y el click en una fila (marca leída, cierra el panel y
abre el `RunDetailDialog`). Ahí salieron y se arreglaron dos cosas: el `ScrollArea` de radix nunca
recibía una altura definida dentro del popover y la lista crecía fuera del panel en vez de scrollear
(se cambió por un contenedor con `max-h` y `overflow-y-auto`, que es lo que usa el resto de la app),
y el panel arrancaba 2 px por debajo del borde de la barra, así que se le puso `sideOffset={10}`.
El server se apagó al terminar.

## Decisiones tomadas

- **Corridas detenidas por el usuario no notifican.** El plan pide notificar en las ramas de
  `task.finished` / `task.failed`, pero ahí también caen las que el usuario paró a mano (`killed` en
  `onRunFinished`, `cancelled` en `maybeContinueParent`). Avisarle de algo que acaba de hacer él es
  ruido, así que esas se saltean. Los hooks siguen emitiéndose igual que antes.
- **Dedup sólo con `approvalId` o `runId`**, tal cual el plan. Túnel y actualización no tienen clave
  y por lo tanto nunca se fusionan; no es un problema porque cada uno sólo dispara en la transición
  (el túnel cuando pasa de corriendo a caído, la actualización una vez por arranque).
- **Interrumpidas: una notificación por corrida si es una sola, una sola línea con el total si son
  varias.** Así una app que se cerró con seis agentes trabajando no llena la lista, y el caso normal
  (una) igual conserva `runId` para poder abrir su detalle.
- **La marca de leído al resolver una aprobación va en `settleApproval`** y no en las acciones del
  store, para que valga también cuando la decisión viene del CLI o del celular.
- **Se agregó `markApprovalNotificationsRead` al store**, que el plan no listaba: hacía falta para el
  caso borde de la aprobación resuelta sin exponer la lista completa al orquestador.
- **Se actualizó `PLAN.md`.** El plan del handoff no lo pedía, pero `CLAUDE.md` dice que `PLAN.md` es
  la fuente de verdad de los contratos y esto agrega tipos y acciones del store.

## Pendientes o dudas

- Nada bloqueante. Falta `git push` (queda del lado de Claude, según `CLAUDE.md`).
- La verificación visual se hizo en el navegador (`vite`), no dentro de Tauri: el z-index de la barra
  (60) contra el del popover (50) se comporta igual en los dos, pero la app real todavía no se abrió
  con esto puesto.
- El historial es de la sesión, como pide el plan: al reiniciar la app la campanita arranca vacía y
  las aprobaciones pendientes se vuelven a anunciar recién cuando algo las toque. Si alguna vez se
  quiere que sobrevivan, hay que persistirlas (fuera de alcance acá).
