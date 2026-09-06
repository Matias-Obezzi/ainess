# Atajos, paleta con tareas y diagnóstico del sistema

Repo: C:\Users\matia\Desktop\projects\ais-wt-tools (worktree, rama `feat/tools`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

Tres cosas que hacen la app más manejable y más fácil de arreglar cuando algo no anda.

## Contexto

Leé `PLAN.md` antes de empezar.

- Los atajos están repartidos: `src/App.tsx` (Ctrl+, Ctrl+K, Ctrl+B, Ctrl+\`), el composer
  (`src/components/shell/Composer.tsx`: Ctrl+Enter y Escape) y el terminal
  (`src/components/shell/TerminalView.tsx`: Ctrl+Shift+C/V).
- La paleta es `src/components/shell/SearchPalette.tsx` y ya busca proyectos, chats, agentes y
  secciones de configuración.
- La detección de binarios vive en `src/lib/transport-*.ts` y `src-tauri/src/detect.rs`; la del túnel
  en `tunnelDetect`; el estado del servidor remoto en el store; los logs en `src/lib/logger.ts`;
  la cuenta de ngrok en `src/lib/ngrok-account.ts`.
- El CLI está en `src/cli/main.ts`, con su lista de subcomandos y su texto de ayuda.

Los textos nuevos van al diccionario en los **siete** idiomas (`src/i18n/*.ts`), con las mismas
claves y en el mismo orden. Mirá cómo está hecho antes de agregar.

## Cambios

### 1. Ventana de atajos (Ctrl+/)

Un diálogo que lista todos los atajos, agrupados por zona (General, Proyecto, Composer, Terminal),
con la tecla a la izquierda en un `<kbd>` y la explicación a la derecha.

- La lista sale de **una sola fuente**: `src/lib/shortcuts.ts`, con la definición de cada atajo
  (id, teclas, clave de traducción, grupo). `App.tsx` y el diálogo leen de ahí, así no se
  desincronizan. No hace falta que el manejo de teclas se reescriba entero: alcanza con que la tabla
  sea la fuente de la documentación y que los atajos globales de `App.tsx` se resuelvan mirándola.
- Se abre con Ctrl+/ y desde un ítem nuevo en la paleta.
- Las teclas se muestran con la convención del sistema (Ctrl en Windows y Linux, ⌘ en macOS).

### 2. La paleta encuentra tareas

En `SearchPalette.tsx`, sumá:

- Un grupo "Tareas" que busca por título entre las tareas del proyecto actual (sin acentos, sin
  mayúsculas) y al elegir una abre su detalle en el tablero.
- Una acción "Crear tarea: <lo que escribiste>" cuando hay texto y ninguna tarea coincide exacto, que
  crea la tarea en `backlog` del proyecto actual.
- Una acción "Atajos de teclado" que abre el diálogo del punto 1.

### 3. Diagnóstico del sistema

Una sección nueva en Configuración, "Diagnóstico" (`src/components/settings/DiagnosticsSection.tsx`),
que corre una serie de chequeos y muestra cada uno con su estado (ok / aviso / error), qué encontró y
qué hacer si está mal:

1. **CLIs de agentes**: cuáles se detectaron, con su versión, y cuáles usan los agentes de los
   proyectos pero no están instalados (eso es error, no aviso).
2. **Cuota**: si se pudo leer la de cada proveedor en uso, y el motivo si no.
3. **Acceso remoto**: si está prendido, en qué dirección escucha, y si el puerto configurado está
   libre cuando está apagado.
4. **Túnel**: si están `cloudflared` o `ngrok`, y para ngrok si hay authtoken y API key
   (`ngrokAccountStatus`), sin mostrar nunca los valores.
5. **Logs**: que la carpeta se pueda escribir y cuánto ocupa.
6. **Datos**: cuántos proyectos, agentes, tareas y corridas guardadas hay, y el tamaño de los
   archivos de historial.

Cada chequeo es una función que devuelve `{ id, level, title, detail, hint? }`, todas en
`src/lib/diagnostics.ts`, para poder testear las que son puras y reusarlas desde el CLI. La sección
tiene un botón "Volver a chequear" y otro "Copiar informe", que arma un texto plano con todo (con los
secretos ya enmascarados por `maskSecrets`).

### 4. `ais doctor`

Un subcomando que corre los mismos chequeos e imprime el informe en la terminal, con salida de
código 0 si no hay errores y 1 si hay alguno. Sumalo al texto de ayuda del CLI.

## Casos borde y decisiones ya tomadas

- El diagnóstico es de solo lectura: no arregla nada por su cuenta, solo dice qué hacer.
- Nunca imprime tokens ni claves, ni siquiera parcialmente.
- Si un chequeo no se puede correr en el contexto actual (por ejemplo el navegador), sale como aviso
  con el motivo, no como error.
- No agregues dependencias nuevas.
- Código en inglés, UI traducida a los siete idiomas. El CLI queda en español.

## Fuera de alcance

- La vista del celular (`src/remote/**`).
- Cambiar cómo se manejan hoy las teclas más allá de leer la tabla nueva.
- Nada de push: solo commits locales.

## Verificación

```
npx tsc --noEmit
npm test
npm run build
npm run build:cli
```

Tests obligatorios: la tabla de atajos (que no haya dos con la misma combinación), el formato de
teclas por plataforma, los chequeos puros de `diagnostics.ts`, y la paridad de claves entre los siete
diccionarios.
