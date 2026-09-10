# Novedades

Las versiones anteriores a la 0.6.0 están, en inglés, en el CHANGELOG del repositorio.

## Sin publicar

### Nuevo

- **El grafo de dependencias se pide desde una tarea, y muestra solo su familia.** Antes era una
  segunda vista del tablero entero y dibujaba todas las cadenas del proyecto una al lado de la
  otra: crecía más ancho que la ventana, y la respuesta a «¿con qué está enredada esta?» quedaba
  perdida en el medio. Ahora se abre desde la tarea, y en pantalla está lo que esa tarea espera y
  lo que la espera a ella, transitivamente — nada más. Una tarea que apenas comparte un requisito
  es una hermana, no familia, y se queda afuera; las hermanas son lo que volvía ilegible al
  anterior. Al hacer clic en una tarjeta el grafo se muda a ella, así se sigue una cadena de a un
  paso. Las archivadas vienen: un requisito archivado sigue siendo el motivo por el que algo debajo
  no puede arrancar.

- **Volver la conversación atrás, o reescribir lo que preguntaste.** Botón derecho en cualquier
  mensaje de un chat y la conversación puede terminar ahí; en los tuyos, además, podés editarlo y
  volver a preguntar desde ese punto. Lo que vino después se va, y la sesión del agente también: el
  hilo que ves es la mitad de una conversación, la memoria del agente es la otra mitad, y dejarlo
  con lo que acabás de sacar haría que el hilo mienta sobre qué está construida la próxima
  respuesta. El diálogo lo dice antes del botón, no después. Volver al último mensaje queda en
  gris, porque no se llevaría nada.

- **Modo autónomo, con hora de apagado.** Un botón en la barra del proyecto lo enciende por 1, 2,
  4, 8 o 12 horas. Mientras está activo el proyecto no te espera: las delegaciones que pedirían tu
  aprobación se aprueban, las preguntas se contestan solas por el camino más conservador, y el tope
  de rondas deja de cerrar la tarea. No existe el modo «para siempre»: se apaga solo a la hora que
  fijaste, y parar a mano sigue parando. El tope de gasto del proyecto vale igual que antes; ese es
  el freno. Y una tarea que no hace más que preguntar no se come la noche entera: después de diez
  respuestas automáticas, las preguntas vuelven a esperarte. Cuando termina, el informe queda en el
  hilo: qué terminó, qué falló, qué aprobó y qué contestó sin vos.

- **Reintentar cuando vuelve la cuota.** Una corrida que se moría porque el modelo se quedó sin
  cuota te dejaba el trabajo a medias hasta que volvieras a apretar reintentar a mano. Cada agente
  tiene ahora su propia casilla: si se queda sin cuota, la corrida espera en vez de fallar y se
  vuelve a lanzar sola con el mismo prompt apenas el proveedor tiene lugar de nuevo. En modo
  autónomo pasa con casilla o sin ella. Si para cuando vuelve la cuota la casilla está apagada, o
  el modo autónomo ya se terminó, no relanza nada, y te lo dice en vez de quedarse callado.

- **También Slack, y con eso están los tres.** Telegram, Discord y Slack, los mismos comandos en el
  que ya tengas abierto, cada uno con su tarjeta en Configuración y su propia lista de chats — un
  chat autorizado en uno está autorizado solo en ese. Slack pide dos tokens en vez de uno: el de
  aplicación abre la conexión y el de bot escribe, que es cómo lo diseñó Slack y no nosotros, y la
  pantalla te dice cuál es cuál. Socket Mode tiene que estar activado en tu app de Slack y el bot
  tiene que estar invitado al canal; eso también te lo dice, porque si no no llega nada y desde acá
  no habría forma de explicarte por qué.

- **Discord, al lado de Telegram.** Los mismos comandos en el que ya tengas abierto de los dos:
  cualquier cosa que escribas arranca una tarea, `/status` te dice quién trabaja, `/approve` y
  `/answer` resuelven lo que te necesita. Configuración ahora tiene una tarjeta por canal. Ninguno
  de los dos expone nada — la app es la que sale, así que sigue sin haber túnel, ni puerto, ni
  dirección que encontrar. Cada canal autoriza sus propios chats y sólo los suyos: un id de canal de
  Discord no queda autorizado por estar en la lista de Telegram. Tu bot necesita el intent de
  contenido de mensajes activado en el portal de desarrolladores de Discord, y la pantalla te lo
  dice, porque sin eso los mensajes llegan vacíos y desde acá no habría forma de saber por qué.

- **Abrir el pull request desde acá.** Un agente termina en su rama y el último paso lo hacías a
  mano. Ahora hay un botón al lado de pull y push, y en la tarjeta terminada. Nunca abre uno de un
  solo click: un diálogo te muestra qué rama va contra cuál, con el título y el cuerpo ya escritos
  desde la tarea y desde lo que reportó el agente — los archivos que tocó, lo que verificó, y lo que
  no pudo hacer, que va con su propio encabezado en vez de quedar afuera. En la rama por defecto no
  te deja, y en una rama sin pushear te ofrece pushear primero en lugar de hacerlo por atrás.

- **Reintentar una tarea con otro modelo, o con otro agente.** Una corrida que salió mal, o cuyo
  agente se quedó sin cuota a mitad de camino, te dejaba reescribiendo todo. Ahora el menú de la
  corrida —y el botón en su tarjeta— te ofrecen relanzarla con el mismo prompt y con quien elijas.
  Arranca de cero en vez de continuar la corrida que falló, porque el contexto de esa suele ser el
  problema. Cambiar de agente limpia el modelo: los modelos de un proveedor no son los de otro, y
  arrastrar uno es cómo se manda una corrida a un modelo que no existe.

- **Soltá archivos sobre la caja.** El clip y Ctrl+V eran las dos formas de adjuntar; arrastrar un
  archivo desde la carpeta que ya tenías abierta es la tercera, y la que no te hace dar ninguna
  vuelta. La caja se marca con un contorno cuando le pasa por encima un arrastre que trae archivos,
  y lo que ya habías escrito va con ellos. Una tarjeta del tablero que cruce de camino a otra
  columna no se toca — lleva texto, no archivos, y agarrarla no la movería a ningún lado.

### Arreglado

- **Responder una pregunta es una lista que marcás y un botón que apretás.** Las opciones eran
  botones en línea, cada uno del ancho de su propio texto, así que un conjunto quedaba desparejo y
  una opción de una palabra era un blanco del tamaño de la palabra. Ahora son una lista, una por
  fila, del ancho de la caja. Una pregunta que acepta varias respuestas lo dice, en vez de que lo
  descubras haciendo dos clics. Y una pregunta de una sola respuesta ya no se va apenas tocás una
  opción: las dos esperan a «Responder», así lo que está por decirse queda en pantalla antes de
  decirse, y un clic errado es un clic más para deshacerlo en lugar de algo ya enviado. En las de
  una sola respuesta, la opción y la caja para escribir la tuya se reemplazan entre sí, porque una
  respuesta no puede ser además otra frase distinta.

- **Los botones del pie de una tarea se ordenan por lo que hacen.** Tres botones sueltos bajo una
  regla de «separalos» dejaban «archivar» varado en el medio, a igual distancia de un link que te
  lleva a otro lado y de un borrar que no vuelve. Ahora irse a otro lado está a la izquierda, y lo
  que cambia la tarea está a la derecha, junto.

- **El tablero perdió el switcher de vista y recuperó «Nueva tarea» donde corresponde.** Como el
  grafo ya no es una segunda vista del tablero, no quedaba nada entre qué cambiar, así que las dos
  barras son una: la búsqueda, el filtro, la cuenta, y al final «Revisar», «Copiar como markdown» y
  «Nueva tarea» uno al lado del otro.

- **La cuota de Antigravity dice por qué es una estimación.** Su anillo muestra un guión donde los
  demás proveedores muestran un número, y un guión sin explicación al lado parece algo roto. No lo
  está: Antigravity no informa cuánto queda. El número exacto existe —su CLI se lo pide a Google—
  pero está detrás de una licencia paga de Code Assist, y a una cuenta sin ella se lo niegan.
  Así que ahora la app lo dice, al lado del guión, en el popover del composer, en la pantalla del
  agente y en ajustes, en vez de dejarte adivinando. Lo que se muestra sigue infiriéndose del
  «quota reached, resets in 1h45m» con el que vuelven las corridas, que es lo único que hay para
  leer.

- **El anillo y la barra de cuota se llenan a medida que la gastás.** Se llenaban con lo que
  *quedaba*, así que una cuota intacta era un anillo lleno y una casi agotada estaba casi vacía: al
  revés de cualquier medidor de algo que se consume, y por eso no se leían de un vistazo. Ahora
  arrancan vacíos y se llenan con lo gastado, y todos los números al lado cuentan lo mismo: «83%» es
  lo que se fue, no lo que queda. El color sigue mirando lo que sobra, así que un anillo casi lleno
  además está en rojo: las dos mitades dicen «se está acabando» en el mismo momento, en lugar de que
  una lo diga tarde.

- **Un step dice lo que hizo sin esperar al navegador.** Cada fila de la actividad de un agente está
  recortada —una herramienta muestra su resumen, una delegación noventa caracteres de la tarea— y la
  única forma de leer el resto era el `title` que dibuja el navegador: un segundo de espera, una
  cajita pelada donde cayó el puntero, y los saltos de línea aplastados en espacios, que es
  justamente lo que no querés para un comando o un stack trace. Ahora tienen el tooltip de la app,
  pegado a la fila, en monoespaciada y con los saltos de línea intactos. El step en el que va la
  corrida también tiene uno, y antes no tenía nada.

- **Un agente ya no sabe de un proyecto del que nadie le habló.** El contexto compartido era un
  solo texto en la pantalla de ajustes, y se pegaba al prompt de todos los agentes de todos los
  proyectos. Escribías algo sobre un repo y todos los agentes, en todos lados, lo habían leído: así
  fue como un mensaje dirigido a un proyecto se entendió, se actuó y se llevó a otro. Ahora es de
  cada proyecto: la pantalla de ajustes elige cuál, y `ainess context` acepta `-p`/`-w` como el
  resto del CLI. Lo que tenías escrito se copia en cada proyecto que ya tenías, así no se pierde
  nada; si ese texto era de uno solo, los demás son ahora el lugar donde borrarlo.

- **Un hook arranca con un mensaje del evento que elegiste.** Había un solo texto por defecto
  atrás de los diecisiete, escrito para «un agente terminó» y en español a la fuerza. Un hook de
  «se cayó internet» arrancaba anunciando que un agente había terminado, a todo el mundo, en un
  idioma que la mayoría no eligió. Ahora cada evento arranca con su propia línea, en tu idioma, con
  las variables que ese evento realmente trae: la pregunta cuando alguien pregunta, el modelo
  cuando se acaba la cuota, los dos agentes cuando hay una delegación. Si cambiás el evento antes
  de tocar el mensaje, el mensaje te sigue; si lo tocás, deja de seguirte, porque de ahí en más es
  tuyo. El botón de probar también completa las variables en tu idioma, así la vista previa es el
  mensaje que vas a recibir.

- **La app deja de cargar seis idiomas que no te está mostrando.** Los siete diccionarios venían en
  el mismo bundle, así que cada arranque pagaba por los seis que nadie estaba leyendo: 575 kB, 179
  comprimidos. Ahora sólo el español viene adentro —es la base a la que caen todos los demás— y el
  tuyo se trae antes de la primera pintura y queda cargado. Ese chunk pasó de 575 kB a 83 kB, y de
  179 comprimidos a 27.

- **Un agente que responde una pregunta en un chat ya no puede repartir trabajo.** El turno que
  lleva tu respuesta arrancaba sin que se le dijera que era de un chat, así que se leía como una
  tarea: se le parseaban los bloques `delegate` y se actuaba sobre ellos. Un agente podía poner a
  trabajar a otros desde adentro de una conversación donde nadie se lo había pedido.

- **El tablero también scrollea hacia abajo mientras arrastrás.** Una columna más alta que la
  pantalla tenía el mismo problema que el tablero a lo ancho: la tarjeta debajo de la cual querías
  soltar estaba fuera de vista. Ahora la columna bajo el puntero también tira, con la misma rampa.

- **Se terminaron las ventanas de consola que abría un agente mientras trabajaba.** El intento
  anterior arregló la mitad equivocada. Pedir un proceso sin consola funciona para ese proceso — y
  después cada programa de consola que *él* corre le pide una a Windows, recibe una nueva, y esa sí
  se ve. Las ventanas nunca fueron nuestras: eran de los programas que corrían nuestros agentes.
  Ahora la app toma una sola consola para sí al arrancar y la esconde, y todo lo que cuelga de ella
  hereda esa en vez de pedir la propia, por hondo que vaya.

- **Un link a un archivo en una respuesta ahora hace algo.** Un agente que escribía
  `[el archivo](file:///C:/Users/vos/notas.txt)` dibujaba un texto gris muerto: `file:` estaba en la
  misma lista de rechazados que `javascript:` y `data:`, que sí se ejecutan en la página, y había
  quedado ahí por asociación — no ejecuta absolutamente nada. Ahora hacerle clic te muestra el
  archivo en el explorador y se detiene ahí. Nunca se convierte en un link de verdad ni se le pasa
  al sistema para que lo abra, porque `[mirá esto](file:///C:/x.exe)` es una línea que cualquier
  agente puede escribir.

- **El tablero se desplaza solo cuando llevás una tarjeta al borde.** Un tablero más ancho que la
  ventana no se podía cruzar: la columna que querías estaba fuera de vista, y soltar para scrollear
  dejaba la tarjeta donde no era. Ahora sostener una tarjeta cerca de cualquiera de los dos bordes
  arrastra el tablero, despacio al entrar en la zona y más rápido cuanto más te acercás — y sigue
  moviéndose aunque dejes el mouse quieto, cosa que los eventos de arrastre por sí solos no le
  avisan a nadie.

## 0.10.0 — 2026-09-09

### Nuevo

- **La caja completa lo que estás por escribir.** `@` nombra a un agente del proyecto, `#` un
  archivo del workspace, `{{` una de las variables de plantilla, y `/` tus comandos y tus órdenes
  guardadas juntos — porque las dos son cosas que podés lanzar. Flechas para moverte, Enter o Tab
  para elegir, Escape para cerrar la lista sin tocar lo que escribiste. A los dos comandos que
  había se sumaron cinco: `/tasks`, `/chat`, `/diff`, `/stop` y `/clear`, que pregunta antes. Nada
  se completa adentro de un bloque de código, donde un `#` es un comentario y un `/` es una ruta.

- **Podés escribir código en la caja.** Enter enviaba, así que un bloque de código era acordarse de
  Shift+Enter en cada línea y confiar en que habías cerrado la cerca — la caja mostraba el markdown
  como texto plano y no daba ninguna señal. Ahora las teclas saben dónde está el cursor: en una
  línea que es sólo la apertura de una cerca, Enter escribe la de cierre y te deja en el medio;
  adentro de una cerca Enter baja de línea conservando tu indentación y Tab mete dos espacios; y la
  parte encercada de lo que estás escribiendo tiene un fondo, así ves dónde empieza y dónde termina.
  Ctrl+Enter envía desde adentro de una cerca, ya que Enter solo ya no puede.

### Arreglado

- **Una pregunta se hace en un solo lugar.** Aparecía como burbuja en el hilo y tomaba la caja al
  mismo tiempo, las dos vivas, las dos la misma pregunta. Se la queda la caja, que es donde podés
  contestar con el composer entero. Una vez respondida vuelve al hilo como una línea de sólo
  lectura — que es lo único que registra ahí que alguna vez se preguntó.

- **Responder desde la caja ahora responde de verdad.** Un agente te pregunta algo, elegís escribir
  la respuesta en la caja en vez de en el campo de la pregunta, mandás — y la pregunta quedaba
  abierta. Te volvía a tapar la caja cada vez que entrabas de nuevo a la conversación, seguía en la
  campanita, en Inicio y en `/status`, y la corrida que preguntó seguía esperando una respuesta que
  ya le habías dado, mientras tu mensaje arrancaba una corrida aparte. Un agente que preguntó algo
  está frenado esperándote, así que lo que escribas después es la respuesta, la escribas donde la
  escribas.

- **Inicio dice cada cosa una sola vez.** Se había vuelto la pantalla de lo que te necesita, pero
  la grilla vieja de tarjetas de proyecto seguía abajo, así que un agente trabajando aparecía tres
  veces: en la lista de lo que está trabajando, adentro de la tarjeta de su proyecto, y otra vez en
  el contador de esa misma tarjeta. Cada tarjeta traía además sus propios botones Abrir, Editar y
  Eliminar —uno rojo en cada una— para acciones que ya cubrían el click de la tarjeta y su menú
  contextual. Ahora la pantalla entera es un solo tipo de fila: lo que te necesita, lo que está
  trabajando, y los proyectos, en ese orden. La fila de un proyecto muestra una sola línea de estado
  y, sólo cuando hay algo, un contador chico de qué te espera y qué está corriendo. Cuando no hay
  nada esperándote, te lo dice en una línea en vez de dejarte deducirlo.

- **Los skills sugeridos están escritos para el agente, y explicados para vos en tu idioma.** El
  catálogo detrás de «Agregar sugeridos» estaba entero en español: los nombres, las instrucciones que
  el agente efectivamente lee, y las descripciones de una línea de la lista. Las instrucciones son
  código —van al prompt de un agente y a un archivo en la carpeta del proyecto—, así que ahora están
  en inglés, como el resto del repositorio. Lo que está escrito para vos se traduce, en los siete
  idiomas, y hay un test que no deja entrar un sugerido nuevo hasta que lo tengan todos.

## 0.9.0 — 2026-09-08

### Nuevo

- **Un tope de gasto por proyecto, y el aviso antes de quemarlo.** La pantalla de uso siempre supo
  decirte cuánto había costado un proyecto. Lo que no podía era frenarlo. Ahora un proyecto acepta un
  tope diario, uno mensual, o los dos, y decís qué hacer cuando se llega: avisar, o no dejar arrancar
  corridas nuevas. El aviso llega al 80% —una vez por día, no una por corrida— y la pantalla de uso
  dibuja la barra contra el tope que está más cerca de romperse. Los números siguen siendo sólo lo
  que cada CLI reportó de verdad: un proveedor que no reporta nada no suma, y la pantalla lo dice en
  vez de estimar.

- **Un hook puede avisarte por Telegram, y hay tres momentos más de los que enterarte.** Las otras
  dos acciones de chat te piden un webhook que tenés que ir a crear en un servidor; esta reusa el
  bot que ya configuraste en Mensajería, así que «cuando termine una tarea, avisame» es elegir de
  una lista. Podés nombrar un chat o dejarlo vacío para todos los de la lista — y sólo los de la
  lista, porque un hook no puede ser la puerta de atrás que la evita. Vinieron con él tres eventos
  nuevos: un agente preguntó algo y está esperando, una revisión pidió cambios, y un agente se quedó
  sin cuota.

- **La paleta busca lo que se dijo, no sólo cómo se llaman las cosas.** Encontraba proyectos,
  tareas, chats y agentes por nombre, que es lo que necesitás en el día — y a las dos semanas lo que
  te acordás es una frase, no un título. Escribís tres letras y vuelven también los mensajes del
  feed del proyecto y de todos los chats, del más nuevo al más viejo, cada uno mostrado con las
  palabras que buscaste en el medio de la línea y no con lo que el mensaje arrancaba diciendo. Los
  acentos y las mayúsculas dan igual, y el salto de línea que quedó entre tus dos palabras
  también.

- **El diff de una corrida, no el del proyecto entero.** El panel de diff muestra el árbol de
  trabajo del proyecto, que contesta «qué está pasando en el repo» y nunca «qué tocó esta tarea».
  Ahora cada corrida se acuerda de dónde corrió —el workspace del proyecto, o el worktree propio del
  agente— y de en qué commit arrancó, así que el detalle de una corrida te muestra qué se movió
  desde que empezó. Las corridas de antes de esto no se acuerdan de ninguna de las dos cosas, y lo
  dicen en vez de inventar.

- **Un agente puede mover su propia tarjeta, y abrir una para lo que encontró en el camino.** El
  tablero era de una sola vía: el planificador lo leía y repartía, y el que hacía el trabajo no veía
  ni su tarjeta, mucho menos podía avisar que se trabó. Ahora cualquier agente puede dejar un bloque
  `task` mientras trabaja — uno mueve su tarjeta y le suma una línea de detalle, el otro abre una
  tarjeta sin asignar en el backlog para algo que se cruzó y no le toca. Aparece en el tablero
  mientras la corrida sigue, no cuando termina, y la tarjeta del backlog dice quién la propuso.
  Cerrar una tarjeta sigue sin ser decisión del agente.

- **La app te contesta en un chat que ya tenés abierto.** En Configuración hay una sección
  Mensajería: pegás un token de bot de @BotFather en Telegram, la prendés y le escribís al bot —
  cualquier cosa que digas arranca una tarea, `/status` te dice quién trabaja y qué te espera,
  `/approve` y `/answer` resuelven lo que te necesita, `/stop` frena. Esto no expone nada: la app es
  la que sale a preguntar, así que no hay túnel, ni puerto, ni dirección que alguien pueda
  encontrar. Sólo los chats de la lista pueden dar órdenes, la lista vacía no autoriza a nadie, y a
  un desconocido no se le responde nada — su id aparece en Configuración con un botón para
  autorizarlo, que es también como averiguás el tuyo. Lo que te llega a la campana te llega también
  al chat, y lo que está esperándote te dice qué contestar.

### Arreglado

- **Dos chats con el mismo agente vuelven a ser dos conversaciones.** El agente tenía un solo
  casillero para su sesión, y ese casillero guardaba la última conversación que hubiera hablado.
  Abrías un segundo chat con un agente con el que ya estabas hablando, volvías al primero, y te
  contestaba con el contexto del otro — y además un chat pisaba la sesión que usaban sus propias
  tareas. Ahora el chat entrega la sesión que le pertenece en vez de leer ese casillero, guarda lo
  que reporta el proveedor junto al chat del que es, y un chat que todavía no tiene la suya arranca
  de cero en lugar de pedirla prestada. Contestar una pregunta hecha dentro de un chat también se
  queda adentro.

- **Apagar todos los tipos en el filtro de comunicación ahora deja la vista vacía.** Lo que le
  mandás a un agente estaba exento: se mostraba dijera lo que dijera el filtro, y ni siquiera
  figuraba en la lista de tipos, así que no había forma de apagarlo. El botón decía «Tipos (0/8)» y
  el panel seguía mostrando cosas. Ahora son diez tipos, los tuyos dos entre ellos, y apagado es
  apagado. Y cuando lo que vació la vista fue el filtro, lo dice, en vez de asegurar que no hubo
  actividad.

- **El panel de comunicación lee lo que escribió un agente como lo escribió.** Sus filas mostraban
  el markdown crudo —los asteriscos, las comillas invertidas, los numerales— mientras el mismo texto
  se veía bien en todo el resto de la app. Ahora se renderiza la prosa: lo que dijo un agente, lo
  que delegó, con qué volvió y sus notas. Las líneas de herramienta y stderr quedan tal cual
  vinieron, porque una ruta como `src/lib/__tests__/x.ts` no es una instrucción para poner la mitad
  en negrita, y lo que escribiste vos se muestra como lo escribiste, igual que ya hace el chat.

- **El filtro de tipos se queda abierto mientras lo usás, y ya no rompe el panel.** Elegir un tipo
  cerraba el menú, así que dejar el feed en dos tipos era abrirlo cinco veces. Y el botón que lo
  abre dice «Tipos» hasta que destildás algo y «Tipos (7/8)» después — una etiqueta más larga por la
  que nada en esa fila tenía permitido encoger, así que el panel entero terminaba más ancho que el
  dock donde vive. Ahora la fila cede, y también la de cada mensaje, donde dos nombres de agente,
  una hora, una etiqueta y un botón se peleaban por el mismo espacio angosto.

- **Pedir el crudo de un mensaje muestra ese mensaje.** El botón de una fila del panel de
  comunicación abría la corrida entera —cada línea de stdout que la sesión hubiera producido—, que
  no es lo que pide nadie que hace clic sobre una delegación. Ahora muestra ese mensaje: de quién a
  quién, cuándo, el texto completo, y si es una llamada a herramienta, la herramienta, su entrada y
  el error con el que falló, con un botón para copiar todo. La corrida entera sigue estando, un
  clic más adentro, que es donde correspondía. El botón además tiene un tooltip, y aparece en todos
  los mensajes y no sólo en los que tienen una corrida detrás.

- **Arrastrar la ventana ya no se congela ni da saltos.** Correr un programa externo —el `git
  status` que se refresca cada minuto, un `git diff`, una sonda de `--version`— retenía el hilo que
  bombea los mensajes de la ventana hasta que el programa terminaba. Windows arrastra una ventana
  con un bucle modal en ese mismo hilo, así que un arrastre que caía justo encima de uno de esos se
  clavaba y después saltaba hasta donde hubiera llegado el puntero. Esos comandos, y la lectura y
  escritura de la configuración y los logs, ahora corren fuera de ese hilo. Guardar la
  configuración además escribe al lado y renombra encima, así nadie lee nunca media
  configuración.

- **La app se llama ainess en todos lados, ejecutable incluido.** Antes se llamaba `ais`, y el
  nombre viejo sobrevivió donde nadie mira: el crate de Rust, y por lo tanto el binario — la app
  instalada era `ainess\ais.exe`, que es lo que te mostraban el Administrador de tareas, el aviso
  del firewall y la lista de inicio. La línea de comandos se movió con él: `ais run` y `ais serve`
  ahora son `ainess run` y `ainess serve`, y `ais` ya no existe. No se pierde nada de lo que tenías:
  los borradores, los anchos de panel y el token del teléfono se guardan con nombres nuevos y
  siguen leyendo los viejos.

- **Se terminaron las ventanas de consola que aparecían encima de lo que estabas mirando.** Frenar
  una corrida, cerrar la app, una corrida que se pasó de tiempo, cortar el túnel y cada chequeo de
  un proceso viejo llamaban a `taskkill` o a `tasklist`, y Windows le da una ventana de consola a un
  programa de consola arrancado desde una app con ventanas, salvo que se le diga que no. Las
  llamadas que arrancan un agente siempre se lo decían; las de limpieza que las rodean, no.

- **Un solo botón al lado de la caja, y es el que hace falta en ese momento.** Enviar cuando no hay
  nada corriendo, detener mientras un agente contesta — los dos ya no se amontonan encima del texto
  que estás escribiendo. Abajo no cambió nada: Enter sigue enviando, y mientras el agente trabaja
  sigue encolando lo que escribas para cuando termine el turno, que ahora es lo que te dice la caja
  vacía en lugar de un segundo botón.

- **La pregunta de un agente ocupa el lugar de la caja.** Vivía adentro de la burbuja de la corrida:
  sirve mientras la estás mirando y no sirve más apenas seguís scrolleando — y peor, lo que
  escribieras en la caja con una pregunta abierta arrancaba una corrida nueva y dejaba al agente
  esperando una respuesta que no iba a llegar. Ahora la pregunta se para donde ibas a escribir, con
  sus opciones como botones y lugar para una respuesta tuya; si hay más de una esperando lo dice y
  van de a una. «Escribir otra cosa» te devuelve la caja sin responder nada.

- **El panel de notificaciones se cierra al hacer clic afuera.** Cuelga de la barra de título, que es
  la zona por la que se arrastra la ventana: un clic ahí lo toma el sistema para mover la ventana y
  nunca llega a la capa que cierra el popover.

- **Las terminales son de su proyecto.** Abrías una en un proyecto, te ibas a otro y seguías viendo
  las pestañas del primero — que es también por qué parecía que una terminal se abría en la carpeta
  equivocada: era la de otro proyecto, parada en su propia carpeta. Ahora cada proyecto muestra las
  suyas y recuerda en cuál estaba. Borrar un proyecto sigue dejando sus shells vivas, como siempre
  —alguna puede estar en medio de algo— y aparecen en Inicio, que es donde va una terminal sin
  proyecto.

## 0.8.0 — 2026-09-08

### Nuevo

- **La caja vacía ahora dice algo, y cambia.** El placeholder del composer escribe una de cinco
  líneas y va cambiando cada pocos segundos: para qué está el equipo, qué le podés dejar, que `/`
  abre los comandos y el atajo de Enter, que deja de ser una cola permanente en la línea y pasa a ser
  algo que leés una vez. Se queda quieto para el que le pidió al sistema menos movimiento, y en el
  teléfono no se mueve para nada.
- **Movimiento donde significa algo.** Una corrida que sigue en marcha tiene la luz pasando de lado a
  lado sobre el paso en el que está, en vez de un spinner; el "Trabajando ahora" de Inicio se lee
  vivo; la píldora de aprobaciones lleva un hilo de luz alrededor mientras —y solo mientras— algo
  espera tu respuesta; y la plata en el panel de consumo va subiendo hasta lo que es, con el mismo
  formato de moneda que usan las tablas. No se decoró nada más: el hilo, el feed y el tablero se
  queden quietos, porque una herramienta que mirás todo el día solo debería moverse cuando te está
  diciendo algo.
- **Un agente puede decir algo antes de terminar.** Hasta ahora lo único que un agente delegado podía
  decirle a su planificador era su respuesta final: si se trababa a los dos minutos, nadie se
  enteraba por veinte. Ahora puede dejar un bloque `note` mientras trabaja —trabado, más lento de lo
  esperado, algo que deberías saber ya— y la app lo entrega mientras la corrida sigue, directo al
  feed y a quien haya delegado el trabajo.
- **Y cierra con lo que realmente hizo.** Un bloque `result` que nombra los archivos que tocó, qué
  corrió para probarlos y qué no pudo hacer. La prosa queda; esta es la parte que el planificador lee
  sin tener que interpretarla, y aparece en el detalle de la corrida como tres listas cortas.
- **Inicio es donde te enterás de qué está esperando.** Arriba de los proyectos, dos listas que los
  cruzan a todos: qué te está esperando a vos —una delegación frenada por aprobación, una pregunta
  que nadie contestó, una tarjeta que el tablero dejó en *Necesita tu atención*— y quién está
  trabajando ahora, en qué y desde cuándo. Cada línea te pone donde está la cosa: el hilo para una
  aprobación o pregunta, el tablero con la tarjeta abierta para una tarea. Las dos desaparecen
  cuando no hay nada en ellas, así que un Inicio tranquilo se ve igual que siempre. Y el badge que
  marcaba el último proyecto que abriste ya no está: estás en Inicio justamente porque no estás en él.
  En su lugar, cada tarjeta dice qué está pasando adentro: "2 trabajando · 1 esperándote".
- **Los agentes en la misma tarea saben el uno del otro.** Un planificador partiendo trabajo entre
  dos implementadores los arrancaba a ciegas: ninguno sabía que el otro estaba ahí, los dos tocaban
  los mismos archivos y el planificador recibía dos respuestas que se contradecían. A cada uno ahora
  se le dice quién más está trabajando en esta misma tarea y qué se le pidió hacer, y que lo que
  alguien más tiene en sus manos es suyo para cambiar, no tuyo para pisar. Esto viaja en cada turno,
  como el tablero, porque es la clase de cosa que cambia mientras trabajás.
- **Un hook puede escribirle "al jefe" en vez de a alguien por nombre.** El agente a instruir ahora
  ofrece el tope de la jerarquía —el planificador raíz del proyecto, el mismo agente al que el
  composer, la CLI y el teléfono le escriben por omisión— que se resuelve cuando el hook se dispara y
  no cuando se guarda, así que rearmar el equipo nunca lo deja apuntando a alguien que ya no está a
  cargo. Si se deja sin filtrar, llega al jefe de *cada* proyecto, que es lo que hace que un solo
  hook programado alcance para todos; achicado a un proyecto es el jefe de ese, y un evento que causó
  un agente se queda en el proyecto donde pasó.

### Arreglado

- **Podés leer para atrás en una conversación mientras un agente sigue escribiendo.** En un chat,
  cada delta que mandaba te arrastraba de vuelta al fondo: scrollear para arriba a ver qué había
  dicho hace dos minutos era imposible hasta que terminara. El chat ahora hace lo que el hilo
  orquestador ya hacía: sigue el fondo solo mientras estás en el fondo, y cuando no, una píldora en
  la esquina te dice cuántos mensajes llegaron y te lleva ahí cuando querés. La cuenta ahora está en
  los tres lados —chat, hilo y el feed de comunicación— en lugar de un "nuevos mensajes" a secas.
- **Un nombre de modelo largo ya no rompe el diálogo de nuevo chat.** La fila de un participante son
  tres desplegables y un tacho en una grilla, y una columna de grilla no se achica menos de lo que
  contiene: si elegías un modelo con nombre largo la fila se estiraba, el diálogo se estiraba con
  ella, y los campos de nombre y modo terminaban colgando afuera de la tarjeta. Las columnas ahora se
  pueden achicar y el nombre se recorta.
- **Que una herramienta falle adentro de un agente deja de verse como que la app se rompió.** El
  `view_file` de Antigravity falla, el agente reintenta y sigue, y la conversación mostraba una alarma
  roja al respecto, con la misma forma que tiene una falla real. Ahora es una línea en la actividad de
  la corrida, en ámbar, con lo que dijo el proveedor a un hover de distancia. El rojo se guarda para
  lo que de verdad está roto. El único caso que vale la pena decir en voz alta se sigue diciendo: que
  la misma herramienta falle tres veces en una corrida significa que el agente está dando vueltas en
  círculos, y eso se lleva una línea sola nombrándola.
- **Los botones del composer dejan de amontonarse en la caja.** El botón de enviar ya no se convierte
  en un reloj —encolar funciona exactamente igual que antes, el Enter encola mientras un agente está
  ocupado y el tooltip lo dice— y el clip bajó a la barra, solo a la izquierda, con el agente, el
  modelo, las aprobaciones y la cuota juntados a la derecha.
- **`ais run` falla cuando la tarea falló, en cualquier idioma.** Decidía su código de salida buscando
  las palabras en español de "CLI not found" en el feed —texto que dejó de existir el día que esos
  mensajes empezaron a salir de los diccionarios. En una máquina en inglés, una tarea que moría por
  falta de CLI salía con cero, verde para cualquier script que la hubiera llamado. Ahora lee las corridas.
- **La conversación deja de repintarse entera.** El hilo y el feed de comunicación dibujaban cada
  mensaje que tenían —tres mil por proyecto— y no había ni una fila memoizada, así que cualquier cosa
  que tocara el store los redibujaba todos. Ahora dibujan el último tramo, con un link arriba para
  caminar más atrás que te mantiene en tu lugar en vez de saltar, y las filas solo se redibujan
  cuando algo suyo cambió de verdad.
- **Que un agente escriba ya no sale más caro cuanto más tiempo lleves trabajando.** Cada delta que
  mandaba una CLI era una escritura: una copia de toda la lista de mensajes para sumarle una letra al
  final, más una copia del mapa de corridas para la línea cruda, más una pasada por cada mensaje para
  decidir qué guardar. Por token. Con un historial largo, es trabajo proporcional a todo lo que se
  dijo alguna vez, que es exactamente por qué la ventana se ponía más pesada a medida que pasaba el
  día. Los deltas ahora se juntan y se aplican juntos, como mucho cada 80 ms, y se vuelcan en el acto
  cuando una corrida termina o se frena para que nada llegue tarde o falte.
- **Un proyecto abre como lo dejaste, conversación incluida.** Pasar a otro proyecto y volver te
  dejaba en el hilo orquestador, incluso si venías hablando en uno de los chats de ese proyecto: la
  barra lateral pedía el proyecto *y ningún chat*, y eso es exactamente lo que recibía. Ahora cada
  proyecto se acuerda de su última conversación además de su vista, y reabrir la app vuelve a ambas.
  Pedir el hilo a propósito te sigue dando el hilo.
- **Tipear ya no escribe en disco en cada tecla.** Cada letra guardaba cada borrador de la app
  como JSON, sincrónicamente, en el hilo principal —que es justamente el hilo que tiene que seguirle
  el ritmo a tu escritura. Lo que escribís sigue aterrizando en la app al instante; el disco se
  entera como mucho cada 400 ms, e inmediatamente cuando la ventana se cierra o pierde foco, para que
  no se pierda nada.
- **El panel de notificaciones ya no abre con un tooltip asomando.** Abrirlo le pasaba el foco al
  primer botón de ícono, y un tooltip se muestra tanto con foco como con hover.
- **Una tarjeta dejada en revisión vuelve.** Al tablero se lo vuelve a poner a la par de sus corridas
  en cada arranque, pero solo para las tarjetas *Trabajando*. Una estacionada *En revisión* detrás de
  una revisión que moría con la app —o cuya corrida se caía de un historial recortado— se quedaba ahí
  para siempre. Ahora se lee de la misma manera que el flujo vivo: aprobada va a lista, cambios y
  fallas vuelven a vos, y una tarjeta que alguien arrastró a mano sigue siendo asunto de esa persona.
- **Un agente en un chat es el mismo agente que en una tarea.** El chat armaba su propio prompt de
  sistema, sin el bloque `ask` —así que un agente con el que hablabas no podía pedirte una
  decisión— y con cada skill pegada entera en vez de apuntada en el repo. Los chats pasan ahora
  por el único constructor: mismo perfil, mismo contexto compartido, mismas skills, misma forma de
  preguntar, menos el tablero y la delegación que a un agente no le sirven en una conversación.
- **La app habla tu idioma hasta el fondo.** La interfaz estaba traducida y unos treinta mensajes por
  debajo de ella no: una corrida parada, una aprobación, una delegación rechazada, un hook que
  falló, los errores que el teléfono recibe, lo que deja atrás una corrida interrumpida, la CLI que
  no se pudo instalar. En una ventana en inglés todos salían en español. Ahora pasan por los mismos
  diccionarios que el resto —y una corrida que el build de ayer interrumpió en otro idioma hoy
  se sigue reconociendo como interrumpida.
- **Una delegación que no nombra a nadie ya no cuelga la tarea.** Un planificador que escribía mal el
  nombre de un agente —o que nombraba a uno que no estaba bajo él— se quedaba esperando a un equipo
  que nunca iba a llegar, y su tarjeta atascada en *Trabajando* hasta que la app se reiniciaba. Ahora
  el error vuelve al planificador con los nombres que sí puede usar, para que delegue de nuevo;
  sin más rondas, la tarea se cierra como que te necesita en lugar de fingir que trabaja.
- **Una corrida que ni siquiera puede arrancar cierra su tarjeta.** Si faltaba la CLI, la corrida
  daba error y el tablero nunca se enteraba.
- **Tocar el techo de rondas te lo avisa.** Ahora la tarea se cierra como que te necesita, con el
  techo en el detalle y la misma notificación que recibe cualquier falla, en lugar de terminar callada
  como si hubiera finalizado.
- **Un planificador que se había olvidado de cómo delegar.** Mandar las instrucciones solo en el turno
  que abre una sesión estaba bien para la descripción —el rol, el perfil, el contexto compartido, la
  lista de skills— y mal para los dos bloques con los que un agente *actúa*. Una CLI compacta su propio
  contexto cuando una sesión crece, y una vez que el bloque `delegate` se había resumido para afuera, el
  planificador ya no podía llegar a su propio equipo: iba a buscar una línea de comandos `ainess` y
  una tool MCP, y terminaba pidiéndole al usuario que delegara en su nombre, razonando sobre la app
  adentro de la cual corría como si fuera de otro. Los bloques `delegate` y `ask` ahora van en cada
  turno. Son el protocolo, no el preámbulo.
- **Un cuelgue ya no deja a los agentes trabajando a espaldas de la app.** Cerrar la app baja el
  proceso de cada agente; un cuelgue —el administrador de tareas, un corte de luz, un pánico— nunca
  llega a eso, así que las CLIs seguían de largo: seguían editando el workspace, seguían gastando
  cuota, sin nadie leyendo su salida y con la app que las arrancó ya desaparecida. Cada corrida
  ahora anota el proceso que tiene por detrás, y el próximo arranque los encuentra, los frena y
  lo dice, en todos los proyectos —incluidos los que no carga al inicio, cuya contabilidad puede
  esperar pero sus procesos no. Un pid nunca alcanza para matar: se reparten de nuevo, y el dueño
  siguiente tiene tantas chances de ser tu propio servidor de desarrollo como un agente, así que
  un proceso solo se frena cuando su imagen *y* el momento en que arrancó coinciden con los que
  la corrida guardó.
- **Cada proyecto se acuerda de la vista en que lo dejaste.** El tablero, la conversación y la
  jerarquía eran un solo ajuste compartido por todos los proyectos, así que si abrías uno en la
  jerarquía y volvías a otro, ahí también se veía la jerarquía. Ahora cada proyecto guarda la suya —
  a través de reinicios, y reabrir la app aterriza en el último proyecto donde estaba. Hacer clic
  en un chat sigue siendo un destino explícito y abre la conversación.
- **El modelo elegido en una conversación se recuerda con ella.** Si elegías uno, ibas al tablero y
  volvías, volvía a decir "modelo por omisión" mientras la caja justo abajo todavía tenía lo que
  habías escrito. Ahora se guarda por conversación, al lado del borrador, incluido un modelo
  escrito a mano.
- **Un hook en un evento de máquina ya no pide un agente dos veces.** La acción de "instruir a un agente"
  estaba abajo de un filtro que también listaba agentes, así que el mismo diálogo tenía dos selectores
  de agentes significando cosas distintas. En un evento de la máquina —un reloj, la conexión, un archivo
  que cambia— nada de lo que hizo un agente dispara el hook, así que filtrar por uno solo podía
  significar "nunca te dispares": esas opciones se sacaron de ahí, dejando el selector propio de la
  acción como el único, y un hook que tenía uno cae de vuelta al proyecto de ese agente. El filtro
  ahora también lleva el nombre de lo que hace ("Escucha a").
- **Los links en la respuesta de un agente se llevaban a toda la app a `tauri.localhost`.** Los
  agentes escriben dos tipos de link y la app los trataba como uno solo: una dirección web y una ruta
  adentro del repo en el que trabajan (`src/lib/foo.ts`, `README.md`). La segunda no es algo para
  abrir, y si se la dejaba en un `<a href>`, la ventana de escritorio la seguía: allá se iba a
  `tauri.localhost/src/lib/foo.ts`, con la app desapareciendo de abajo tuyo. Ahora solo las
  direcciones reales son links, y se abren en el navegador de verdad; una ruta de repo queda como
  texto para leer. Un link `javascript:` o `data:` —que un agente puede escribir, queriendo o no—
  nunca llega a ser link para empezar.
- **Un agente no podía cambiar de modelo cuando su padre se lo decía.** A un planificador que
  nombraba un `model` para una tarea solo se le hacía caso mientras "elegir el modelo" estaba prendido
  en Configuración, así que estando apagado —como viene por omisión— un implementador al que se le
  dijo que reintente en otro modelo porque el suyo se quedó sin cuota arrancaba callado en el mismo
  que ya estaba agotado. Un modelo que el padre pide se respeta de ambas formas ahora; ese ajuste
  decide si al planificador *se le dice que elija* uno, no si su elección cuenta. Y que un hijo se
  quede sin cuota ya no le llega al padre como una pared de error de la CLI: se le dice claro, con
  los modelos de esa misma CLI que todavía vale la pena probar —dejando afuera a su propia familia,
  ya que la cuota se gasta por familia— y con el recordatorio de que una tarea puede llevar un
  `model`. Cuando la CLI no tiene otro modelo, se le dice al padre que avise en lugar de reintentar.


## 0.7.0 — 2026-09-08

### Nuevo

- **Las skills se abren cuando corresponden, no se vuelcan en cada corrida.** Una skill viajaba
  entera dentro del prompt de sistema de cada agente que la tuviera activada: cinco skills eran
  cinco manuales en cada corrida, se leyeran o no. Ahora cada una se escribe en
  `.ainess/skills/<nombre>/SKILL.md` y el prompt lleva solo su nombre, una línea de para qué sirve
  y esa ruta — el agente abre la que trata del trabajo que tiene, y lo que la skill necesite (un
  script, una plantilla) puede vivir en la misma carpeta. Esa línea de descripción es con lo que
  decide, y el editor ahora lo dice.
- **Las notificaciones suenan.** Dos notas cortas, subiendo cuando algo te necesita y bajando
  cuando algo terminó, para distinguirlas sin mirar. Las sintetiza la app — ningún archivo en el
  instalador — y suenan igual en la ventana, desde la bandeja (la app sigue viva ahí, que es lo que
  permite que el sonido te llegue) y en el teléfono. Configuración → General las apaga, y su editor
  ajusta las notas, la onda y el volumen, o toma un sonido tuyo.
- **El historial de cada agente, en el proyecto.** `.ainess/history/` recibe un archivo por agente,
  al que se le agrega cada turno cuando termina: quién pidió, qué se pidió y qué volvió, tanto del
  trabajo delegado como de los chats. La app guarda todo en su propio almacenamiento, donde solo
  ella puede leer; esta es la puerta de entrada para un agente que vuelve mañana, y para vos con un
  editor abierto. Cuando el archivo se llena se descartan turnos enteros, nunca medio turno.
- **Las pestañas de terminal se arrastran al orden que quieras**, como en cualquier editor con
  pestañas: la que llevás se atenúa y una línea muestra dónde caería.
- **Hooks con las condiciones de la máquina.** Hasta ahora un hook respondía a algo que hizo un
  agente. Cinco eventos más responden a la máquina: que la app arranque, un reloj (a una hora del
  día o cada tantos minutos), que se corte internet y que vuelva, y que cambie un archivo de la
  carpeta del proyecto — este último montado sobre el watcher que ya estaba, así que el ruido
  (`.git`, `node_modules`, la salida del build) no le llega. Corren mientras la app está abierta,
  como mucho una vez por minuto cada uno, y el proyecto sobre el que actúan es el del filtro del
  hook o el que esté abierto. `approval.requested`, que ya se disparaba, por fin está en la lista.
- **El changelog en tu idioma.** El diálogo que se abre después de actualizar, y Configuración →
  Acerca de, muestran las novedades traducidas. El inglés queda en `CHANGELOG.md` y cada otro
  idioma tiene su archivo, que el chequeo de release mantiene al día con la versión que se publica.
- **Busca versión nueva cada cinco minutos**, no solo al arrancar, así una release publicada con la
  app abierta te llega el mismo día. El mismo ofrecimiento de siempre, y el mismo interruptor en
  Configuración lo apaga.
- **Cortar un turno para decir algo.** Un mensaje esperando a un agente tiene un segundo botón:
  frena lo que está corriendo y le pasa el mensaje ahí mismo. No se repite nada — lo que el agente
  hizo está en disco y lo que dijo está en su sesión, que la corrida siguiente retoma — y se le
  avisa que le cortaron el turno, así no lee el transcript como uno que terminó.
- **Comandos en la caja.** Escribir `/` en el composer vacío abre una lista corta: `/compact` hace
  que todos los agentes del proyecto empiecen una sesión nueva — no se pierde nada, porque a cada
  uno se lo apunta a su archivo de `.ainess/history/` y relee solo lo que el trabajo nuevo
  necesite — y `/cost` abre lo que gastó el proyecto. Cualquier otra cosa en la caja es un mensaje,
  así que «mirá el /compact de Claude» sigue yendo al equipo intacto.

### Arreglado

- **Las instrucciones se le mandaban de nuevo en cada turno.** El preámbulo de un agente — su rol,
  los esquemas de `delegate` y de `ask`, el contexto compartido, el perfil, la lista de skills —
  iba con cada mensaje de una conversación que la CLI ya venía arrastrando. Con Claude eran los
  mismos párrafos facturados turno tras turno; con los proveedores que meten las instrucciones
  adentro del prompt (Antigravity, Copilot, opencode y el resto) además dejaba otra copia en el
  transcript, para siempre, así que una sesión larga lo pagaba muchas veces. Ahora van una sola
  vez, en el turno que abre la sesión. Lo que sigue yendo en cada turno es el tablero, que es la
  parte que cambia.
- Un proyecto abre su carpeta en el explorador, tanto desde el click derecho como desde los tres
  puntos — y esos dos menús ofrecen las mismas acciones en todos lados donde son la misma cosa. La
  ruta del proyecto estaba en el click derecho y no en los puntos, y el «Abrir» de un chat al
  revés.
- Un proyecto ya no puede tener dos orquestadores en la raíz. El diálogo del equipo te pide un
  padre para el segundo, que es donde correspondía: lado a lado los dos leen todo el tablero y
  pueden tomar la misma tarjeta, solo el primero es el destino por omisión del composer, la CLI y
  el teléfono, y el único puntero de «tarea en curso» del proyecto dejaba que uno pisara al otro —
  y la primera tarea quedaba sin su tarjeta movida, sin sus hooks y sin su notificación. Un equipo
  que ya tiene dos te lo dice apenas abrís cualquiera de ellos.
- Cambiarle la CLI a un agente conservaba la sesión de la anterior, y la corrida siguiente le
  pasaba a Antigravity un id de sesión que había abierto Claude — que falla en el acto, porque es
  un nombre que el otro nunca escuchó. Ahora la sesión se descarta cuando cambia la CLI, y cuando
  el agente entra o sale de su propio worktree, que es la otra mitad de a qué está atada.
- El watcher del repositorio ya no despierta con la carpeta `.ainess/` de la propia app: el
  tablero, el equipo y ahora el historial se escriben ahí mientras se trabaja, y un hook de archivo
  habría estado respondiéndole a la app en vez de al usuario.
- Un hook preguntaba dos veces sobre qué aplica: un campo para el agente y otro para el proyecto.
  Ahora es uno solo — todo, un proyecto entero, o un agente adentro — porque un agente pertenece a
  exactamente un proyecto y el par solo podía coincidir o contradecirse hasta no disparar nunca.
- Las listas de agentes que cruzan proyectos — la del agente al que un hook le da la instrucción,
  la del filtro del hook, la de la orden guardada — agrupan los agentes bajo el proyecto de cada
  uno, con su color. Dos proyectos con un «Orquestador» cada uno se leían igual.
- A un agente al que le escribís vos se le dice quién es. Leía el mismo prompt viniera el trabajo
  de su planificador o tuyo, así que un implementador contestaba tu mensaje delegándolo — y después
  se quedaba en «esperando a su equipo».
- Y esa espera se terminó igual: una delegación que nombraba a alguien que no está bajo ese agente
  lo dejaba esperando a un equipo que no venía nunca. Cuando no aterriza ninguna, el agente queda
  libre.
- Un link en la terminal se abre con un click. Antes solo eran links los que la CLI marcaba, y
  encima había que tener Ctrl apretado; ahora cualquier URL de la salida lo es, y abre en el
  navegador de verdad.
- En el teléfono el teclado tapaba la caja en la que estabas escribiendo. La página a propósito no
  se redimensiona cuando el teclado se abre — eso sacaba la conversación de su anclaje de abajo en
  medio del trabajo — así que ahora se acorta la app exactamente lo que ocupa el teclado.
- El toast de «hay una versión nueva» mostraba la nota de la release tal como está escrita, así que
  se leía `[CHANGELOG.md](https://…)`: un toast no tiene markdown con qué renderizarla. Ahora dice
  lo que tiene que decir, y lo que cambió está en el changelog que se abre después de actualizar.
- Un mensaje escrito mientras el agente trabajaba aparecía en Comunicación y en ningún otro lado,
  como si la app se lo hubiera tragado. Ahora se queda al final de la conversación, punteado y con
  un reloj, diciendo a quién espera, y se lo puede sacar antes de que le toque.
- Ese mensaje además podía entregarse demasiado temprano: un agente que delega termina su propia
  corrida antes de que su equipo haya terminado, y la cola se vaciaba ahí — el mensaje corría al
  lado del trabajo al que tenía que seguir. Ahora espera a que el agente esté libre de verdad.

## 0.6.0 — 2026-09-08

### Nuevo

- **Los archivos van con el mensaje.** Un clip en el composer, o Ctrl+V pegando directo en la caja:
  una captura, un PDF, un log. Las imágenes muestran miniatura antes de irse y el resto su nombre y
  tamaño, y a cualquiera se lo puede sacar. Al enviar, el archivo se copia a la carpeta
  `.ainess/attachments/` del propio proyecto y el prompt lleva su ruta — que es lo único que toda
  CLI puede hacer con un adjunto, porque todas leen el repo en el que trabajan.

### Arreglado

- El proyecto con agentes trabajando lo muestra en su propio punto, que late despacio. Antes
  llevaba un contador naranja al lado del nombre, con la misma pinta que algo que espera una
  respuesta tuya — el badge ámbar de abajo del menú, el que sí te necesita, es ahora lo único que
  se ve así.
- Borrar desde el menú del click derecho preguntaba en la píldora de arriba de la ventana, la
  forma pensada para el teléfono, en vez del diálogo. Pasaba solo mientras se trabaja sobre la app,
  y además podía perder la pregunta del todo.
- La lista de `{{` de un hook dice qué guarda cada variable, no solo su nombre, y las flechas la
  hacen scrollear: pasada la octava, la resaltada quedaba abajo del corte.
