# Tablero: búsqueda, prioridad, archivado automático, tarea desde un mensaje y exportar

Repo: C:\Users\matia\Desktop\projects\ais-wt-board (worktree, rama `feat/board`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

Cinco mejoras sobre el tablero de tareas, que hoy sirve para mirar pero se queda corto para trabajar
con muchas tarjetas.

## Contexto

Leé `PLAN.md` antes de empezar, y `src/lib/tasks.ts`, `src/lib/task-store.ts`,
`src/components/tasks/*` y `src/lib/task-sync.ts` para saber cómo funciona hoy.

Los textos nuevos van al diccionario en los **siete** idiomas (`src/i18n/*.ts`), con las mismas
claves y en el mismo orden. Mirá cómo está hecho antes de agregar.

## Cambios

### 1. Buscar y filtrar en el tablero

Una barra sobre las columnas con:

- Un campo de búsqueda que filtra por texto en el título y en el detalle (sin acentos y sin
  mayúsculas, hay un ejemplo de normalización en `src/components/settings/SettingsDialog.tsx`).
- Un select de agente ("Todos" por defecto).
- Un botón para limpiar, visible solo cuando hay algo filtrado.

El filtro se aplica también al grafo, para que las dos vistas cuenten lo mismo, y el contador de cada
columna pasa a mostrar cuántas se ven de cuántas hay cuando hay filtro (`3 / 12`).

### 2. Prioridad

`Task` suma `priority?: "low" | "normal" | "high"` (sin valor = normal).

- En la tarjeta: las de prioridad alta llevan una marca clara a la izquierda del título (una barra o
  un ícono, no un color de fondo que tape el estado). Las bajas, nada especial.
- En el detalle y en el menú contextual: cambiar la prioridad.
- Dentro de cada columna, las altas van primero; entre iguales manda el `order` de siempre. Eso va en
  `sortColumn` de `src/lib/tasks.ts`, con test.

### 3. Archivado automático

Una opción en Configuración → General: "Archivar solas las tareas hechas después de N días"
(`config.autoArchiveDoneDays: number | null`, null = nunca, valor por defecto null). Migración de
versión como corresponde, sin perder nada.

La barrida corre al cargar el tablero de un proyecto y una vez por hora mientras la app está
abierta: cualquier tarea en `done` cuya `updatedAt` sea más vieja que N días pasa a `archived: true`.
La lógica va en `src/lib/tasks.ts` como función pura (`tasksToAutoArchive(tasks, days, now)`), con
test.

### 4. Crear una tarea desde un mensaje

En el menú contextual de un mensaje del hilo y del chat (ya existe, mirá
`src/components/menu-actions.tsx` y cómo lo usan `OrchestratorThread` y `ChatThread`), sumá "Crear
tarea con esto":

- El título es la primera línea del mensaje, recortada a 80 caracteres.
- El detalle es el mensaje completo.
- Si el mensaje es de un agente, la tarea nace asignada a ese agente; si es del usuario, sin agente.
- Nace en `backlog` y se avisa con un toast que ofrezca ir al tablero.

### 5. Exportar el tablero

Un botón en la barra del tablero, "Copiar como markdown", que arma una lista por columna:

```markdown
## Trabajando
- [ ] Migrar la configuración (Implementador) — ainess/implementador
- [ ] Revisar el diff — bloqueada por: Migrar la configuración

## Hecho
- [x] Escribir el changelog
```

Las hechas van con `[x]`, el resto con `[ ]`. Se copia con el helper `copyText` de
`src/lib/clipboard.ts`. La función que arma el markdown es pura y va testeada.

## Casos borde y decisiones ya tomadas

- El filtro es de vista: no se persiste ni viaja al celular.
- Archivar automáticamente nunca borra nada: solo marca `archived`, que ya se puede deshacer.
- Una tarea creada desde un mensaje guarda `runId` si el mensaje tiene uno, así el detalle puede
  llevar a la corrida.
- No agregues dependencias nuevas.
- Código en inglés, UI traducida a los siete idiomas.

## Fuera de alcance

- La vista del celular (`src/remote/**`): que siga como está.
- Fechas de entrega o recordatorios.
- Nada de push: solo commits locales.

## Verificación

```
npx tsc --noEmit
npm test
npm run build
```

Tests obligatorios: orden por prioridad en `sortColumn`, `tasksToAutoArchive` (justo en el límite y
con tareas de otros estados), el markdown del tablero, y la paridad de claves entre los siete
diccionarios.
