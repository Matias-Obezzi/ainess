# Novedades

Las versiones anteriores a la 0.6.0 están, en inglés, en el CHANGELOG del repositorio.

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
