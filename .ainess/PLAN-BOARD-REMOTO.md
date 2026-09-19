# Tableros remotos — diseño de la segunda tanda

La primera tanda dejó el seam: `src/lib/board/` con `BoardProvider`, el registro, el proveedor
local y el selector en `ProjectDialog`. Esto es lo que hay que resolver antes de escribir el
primer proveedor remoto, para no redescubrirlo.

## Estado

Hecho: los puntos 1 a 7 de abajo, y GitHub Projects entero — cliente, proveedor, `watch` por
polling, credencial en Configuración → Tableros y mapeo de columnas en el diálogo del proyecto.

Falta: **probarlo de punta a punta contra un tablero real** (nunca corrió contra la API viva: lo
que se verificó fue el esquema publicado, más el comportamiento de un scope faltante y la
validación de la consulta de items); después Trello, después Jira; y webhooks en lugar de polling.

## Lo que ya está decidido

- **Local-first, siempre.** El tablero local sigue siendo la copia de trabajo y el remoto se
  sincroniza contra él. El código es explícito en que el tablero es una vista del trabajo y nunca
  una traba (`task-sync.ts`): si el tablero pasara a depender de una API, se cae la red y el
  orquestador deja de delegar. Un proveedor remoto que no contesta deja el tablero desactualizado
  y nada más.
- **`boardProviderFor` nunca devuelve nada roto.** Un provider desconocido, no disponible o
  ausente cae al local. Eso ya está y hay test.

## Lo que falta decidir, con recomendación

### 1. `.ainess/BOARD.md` — lo más importante y fácil de pasar por alto

`writeProjectFolder` se mudó dentro de `local.ts`, así que hoy el archivo que **los agentes leen**
lo escribe el proveedor local. Con un proveedor remoto activo, ese archivo dejaría de escribirse y
los agentes se quedarían sin tablero en el prompt (ver `board-in-prompt.test.ts`).

**Recomendación:** sacar `writeProjectFolder` del proveedor y subirlo a `task-store.ts`, que corre
para cualquier proveedor. El `.md` es la proyección local del tablero, venga de donde venga.

### 2. Mapeo de las seis columnas

`backlog · working · needs-you · in-review · ready · done` (ver `TASK_STATUSES` en `lib/tasks.ts`).

- **GitHub Projects**: un campo de estado con opciones; se mapea uno a uno si el usuario crea las
  seis, o se pide un mapeo explícito en la config del proveedor.
- **Trello**: listas. Mismo problema, misma solución.
- **Jira**: estados de workflow, que el usuario no siempre puede crear. Acá el mapeo configurable
  no es opcional.

**Recomendación:** `BoardSource` crece con un `columns?: Record<TaskStatus, string>`. Sin mapeo,
el proveedor no se puede activar y la UI lo dice.

### 3. `dependsOn` — el grafo de dependencias

No existe en Trello ni en GitHub Projects. En Jira sí, como issue links.

**Recomendación:** el grafo se queda local y no viaja. Es información de orquestación, no de
colaboración, y degradarlo a texto en la descripción lo vuelve mentira en cuanto alguien edita la
tarjeta del otro lado. Documentarlo en la UI del selector.

### 4. `runId`, `approvalId`, `branch`

Internos de ainess. No significan nada para un colaborador humano.

**Recomendación:** no viajan. Se guardan en el espejo local, indexados por el id remoto de la
tarjeta. Eso obliga a un campo nuevo en `Task` — `external?: { provider, id, url? }` — que a
propósito NO se agregó en la primera tanda por no ser especulativo.

### 5. Volumen de escritura

Cada prompt al planner abre una tarjeta y **cada delegación abre otra**. Contra la API de Jira o
Trello eso es mucho tráfico y rate limits reales.

**Recomendación:** sólo las tarjetas raíz viajan. Las de delegación son detalle de ejecución de
ainess y un colaborador no las quiere en su tablero. Si se quisieran, que sea una opción y que
vayan como checklist de la tarjeta raíz, no como tarjetas sueltas.

### 6. "Updates instantáneas"

- **Polling** cada 10–30s: simple, no expone nada, anda detrás de cualquier firewall. Es el v1.
- **Webhooks**: la app ya tiene túnel (`src-tauri/src/tunnel.rs`) y servidor remoto
  (`src/lib/remote.ts`), así que es posible — pero implica endpoint público, secreto compartido y
  verificación de firma por proveedor.

**Recomendación:** polling en el v1, con el `watch?` del `BoardProvider` implementado como un
`setInterval` que llama a `load` y compara. Webhooks después, detrás de la misma interfaz, sin
tocar nada más.

### 7. Conflictos

Dos escritores sobre la misma tarjeta. El proveedor local ya resuelve esto contra el disco con
`updatedAt` más nuevo gana (`mergeWithDisk`).

**Recomendación:** la misma regla contra el remoto. Y que las columnas que mueve el orquestador
(`working`, `in-review`) ganen siempre del lado de ainess: es el que sabe si hay un proceso vivo.

## Orden sugerido

1. Sacar `writeProjectFolder` del proveedor (punto 1). Es un bug latente, va primero y solo.
2. `Task.external` y el mapeo de columnas en `BoardSource`.
3. GitHub Projects, que es el único con auth y cliente HTTP ya resueltos
   (`gh auth token` + `transport.httpGet`, ver `lib/quota.ts:228`).
4. `watch?` por polling.
5. Trello, después Jira.
