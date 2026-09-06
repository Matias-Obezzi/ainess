# Cuenta de ngrok: authtoken, API key y dominios desde la app

Repo: C:\Users\matia\Desktop\projects\ais-wt-ngrok (worktree, rama `feat/ngrok-account`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

Que en Configuración → Remoto, con el proveedor ngrok elegido, la app pueda:

1. Decir si el usuario ya tiene el **authtoken** configurado en ngrok, y dejarlo configurar desde la
   app (campo de contraseña + botón que corre `ngrok config add-authtoken <token>`).
2. Lo mismo con la **API key** de ngrok, que es otra credencial distinta del authtoken y sirve solo
   para consultar la API de la cuenta.
3. Con la API key cargada, **traer la lista de dominios reservados** de la cuenta y dejar elegir uno
   con un select, en vez de tener que copiarlo a mano del dashboard.

Todo esto es opcional: si el usuario no lo usa, el campo de dominio a mano sigue funcionando igual.

## Contexto

Leé `PLAN.md` antes de empezar. La sección del túnel quedó actualizada en el trabajo anterior
(handoff 024) y hay que sumarle esto.

Lo que ya existe y hay que reusar:

- `src/lib/tunnel.ts`: `normalizeDomain`, `hasFixedUrl`, `fixedUrl`, `tunnelArgs`, `tunnelBinary`.
- `src/components/settings/RemoteSection.tsx`: el bloque "Acceso desde afuera (túnel)" con el select
  de proveedor, el bloque "URL fija (opcional)" (input de dominio para ngrok; nombre + hostname para
  cloudflared), la detección del binario (`getTransport().tunnelDetect()` devuelve la ruta absoluta
  de `ngrok` y de `cloudflared`) y el switch del túnel.
- `src/lib/transport.ts`: ya hay `exec(program, args, cwd?)` → `{ code, stdout, stderr }`,
  `httpGet(url, headers)` → `{ status, body }` y `readHomeFile(relativePath)` → `string | null`.
  `src/lib/quota.ts` es un buen ejemplo de cómo se combinan (corre `gh auth token` y después pega en
  la API de GitHub).
- `src/lib/logger.ts` tiene `maskSecrets`, que hoy tapa `token=…`, `"token":"…"` y `Bearer …`.

Datos verificados de ngrok (no hace falta que los vuelvas a chequear):

- El archivo de configuración en Windows es `%LOCALAPPDATA%\ngrok\ngrok.yml`, o sea,
  `AppData/Local/ngrok/ngrok.yml` relativo al home del usuario.
- `ngrok config check` imprime `Valid configuration file at <ruta>` cuando el archivo existe y es
  válido, y falla con un mensaje de error cuando no.
- `ngrok config add-authtoken <token>` guarda el authtoken; `ngrok config add-api-key <key>` guarda
  la API key. Son dos credenciales distintas.
- La API key **no** valida el authtoken ni al revés. El authtoken solo se puede validar de verdad
  levantando un túnel, así que la app se limita a decir si está presente en el archivo.
- Listar dominios: `GET https://api.ngrok.com/reserved_domains` con los headers
  `Authorization: Bearer <api key>` y `ngrok-version: 2`. La respuesta es JSON con la forma
  `{ "reserved_domains": [ { "id": "...", "domain": "algo.ngrok-free.app", ... } ], "next_page_uri": null }`.
- Links del dashboard: authtoken en `https://dashboard.ngrok.com/get-started/your-authtoken`,
  API keys en `https://dashboard.ngrok.com/api-keys`, dominios en `https://dashboard.ngrok.com/domains`.

## Reglas de seguridad (no negociables)

- El authtoken y la API key **nunca** se guardan en la config de ainess, ni se mandan a ningún lado
  que no sea el CLI de ngrok o `api.ngrok.com`. Viven en el `ngrok.yml` del usuario.
- **Nunca** los escribas en el log (`log.info/…`), ni completos ni parciales, ni dentro de un mensaje
  de error. Si un error del CLI puede traer el valor, pasalo por `maskSecrets` antes de mostrarlo.
- La API key va **solo** en el header `Authorization`, nunca en la URL ni en query params.
- Los inputs son `type="password"` con `autoComplete="off"`.
- No inventes un flujo de login ni pidas usuario y contraseña: el usuario pega credenciales que ya
  tiene en su dashboard.

## Cambios

### 1. `src/lib/transport.ts` + implementaciones: leer un archivo por ruta absoluta

Hoy solo se puede leer relativo al home (`readHomeFile`) o al directorio de config. Para el
`ngrok.yml`, cuya ruta la dice el propio CLI, hace falta leer una ruta absoluta.

Agregá `readFileAbs(path: string): Promise<string | null>` (null si no existe o no se puede leer):

- `src/lib/transport-tauri.ts`: `invoke("read_file_abs", { path })`.
- `src-tauri/src/config.rs`: comando `read_file_abs(path: String) -> Result<Option<String>, String>`,
  igual de simple que `read_home_file` (línea 72). Registralo en el `invoke_handler` de
  `src-tauri/src/lib.rs`, al lado de `config::read_home_file`.
- `src/lib/transport-node.ts`: `fs.readFileSync` con try/catch.
- `src/lib/transport-null.ts` y `src/lib/transport-remote.ts`: devuelven `null`.

### 2. `src/lib/ngrok.ts` (nuevo, puro y testeado)

Sin I/O: solo parsing y constantes, para que se pueda testear con vitest.

```ts
export const NGROK_AUTHTOKEN_URL = "https://dashboard.ngrok.com/get-started/your-authtoken";
export const NGROK_API_KEYS_URL = "https://dashboard.ngrok.com/api-keys";
export const NGROK_DOMAINS_URL = "https://dashboard.ngrok.com/domains";

/** Home-relative fallback when `ngrok config check` cannot be run (Windows). */
export const NGROK_CONFIG_HOME_PATH = "AppData/Local/ngrok/ngrok.yml";

/** `Valid configuration file at C:\...\ngrok.yml` → the path, or null. */
export function parseNgrokConfigPath(output: string): string | null;

/**
 * Which credentials the config file already has, without ever returning their values.
 * Handles both the v2 layout (top level) and the v3 one (under `agent:`), and ignores
 * commented-out lines and keys with an empty value.
 */
export function ngrokConfigKeys(yaml: string | null): { authtoken: boolean; apiKey: boolean };

/** Reads the `api_key` value out of the config file (needed to call the API). null when absent. */
export function ngrokApiKey(yaml: string | null): string | null;

/** `{ reserved_domains: [{ domain }] }` → `["algo.ngrok-free.app"]`. Tolerates a bare array. */
export function parseReservedDomains(body: string): string[];

/** Cheap paste check before shelling out: non-empty, no whitespace, at least 20 chars. */
export function looksLikeNgrokCredential(value: string): boolean;
```

`ngrokApiKey` tiene que sacar comillas simples o dobles alrededor del valor y comentarios al final de
la línea.

### 3. `src/lib/ngrok-account.ts` (nuevo, el que usa el transport)

```ts
export interface NgrokAccountStatus {
  /** Absolute path of ngrok.yml when it could be located. */
  configPath: string | null;
  hasAuthtoken: boolean;
  hasApiKey: boolean;
  /** Message to show when nothing could be read (ngrok missing, exec unavailable…). */
  error?: string;
}

/** Runs `ngrok config check`, reads the file and reports which credentials are there. */
export async function ngrokAccountStatus(ngrokPath: string): Promise<NgrokAccountStatus>;

/** `ngrok config add-authtoken|add-api-key <value>`. Throws with the masked stderr on failure. */
export async function saveNgrokCredential(ngrokPath: string, kind: "authtoken" | "api-key", value: string): Promise<void>;

/** Reserved domains of the account. Throws a clear error when there is no API key or it is rejected. */
export async function ngrokReservedDomains(ngrokPath: string): Promise<string[]>;
```

Detalles:

- `ngrokAccountStatus`: corre `exec(ngrokPath, ["config", "check"])`. Si sale bien, saca la ruta con
  `parseNgrokConfigPath` y lee el archivo con `readFileAbs`. Si no se pudo sacar la ruta, probá
  `readHomeFile(NGROK_CONFIG_HOME_PATH)`. Si no hay archivo, devolvé
  `{ configPath: null, hasAuthtoken: false, hasApiKey: false }` sin `error` (es el caso normal de
  quien recién instala ngrok). `error` es para fallas de verdad, por ejemplo que no se pueda ejecutar
  el binario.
- `saveNgrokCredential`: valida con `looksLikeNgrokCredential` antes de ejecutar y tira
  `new Error("Eso no parece un authtoken de ngrok")` si no pasa. Si el CLI devuelve código distinto de
  cero, tirá el `stderr` pasado por `maskSecrets`.
- `ngrokReservedDomains`: lee el `ngrok.yml`, saca la API key con `ngrokApiKey` y llama a
  `httpGet("https://api.ngrok.com/reserved_domains", { Authorization: "Bearer …", "ngrok-version": "2" })`.
  - Sin API key: `throw new Error("Falta la API key de ngrok")`.
  - HTTP 401/403: `throw new Error("La API key de ngrok no es válida")`.
  - Otro status: `throw new Error("La API de ngrok respondió HTTP <status>")` (sin volcar el body).
  - 200: `parseReservedDomains(body)`.

### 4. `src/lib/logger.ts`

Sumá a `maskSecrets` dos patrones más, por si alguna línea de ngrok se cuela en un log:
`authtoken` y `api_key` seguidos de `:` o `=` y un valor → el valor se reemplaza por `***`.
Los casos que ya andan tienen que seguir andando.

### 5. `src/components/settings/RemoteSection.tsx`

Cuando `provider === "ngrok"`, arriba del input de dominio actual, un bloque "Cuenta de ngrok":

- Una fila de estado por credencial:
  - Authtoken: `Badge` "Configurado" (variant secondary) o "Falta" (variant outline), más un botón
    "Configurar" que muestra un `Input type="password"` y un botón "Guardar".
  - API key: igual, con el subtítulo "Opcional: sirve para traer tus dominios desde acá."
  - Al lado de cada uno, un botón fantasma con ícono de link externo que abre el dashboard
    correspondiente. Usá el mismo helper de apertura externa que ya usa `AboutSection`
    (`@tauri-apps/plugin-opener`, con fallback a `window.open`); si te queda cómodo, extraelo a
    `src/lib/open-external.ts` y que los dos lo usen.
  - Después de guardar bien: `toast.success("Authtoken guardado")`, se limpia el input, se esconde y
    se vuelve a leer el estado.
- Botón "Traer mis dominios", habilitado solo con API key configurada. Al tocarlo:
  - Mientras carga, spinner en el botón.
  - Con resultados: un `Select` "Mis dominios" con la lista; al elegir uno se guarda como
    `remote.tunnel.domain` con la misma función que ya usa el input a mano, así se reinicia el túnel
    si estaba prendido. Si la cuenta tiene exactamente uno y todavía no hay dominio guardado,
    seleccionalo solo.
  - Lista vacía: texto "Tu cuenta no tiene dominios reservados todavía." más el link a Domains.
  - Error: `toast.error` con el mensaje.
- El input manual de dominio se queda como está, debajo, con un texto que aclare que se puede pegar a
  mano.
- Todo este bloque no aparece cuando el proveedor es cloudflared.
- Si `tunnelDetect()` no encontró `ngrok`, mostrá el bloque deshabilitado con el texto que ya existe
  para instalarlo, sin romper nada.

Cuidá que el ancho no rompa el modal: los inputs con `w-72` o `w-full` dentro de su columna, igual
que el resto de la sección.

### 6. Tests

`src/lib/__tests__/ngrok.test.ts`, sobre las funciones puras:

- `parseNgrokConfigPath` con la salida real (`Valid configuration file at C:\Users\x\AppData\Local\ngrok\ngrok.yml`),
  con una salida de error y con texto vacío.
- `ngrokConfigKeys`: archivo v2 (`authtoken: abc` arriba de todo), archivo v3 (bajo `agent:`),
  archivo con la línea comentada (`# authtoken: abc` → false), clave con valor vacío → false, `null` → los dos false.
- `ngrokApiKey`: con comillas, sin comillas, con comentario al final, ausente → null.
- `parseReservedDomains`: objeto normal con dos dominios, array pelado, `{}` → `[]`, JSON inválido → `[]`.
- `looksLikeNgrokCredential`: valor válido true; vacío, con espacios y muy corto false.

Sumá a `src/lib/__tests__/tunnel.test.ts` (o donde está `maskSecrets`) dos casos para los patrones
nuevos: `authtoken: 2abc…` y `api_key: 1xyz…` quedan enmascarados.

Todos los tests que ya existen tienen que seguir pasando sin tocarlos.

### 7. `PLAN.md`

En la sección del túnel, sumá un párrafo sobre la cuenta de ngrok: qué es cada credencial, qué hace
la app con cada una, dónde vive el `ngrok.yml`, el endpoint que se usa para los dominios y la regla
de que las credenciales nunca se guardan en la config de ainess ni van al log.

## Casos borde y decisiones ya tomadas

- La app **no** valida contra el servidor que el authtoken sea correcto: solo dice si está presente.
  Si es inválido, el error real aparece al prender el túnel, que ya muestra el consejo del authtoken.
- Si el usuario tiene ngrok instalado pero nunca corrió nada, no hay `ngrok.yml`: eso es "Falta", no
  un error.
- Guardar una credencial no prende el túnel ni cambia `remote.tunnel.enabled`.
- Elegir un dominio del select equivale a escribirlo en el input: pasa por `normalizeDomain`.
- No agregues dependencias nuevas.
- Código en inglés, UI en español.

## Fuera de alcance

- El logo y los iconos (`app-icon.svg`, `src-tauri/icons/**`, `src/components/Logo.tsx`).
- cloudflared: no hay equivalente de esto para Cloudflare en este plan.
- El CLI (`src/cli/main.ts`): no le agregues subcomandos de ngrok.
- Nada de push: solo commits locales.

## Verificación

Desde `C:\Users\matia\Desktop\projects\ais-wt-ngrok`:

```
npx tsc --noEmit
npm test
npm run build:cli
cd src-tauri && cargo check && cargo test
```

Todo tiene que pasar sin warnings nuevos.
