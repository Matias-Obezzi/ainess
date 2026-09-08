# Revisión de ainess — plan de trabajo vivo

Este archivo es el tablero de la revisión completa de la app: qué está roto, qué es inconsistente,
qué le falta a la comunicación entre agentes y entre la app y sus agentes, y qué features valen la
pena. Lo mantiene Claude (el planificador): cada vez que algo se termina y se commitea, el ítem se
marca acá y queda el hash al lado.

**Cómo leerlo**: cada ítem tiene un id (`A1`, `C2`…), qué pasa, dónde pasa y qué se propone hacer.
La casilla dice en qué anda.

- `[ ]` pendiente
- `[~]` en curso (hay un implementador trabajándolo)
- `[x]` hecho y commiteado — el título del commit está al lado
- `[-]` descartado, con el motivo

**Cómo usarlo**: marcá, tachá o comentá lo que quieras. Lo que taches se saca; lo que agregues, se
agrega. La bitácora del final cuenta qué pasó cada noche.

---

## A. Bugs

### `[x]` A1 · Una delegación a un agente que no existe cuelga la tarea para siempre — *«A name that lands on nobody»*

**Qué pasa.** El planificador delega y escribe mal el nombre del agente (o nombra a uno que no está
bajo su mando). La app avisa del error en el feed, pero el planificador ya quedó marcado como
"esperando a sus hijos" — y no hay ningún hijo. Nadie va a llamar a la continuación: el agente se
queda en *esperando* para siempre y su tarjeta en *en curso*. La única salida es reiniciar la app.

**Dónde.** `src/lib/orchestrator.ts`, en `onRunFinished`: `waitingForChildren = true` se pone antes
de resolver los nombres, y el `else` del `if (childAgent)` sólo escribe un mensaje de error.

**Propuesta.** Contar las delegaciones que efectivamente arrancaron (o quedaron esperando
aprobación). Si son cero, no se espera a nadie: se le devuelve el error al planificador como una
ronda más, diciéndole qué nombres no existen y cuáles son los válidos, para que corrija. Si ya no
quedan rondas, la tarea se cierra en *necesita tu atención* con el motivo.

### `[x]` A2 · Una corrida que no puede ni arrancar deja la tarjeta en "en curso" — *«A name that lands on nobody»*

**Qué pasa.** Si al agente le falta el CLI, `startRun` marca la corrida como error y avisa, pero ese
camino no pasa por el cierre normal de corridas, así que el tablero nunca se entera: la tarjeta se
queda en *en curso* hasta que el próximo arranque de la app la reconcilie.

**Dónde.** `src/lib/orchestrator.ts`, rama `if (!binary || !binary.path)` de `startRun`.

**Propuesta.** Cerrar la tarjeta ahí mismo, con el mismo camino que usa una corrida que termina mal.

### `[x]` A3 · El tope de rondas termina la tarea sin decir nada útil — *«A name that lands on nobody»*

**Qué pasa.** Cuando se alcanza `maxRounds`, el feed recibe "Se alcanzó el máximo de rondas" y ahí
muere: no hay notificación, la tarjeta raíz se cierra como si hubiera salido bien y el usuario se
entera sólo si estaba mirando.

**Dónde.** `src/lib/orchestrator.ts`, `maybeContinueParent`.

**Propuesta.** Cerrar la tarea en *necesita tu atención*, notificar como se notifica un fallo, y
dejar en el detalle en qué ronda quedó y qué estaba haciendo.

### `[ ]` A4 · Una tarjeta que quedó apuntando a una corrida muerta no se recupera

**Qué pasa.** La reconciliación de arranque sólo corrige tarjetas en *en curso*. Una que quedó en
*en revisión* apuntando a una corrida que ya no está (historial recortado, app cerrada a mitad)
queda ahí sin que nada la mueva.

**Dónde.** `src/lib/task-reconcile.ts`, `boardFixes`.

**Propuesta.** Extender la reconciliación a *en revisión*: si la corrida que la tarjeta señala no
existe o terminó, se resuelve como corresponde en vez de dejarla colgada.

---

## B. Inconsistencias

### `[x]` B1 · Media app habla siete idiomas y la otra media siempre habla español — *«Half the app answered in Spanish no matter what you set»*

**Qué pasa.** La interfaz está traducida a siete idiomas, pero un montón de texto que el usuario
lee sale del código en español fijo: "Delegación fallida…", "Aprobado:", "Rechazado:", "Se alcanzó
el máximo de rondas", "[detenido por el usuario]", "[interrumpido: la aplicación se cerró…]", los
errores de la API remota ("Proyecto inválido", "Token inválido"), el límite anti-loop de los hooks,
los mensajes de instalación de CLIs y de ngrok. En una ventana en inglés esto aparece en español.

**Dónde.** `src/lib/orchestrator.ts`, `src/lib/history.ts`, `src/lib/hooks.ts`, `src/lib/remote.ts`,
`src/lib/remote-node.ts`, `src/lib/install-agents.ts`, `src/lib/ngrok-account.ts`.

**Propuesta.** Pasarlos todos por `translateNow` con claves nuevas en los siete diccionarios.

### `[x]` B2 · Un agente en un chat es un agente distinto al mismo agente en una tarea — *«The same agent, whichever door you come in by»*

**Qué pasa.** El prompt de sistema de los chats se arma en otro lado y con otras reglas: en español
fijo, sin el bloque `ask` (o sea que en un chat el agente no puede pedirte una decisión), con las
skills pegadas enteras en el prompt en vez de como archivos del repo, y sin nada del proyecto. Es
una copia divergida del constructor real.

**Dónde.** `buildChatSystemPrompt` en `src/lib/chat.ts` contra `buildSystemPrompt` en
`src/lib/providers.ts`.

**Propuesta.** Que el chat use el constructor de siempre con un modo "chat" (sin tablero ni
delegación, con `ask`), y que lo propio del chat sea sólo la lista de participantes.

### `[ ]` B3 · Quedan diálogos con los colores puestos a mano

**Qué pasa.** El de hooks ya se arregló, pero conviene barrer el resto en busca de `bg-[#…]` y
`text-gray-…`, que ignoran el tema y se vuelven ilegibles en claro.

**Dónde.** `src/components/*.tsx`.

**Propuesta.** Barrido y reemplazo por los tokens del tema.

### `[ ]` B4 · El CLI `ais` no conoce las reglas nuevas

**Qué pasa.** El CLI arranca corridas por su cuenta; hay que revisar si respeta el gate de
aprobación por agente y el flujo de revisión que se agregaron, o si son sólo de la app.

**Dónde.** `src/cli/main.ts`.

**Propuesta.** Auditarlo y alinearlo.

---

## C. Comunicación entre agentes

### `[ ]` C1 · Un hijo no puede decir nada hasta que termina

**Qué pasa.** El único canal del implementador hacia su planificador es el resultado final de la
corrida. Si se bloquea a los dos minutos, el planificador se entera veinte minutos después.

**Propuesta.** Un bloque `note` que el agente puede emitir y que llega al feed y al planificador
sin cerrar la corrida, para "esto está bloqueado por X" o "voy por acá".

### `[ ]` C2 · Los hermanos no se ven entre sí

**Qué pasa.** Dos implementadores trabajando la misma tarea no saben el uno del otro: pueden tocar
los mismos archivos y pisarse. El planificador tampoco les dice qué le pidió al otro.

**Propuesta.** En el prompt de cada hijo, una sección corta con qué está haciendo cada compañero
ahora mismo (nombre, tarea en una línea) y la advertencia de no tocar lo que el otro tiene en la
mano.

### `[ ]` C3 · Todo pasa por el planificador, siempre

**Qué pasa.** No hay handoff entre hermanos: si el implementador A necesita algo de B, tiene que
terminar, contarle al planificador y esperar otra ronda.

**Propuesta.** Un bloque `handoff` que el planificador pueda autorizar en el prompt, o dejarlo
explícitamente fuera y documentarlo.

### `[ ]` C4 · El resultado del hijo es un texto suelto

**Qué pasa.** El planificador recibe prosa: sin archivos tocados, sin qué se verificó, sin qué
quedó bloqueado. Cada implementador lo cuenta como quiere y el planificador tiene que adivinar.

**Propuesta.** Pedirle al implementador un bloque `result` con `files`, `verified`, `blocked`, que
la app renderiza como tarjeta en el hilo y le pasa al planificador ya ordenado.

### `[ ]` C5 · Preguntar es siempre preguntarle al usuario

**Qué pasa.** El bloque `ask` de un hijo despierta al usuario aunque la respuesta la tuviera el
planificador.

**Propuesta.** Un destinatario en el `ask`: al planificador (que contesta en la ronda siguiente) o
al usuario.

---

## D. Comunicación entre la app y los agentes

### `[ ]` D1 · El tablero es de una sola vía para los hijos

**Qué pasa.** El planificador ve el tablero y puede mover una tarjeta nombrándola en la delegación;
el implementador no ve ni la suya. No puede marcar avance, ni pedir revisión, ni dividirla.

**Propuesta.** Un bloque `task` para que el agente actualice su propia tarjeta (estado y detalle),
y que su tarjeta viaje en su prompt.

### `[ ]` D2 · Un agente no puede crear trabajo

**Qué pasa.** Si un implementador encuentra algo que hay que hacer y no le corresponde, lo escribe
en la prosa y se pierde. No hay forma de que abra una tarjeta en el backlog.

**Propuesta.** Que el mismo bloque `task` pueda crear una tarjeta nueva en el backlog, atribuida a
quien la propuso.

### `[ ]` D3 · `.ainess/` sólo se escribe desde la app

**Qué pasa.** La carpeta es el punto de encuentro con los agentes, pero hoy es un boletín: la app
publica `BOARD.md` y `AGENTS.md` y nadie contesta.

**Propuesta.** Que la app lea un `.ainess/INBOX.md` (o el comando `ais` equivalente) donde un agente
deja pedidos para la app: crear tarjeta, avisar algo, pedir una revisión.

### `[ ]` D4 · Los hooks no ven la mitad de lo que pasa

**Qué pasa.** Hay eventos para corridas, tareas, delegaciones y aprobaciones, pero no para "un
agente preguntó", "una revisión pidió cambios" o "un agente se quedó sin cuota".

**Propuesta.** Sumar esos eventos con sus variables.

---

## E. Features

### `[ ]` E1 · El diff de una tarea, no sólo el del proyecto

El panel nuevo muestra el árbol de trabajo entero. Falta poder ver qué tocó *esta* tarea, o *este*
agente en su worktree: el diff acotado a lo que hizo una corrida.

### `[ ]` E2 · Reintentar una tarea con otro modelo, de un click

Ya se reintenta una corrida interrumpida. Falta el caso real de todos los días: salió mal o se
quedó sin cuota, y querés la misma tarea en otro modelo o en otro agente sin volver a escribirla.

### `[ ]` E3 · Exportar una tarea a markdown

Prompt, delegaciones, resultados, hallazgos de la revisión y diff, en un archivo para pegar en un
PR o pasarle a alguien.

### `[ ]` E4 · Encadenar órdenes

Las órdenes guardadas son de a una. Encadenarlas ("planificá → implementá → revisá → PR") las
convierte en recetas de verdad.

### `[ ]` E5 · Buscar dentro de la conversación

La paleta busca proyectos, tareas, chats y agentes, pero no lo que se dijo. Lo que buscás a las dos
semanas es una frase.

### `[ ]` E6 · Abrir el PR al terminar

Con `gh` ya instalado y la rama del worktree lista, el paso que falta es el que hacés a mano.

---

## Bitácora

### Noche del 8 al 9 de septiembre de 2026

- Revisión completa escrita y commiteada. El trabajo arranca por los bugs (A) y sigue por las
  inconsistencias (B); lo de comunicación (C/D) va después porque cambia el protocolo, y las
  features (E) quedan para cuando vos elijas cuáles.
