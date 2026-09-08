# Novedades

Las versiones anteriores a la 0.6.0 están, en inglés, en el CHANGELOG del repositorio.

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
