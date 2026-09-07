# El celular también ve la cuota y puede correr el diagnóstico

Repo: C:\Users\matia\Desktop\projects\ais-wt-remote (worktree, rama `feat/remote-quota-doctor`)
Rama: la que esté activa en ese worktree. **No cambiar de rama ni crear otras.** Las dependencias ya
están instaladas (`npm install` corrido). No tocar el repo principal (`.../projects/ais`) ni el otro
worktree (`ais-wt-orch`), donde hay otro implementador trabajando en paralelo.

## Objetivo

Dos huecos de la vista del celular, los dos anotados en `.claude/BACKLOG.md`:

1. **B-09** — La cuota que la app de escritorio muestra por agente no llega al celular.
2. **B-10** — El Diagnóstico del sistema es sólo de escritorio; desde el celular no hay forma de ver
   si algo está mal.

## Contexto

Leé `PLAN.md` antes de empezar (arquitectura y contratos). En particular las secciones **Acceso
remoto (celular)**, **Modelos y cuota** y **Diagnóstico del sistema**.

Cómo funciona hoy el acceso remoto:

- La página del celular es un build aparte de la misma app React (`src/remote/`, config
  `vite.remote.config.ts`). **No lee disco ni ejecuta nada**: hidrata el store con un snapshot que le
  manda la PC y le contesta con comandos.
- `src/lib/remote.ts` es la parte compartida y agnóstica del transporte:
  - `interface RemoteSnapshot` (`:16`) es el contrato de lo que viaja: `projects`, `agents`,
    `runtime`, `messages`, `approvals`, `runs`, `chats`, `chatMessages`, `binaries`, `activeChats`,
    `tasks`, más `serverTime` y `language`.
  - `snapshotWith(limits)` (`:76`) lo arma leyendo el store; `buildSnapshot()` (`:147`) lo achica a
    la mitad si pasa `MAX_SNAPSHOT_BYTES` (1 MB) — **un celular en 4G tiene que poder con esto**.
  - `handleRemoteCommand(action, payload)` (`:157`) es el switch de acciones: `prompt`, `instruct`,
    `stop`, `task`, `approve`, `chat`, `state`. Devuelve un objeto plano.
  - `schedulePush()` empuja un snapshot nuevo (con throttle de 300 ms) cada vez que cambia el store.
- `src/remote/RemoteApp.tsx` es la pantalla: cinco pestañas (`tasks`, `thread`, `chats`, `approvals`,
  `agents`, tipo `Tab` en `:34`), con `TabButton` abajo. `AgentsTab` (`:404`) dibuja una `Card` por
  agente con avatar, rol, estado y acciones.
- `src/remote/remote-client.ts` es el cliente: recibe snapshots y manda comandos.

Cuota, en la app de escritorio:

- El store guarda `quota: Partial<Record<ProviderId, ProviderQuota>>` (`src/store.ts:62`), que se
  llena con `refreshQuota` / `loadQuotaMarks` (`:1302`, `:1310`).
- `src/lib/quota-summary.ts` tiene `summarizeAgentQuota(quota, { model, allModels })`, **puro y sin
  store**, que devuelve `{ fraction, label, detail, details, status }`.
- `src/components/QuotaRing.tsx` es el anillo que ya dibuja eso en el escritorio.

Diagnóstico:

- `src/lib/diagnostics.ts`: `collectDiagnostics(t, opts?)` junta todo y devuelve `DiagnosticResult[]`;
  `runDiagnostics(input, t)` es la parte pura; `worstLevel(results)`, `formatDiagnosticsReport(...)`,
  `DiagnosticLevel = "ok" | "warn" | "error"`. **Los resultados ya vienen enmascarados** (rutas,
  tokens): eso lo resolvió el plan 037, no lo rehagas.
- Correr un diagnóstico toca disco y procesos: es caro y **no puede vivir en el snapshot**, que se
  reenvía con cada cambio del store.
- `src/components/settings/DiagnosticsSection.tsx` es la versión de escritorio: mirala para no
  inventar otro vocabulario visual ni otras claves de i18n.

## Cambios

### 1. B-09 — la cuota en el snapshot y en la pestaña Agentes

- Sumá a `RemoteSnapshot` un campo `quota` con lo que hoy tiene `useAppStore.getState().quota`.
  Es chico (un puñado de proveedores) y no crece con el uso, así que va derecho al snapshot.
  Documentalo con un comentario en la interfaz, como los otros campos.
- `snapshotWith` lo llena. Si algún día fuera grande, se recorta como el resto; hoy no hace falta.
- En `AgentsTab` de `RemoteApp.tsx`, cada tarjeta de agente muestra su cuota, usando
  `summarizeAgentQuota` (es pura: funciona igual en el celular) y las mismas claves de i18n que usa
  el escritorio.
- **Decidí vos entre el anillo y una línea de texto**, pero mirá primero `QuotaRing.tsx`: si se puede
  reusar tal cual, reusalo; si arrastra dependencias del escritorio, poné el `label` y el `detail` en
  texto. Anotá en el reporte qué elegiste y por qué.
- Un agente sin dato de cuota no muestra nada (ni un "—" suelto ni un espacio vacío que corra el
  layout): el celular es angosto y esa fila es cara.

### 2. B-10 — diagnóstico bajo demanda desde el celular

- Un comando remoto nuevo en `handleRemoteCommand`, por ejemplo `case "diagnostics"`, que corra
  `collectDiagnostics(...)` **en la PC** y devuelva `{ results }`. Nunca en el snapshot: se corre
  sólo cuando el usuario lo pide.
- El `t` que necesita `collectDiagnostics` tiene que ser el del idioma de la app; `snapshotWith` ya
  resuelve el idioma con `resolveLanguage(s.config.language)`, usá el mismo criterio.
- `refreshQuota` en las opciones: **no** por defecto. Refrescar cuota desde el celular dispara
  llamadas a los CLIs; que sea opcional vía `payload` y que la pantalla lo ofrezca como "volver a
  chequear".
- En `remote-client.ts`, la función que manda el comando y devuelve los resultados.
- En `RemoteApp.tsx`, una pantalla de diagnóstico. **No agregues una sexta pestaña abajo**: la barra
  ya tiene cinco y en un celular angosto no entra otra. Poné el acceso en la cabecera (un icono, el
  mismo `Stethoscope` que usa el escritorio) que abra una hoja/diálogo a pantalla completa.
- Esa pantalla: un botón para correr el chequeo, un estado de "corriendo", la lista de resultados con
  su nivel (ok / aviso / error) usando los mismos colores e iconos que el escritorio, y un resumen
  arriba con el peor nivel (`worstLevel`).
- **Si el chequeo nunca se corrió, la pantalla arranca vacía con su botón**, no corriendo solo: el
  usuario abrió una pantalla, no pidió trabajo.
- Un error del comando (la PC no contesta, el comando falla) se muestra como mensaje, no deja la
  pantalla colgada en "corriendo".

## Casos borde y decisiones ya tomadas

- **El snapshot no puede engordar de más.** La cuota entra porque es un objeto chico y acotado; el
  diagnóstico no entra nunca. Si al terminar el snapshot creció mucho, decilo en el reporte con el
  número.
- **El celular no ejecuta nada**: los dos cambios corren en la PC y viajan como datos.
- **Sin secretos nuevos en el cable**: los resultados de diagnóstico ya vienen enmascarados; no
  agregues campos que traigan rutas completas ni tokens. Si dudás de un campo, no lo mandes.
- **Un cliente viejo con un snapshot sin `quota` no puede romperse**: el campo se lee con un default.
- Toda clave de i18n nueva va en **los siete** diccionarios de `src/i18n/` (es, en, pt, zh, ja, fr,
  de), en la misma posición y traducida de verdad. Hay un test de paridad de claves que lo verifica.
  Reusá las claves que ya existen para diagnóstico y cuota en vez de duplicarlas.
- **Nada de dependencias nuevas.**
- **Si tocás la versión de la config, anotalo bien visible en el reporte**: hay otro implementador
  trabajando en paralelo en otra rama y los números se pisan.

## Fuera de alcance

- `src/lib/orchestrator.ts`, `src/lib/task-sync.ts`, `src/lib/task-store.ts` y `src/store.ts` más allá
  de lo mínimo para leer la cuota: **los está tocando el otro implementador**. Si creés que necesitás
  cambiar algo ahí, buscá otra forma y anotalo en el reporte.
- Preparar worktrees desde el celular (B-11 del backlog): eso necesita `readFileAbs` en el transporte
  remoto y es un plan aparte.
- El resto del backlog.

## Verificación

Desde la raíz del worktree (`C:\Users\matia\Desktop\projects\ais-wt-remote`):

```
npx tsc --noEmit
npm test
npm run build
npm run build:remote
npm run build:cli
cd src-tauri && cargo check
```

Tests obligatorios (vitest, junto a los que ya hay en `src/lib/__tests__/`). **Probá las funciones
reales, importándolas del módulo: no copies la lógica dentro del archivo de test.**

- El snapshot incluye la cuota que hay en el store, y sigue siendo válido (y del tamaño esperado)
  cuando el store no tiene ninguna.
- El comando de diagnóstico devuelve los resultados; una acción desconocida sigue devolviendo su
  error de siempre; un fallo adentro se traduce en un `error` y no en una excepción que se escape.
- Un snapshot sin el campo `quota` (cliente viejo) no rompe la pantalla.

Verificación en vivo: levantá el servidor remoto y abrí la página en el navegador, angostando la
ventana a tamaño celular. Si el puerto 1420 está ocupado usá otro y apagalo al terminar. Contá en el
reporte qué pudiste ver y qué no.

## Al terminar

Commits chicos y con mensaje descriptivo en inglés, en imperativo y explicando el *por qué*, con el
estilo de los que ya están en el log (`git log --oneline -10`). **No hagas `git push`.** Escribí el
reporte en `.claude/handoff/041-remoto-cuota-diagnostico.report.md`: qué cambiaste archivo por
archivo, la lista de commits, una tabla de verificación con el resultado **real** de cada comando (no
el que esperabas), las decisiones que tomaste donde el plan dejaba margen, y qué quedó pendiente o
dudoso. Si algo no pasa, decilo con la salida del error.
