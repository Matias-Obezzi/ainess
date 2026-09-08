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

### `[x]` A4 · Una tarjeta que quedó apuntando a una corrida muerta no se recupera — *«Nobody comes back for the card in review»*

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

### `[-]` B3 · Quedan diálogos con los colores puestos a mano — descartado: no quedaba ninguno

**Qué pasa.** El de hooks ya se arregló, pero conviene barrer el resto en busca de `bg-[#…]` y
`text-gray-…`, que ignoran el tema y se vuelven ilegibles en claro.

**Dónde.** `src/components/*.tsx`.

**Propuesta.** Barrido y reemplazo por los tokens del tema.

**Resultado.** El barrido se hizo y no encontró nada real: con el diálogo de hooks arreglado, lo que
queda es color a propósito y se queda como está — el fondo blanco atrás del QR (que un QR necesita
en los dos temas), el ámbar con texto negro de los badges de aviso, el gris del punto de estado
«libre», y los verdes y rojos del diff, que ya vienen en pareja clara/oscura. De paso: los cuatro
reemplazos que se habían intentado (`text-white` → `text-destructive-foreground` en botones, badges
y el botón de cerrar la ventana, y el velo del modal a `bg-background/80`) estaban mal y se
revirtieron: este proyecto no define el token `--destructive-foreground`, así que el texto blanco
sobre el rojo se habría vuelto texto oscuro sobre rojo.

### `[x]` B4 · El CLI `ais` no conoce las reglas nuevas — auditado: *«The CLI was reading the feed in Spanish»*

**Qué pasa.** El CLI arranca corridas por su cuenta; hay que revisar si respeta el gate de
aprobación por agente y el flujo de revisión que se agregaron, o si son sólo de la app.

**Dónde.** `src/cli/main.ts`.

**Propuesta.** Auditarlo y alinearlo.

**Resultado de la auditoría.** La premisa era casi toda falsa: `ais run` entra por `submitPrompt`,
o sea por el mismo orquestador que la app, así que ya respeta el gate de aprobación por agente, el
ajuste general, el flujo de revisión y todo lo que se arregló estos días. Sale con código 3 cuando
una delegación queda esperando tu visto bueno, que es lo correcto.

Pero encontró un bug real, y era mío: para decidir si `ais run` termina con código 1, el CLI
buscaba en el feed un mensaje que contuviera el texto «No se encontró el CLI» — un literal en
español que dejó de existir cuando esos mensajes pasaron a los diccionarios (B1). En una máquina
en inglés, una tarea que fallaba porque faltaba un CLI salía con código 0: verde en el script que
la llamó. Ahora se mira lo que importa, que es si alguna corrida de esa tarea terminó en error,
sin importar en qué idioma se lo contó.

**Lo que queda como decisión tuya.** La ayuda y los mensajes propios del CLI (unas 90 líneas de
`console.log`) están en español fijo, aunque el CLI ya resuelve idioma con `nodeI18n` y lo usa para
el `doctor`. Traducirlo todo son 90 claves × 7 idiomas: mucho trabajo para el valor que tiene, así
que no lo hice por mi cuenta. Decime si querés el CLI en siete idiomas o si se queda en español a
propósito.

---

## C. Comunicación entre agentes

### `[ ]` C1 · Un hijo no puede decir nada hasta que termina

**Qué pasa.** El único canal del implementador hacia su planificador es el resultado final de la
corrida. Si se bloquea a los dos minutos, el planificador se entera veinte minutos después.

**Propuesta.** Un bloque `note` que el agente puede emitir y que llega al feed y al planificador
sin cerrar la corrida, para "esto está bloqueado por X" o "voy por acá".

### `[x]` C2 · Los hermanos no se ven entre sí — *«Two hands on the same file»*

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

## F. Del uso diario (9 de septiembre)

Lo que apareció usando la app, no leyendo el código.

### `[x]` F1 · El panel de notificaciones se abre mostrando un tooltip solo — *«The panel opened with its own tooltip showing»*

**Qué pasaba.** Abrías la campana y aparecía solo, sin pasar el mouse, el globito de «marcar todo
como leído» — o el de vaciar, cuando no había nada sin leer. El popover de Radix mueve el foco
adentro al abrirse, cae en el primer botón de ícono, y el tooltip se muestra con foco además de con
hover. Ya no se autoenfoca; con Tab se sigue recorriendo igual.

### `[x]` F2 · La ventana se siente pesada al escribir y al moverla — *«A feed is read from the bottom»*

**Primera causa, arreglada.** Cada tecla escribía TODOS los borradores en disco: `setDraft` hacía
un `JSON.stringify` completo y un `localStorage.setItem` sincrónico por pulsación, bloqueando el
hilo principal. Ahora el estado en memoria sigue siendo inmediato y el disco se escribe como mucho
cada 400 ms, con volcado inmediato al cerrar o esconder la ventana para no perder nada.

**Segunda causa, arreglada** — *«What the agent is saying, gathered before it is written»*. Cada
pedacito de texto que llegaba de un CLI era una escritura al store: una copia del array entero de
mensajes para agregarle una letra al último, más una copia del mapa de corridas por la línea cruda,
más un recorrido de todos los mensajes en el suscriptor que decide qué guardar. Por token. Con
historial largo, eso es trabajo proporcional a todo lo dicho hasta ahora — justo por qué se ponía
peor con el correr del día. Ahora se juntan y se aplican de a uno cada 80 ms, y se vuelcan en el
acto cuando una corrida termina, se detiene o se cierra la ventana, así que nada llega tarde ni se
pierde.

**Tercera causa, arreglada** — *«A feed is read from the bottom»*. El hilo y el panel de
comunicación pintaban todo: hasta 3000 mensajes por proyecto, y ninguna fila memoizada, así que
cualquier cambio del store las redibujaba todas. Ahora se dibujan los últimos 200 mensajes (y las
últimas 20 tareas en el hilo), con un «ver anteriores» que trae más sin saltar el scroll, y las
filas están memoizadas de verdad — el selector de agentes ya devolvía la misma referencia, y el de
preguntas, que armaba un array nuevo en cada render, ahora no.

**Queda medir en tu máquina.** Las tres causas eran de las que empeoran con el uso, así que la
prueba real es un día largo de trabajo: si todavía se siente pesada, contame en qué momento.

### `[x]` F3 · Al cambiar de proyecto se perdía la conversación en la que estabas — *«Open it the way I left it»*

El modo (Tareas / Chat / Jerarquía) sí se guardaba por proyecto: lo verifiqué con un test contra el
store. Lo que no se guardaba era **en qué conversación estabas**. La fila del proyecto en la barra
lateral abría con un `null` explícito, que en `openProject` significa «el hilo del orquestador, no un
chat»: estabas hablando en un chat de A, ibas a B, volvías a A y aparecías en el hilo.

Ahora cada proyecto recuerda también su última conversación, y abrir un proyecto sin decir cuál
significa «abrilo como lo dejé» — con la conversación de vuelta, o el hilo si ese chat ya no existe.
Pedir el hilo a propósito (la fila «Orquestador») sigue llevándote al hilo. Vale también al abrir la
app: vuelve al proyecto y a la conversación donde estabas.

Lo que sigue siendo global, no por proyecto: si el tablero estaba en columnas o en grafo, y qué
paneles del dock tenías abiertos.

### `[x]` F4 · El cartel de «actual» en Inicio no sirve para nada — *«Home stops naming the last door you used»*

Estás en Inicio justamente porque no estás en ese proyecto: saber cuál abriste último no te deja
hacer nada, y ocupa el renglón donde debería ir lo que sí importa. La propuesta es cambiarlo por lo
que esa pantalla ya calcula y no muestra: cuántos agentes trabajan, cuántas aprobaciones esperan,
si algo falló. Va junto con F5.

### `[x]` F5 · Una pantalla de lo que necesita atención y lo que está trabajando — *«Home stops naming the last door you used»*

Dos formas. **(1)** Inicio se convierte en eso: arriba una franja con *te necesitan* (aprobaciones,
preguntas, tareas en «necesita tu atención», corridas fallidas) y *trabajando ahora* (agente, tarea,
hace cuánto), cruzando todos los proyectos y clickeable; abajo, los proyectos con esa info en la
tarjeta. **(2)** Una entrada nueva en la barra lateral al lado de Inicio, y dejar Inicio como está.
Recomiendo la 1: Inicio ya es medio eso a medias, y una pantalla que sólo tiene contenido cuando
pasa algo se siente vacía la mitad del tiempo. Falta que elijas.

---
## Bitácora

### Noche del 8 al 9 de septiembre de 2026

Revisión escrita y siete ítems cerrados, cada uno con sus tests y su entrada en el CHANGELOG. En
orden, y con el commit al lado:

1. `8d31200` — la revisión entera, este archivo.
2. `f0e0253` — **A1, A2 y A3**: la delegación que no llega a nadie ya no cuelga la tarea; una
   corrida que no puede arrancar cierra su tarjeta; el tope de rondas avisa y cierra en *necesita
   tu atención*. De paso, `.ainess/history/` dejó de commitearse.
3. `83182eb` — **B1**: unas treinta frases que salían en español fijo pasaron a los siete
   diccionarios. La marca de «interrumpido» ahora se reconoce en cualquier idioma, así que un
   proceso huérfano de ayer se sigue limpiando hoy.
4. `118a251` — **B2**: un solo constructor de prompt. En un chat el agente ahora puede pedirte una
   decisión, y las skills se nombran en vez de pegarse enteras.
5. `cf7b635` — **A4** (y **B3** descartado): la tarjeta parada en *en revisión* detrás de una
   corrida muerta se resuelve sola en el próximo arranque.
6. `efbde04` — **C2**: cada agente sabe quién más está trabajando en su misma tarea y qué le tocó.

**Lo que dejé sin tocar a propósito.** Todo lo que cambia el protocolo entre agentes (C1, C3, C4,
C5) y lo que abre la puerta de vuelta desde el agente hacia la app (D1 a D4) son decisiones de
producto, no arreglos: cambian cómo se escriben las tareas y qué puede hacer un agente sin
preguntarte. Están descritos arriba con su propuesta; elegí cuáles querés y los armo. Lo mismo con
las features (E). Queda pendiente también **B4**, la auditoría del CLI, que es leer antes que
escribir.

**Estado del repo.** Todo en `dev`, pusheado. `npx tsc --noEmit` limpio, 649 tests en 74 archivos
en verde, `npm run build:cli` bien. `cargo check` sigue fallando por una ruta vieja en
`src-tauri/target` que apunta a `projectsis`: es de antes, no lo tocó nada de esta noche, y se
arregla con `cargo clean`.
