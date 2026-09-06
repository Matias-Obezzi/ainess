# Túnel con URL fija (dominio propio / dominio estático)

Repo: C:\Users\matia\Desktop\projects\ais-wt-tunnel (worktree, rama `feat/tunnel-fixed-url`)
Rama: la que esté activa en ese worktree, sin cambiar de rama ni crear otras.

## Objetivo

Que el túnel público pueda publicarse **siempre en la misma URL**, configurable desde
Configuración → Remoto, en vez de la URL efímera que hoy genera cloudflared en cada arranque.

Dos caminos, los dos soportados:

- **ngrok con dominio estático**: el plan gratis de ngrok incluye un (1) dominio estático
  (`algo.ngrok-free.app`) que el usuario reclama en su dashboard. Se usa con
  `ngrok http <port> --url https://algo.ngrok-free.app` y la URL no cambia nunca más.
- **cloudflared con named tunnel**: requiere cuenta de Cloudflare y un dominio propio en
  Cloudflare. El usuario corre una vez `cloudflared tunnel login`,
  `cloudflared tunnel create ainess` y `cloudflared tunnel route dns ainess ainess.midominio.com`;
  después la app levanta `cloudflared tunnel --url http://127.0.0.1:<port> run ainess` y la URL
  pública es siempre `https://ainess.midominio.com`.

El quick tunnel de cloudflared (`trycloudflare.com`) **no** puede tener URL fija por diseño: sigue
siendo el modo por defecto cuando no hay nada configurado.

## Contexto

Leé `PLAN.md` antes de empezar; el túnel está documentado alrededor de las líneas 625-670 y hay que
actualizar esa sección al final.

Cómo funciona hoy:

- `src/types.ts:127` `TunnelConfig { provider, enabled }`, dentro de `RemoteConfig` (`src/types.ts:133`).
- `src/lib/tunnel.ts`: parte compartida y testeada. `tunnelArgs(provider, port)` arma los argumentos,
  `extractTunnelUrl(provider, line)` saca la URL pública de una línea de log,
  `tunnelBinary`, `tunnelInstallCommand`, `tunnelDescription`.
- `src-tauri/src/tunnel.rs`: implementación real en la app. `tunnel_start(provider, port)` (línea 62)
  hace `spawn_blocking(start_process)` (línea 181), lee stdout+stderr con un `mpsc` y espera hasta 30 s
  a que aparezca la URL; `extract_url` (línea 275) es el espejo Rust de `extractTunnelUrl`.
- `src/lib/tunnel-node.ts`: el mismo protocolo con `child_process`, para `ais serve --tunnel`.
- `src/lib/transport.ts:37` declara `tunnelStart(provider, port)`; las implementaciones están en
  `transport-tauri.ts:70` (invoke `tunnel_start`), `transport-null.ts:29` y `transport-remote.ts:40`
  (las dos tiran error, no cambian de firma más que para aceptar el parámetro nuevo).
- `src/lib/remote.ts:264` `startTunnel()` lee `config.remote.tunnel.provider` y llama al transport.
- `src/components/settings/RemoteSection.tsx`: el bloque "Acceso desde afuera (túnel)" con el select
  de proveedor, la detección del binario y el switch.
- `src/cli/main.ts:726` maneja `--tunnel [prov]` en `ais serve`.

## Cambios

### 1. `src/types.ts`

Extender `TunnelConfig` con dos campos opcionales:

```ts
export interface TunnelConfig {
  provider: TunnelProviderId;
  /** Only meaningful while `RemoteConfig.enabled` is true: the tunnel needs the local server. */
  enabled: boolean;
  /**
   * Fixed public hostname, without scheme. ngrok: the static domain of the account
   * (`algo.ngrok-free.app`). cloudflared: the hostname routed to the named tunnel.
   * Empty/undefined means an ephemeral URL.
   */
  domain?: string;
  /** cloudflared only: name (or UUID) of the named tunnel created with `cloudflared tunnel create`. */
  tunnelName?: string;
}
```

No hace falta bumpear `AppConfig.version` (los campos son opcionales y una config vieja sigue siendo
válida). No toques la migración existente.

### 2. `src/lib/tunnel.ts` (lógica compartida, es la que se testea)

Agregar:

```ts
export interface TunnelOptions {
  /** Fixed hostname, with or without scheme; empty means ephemeral. */
  domain?: string;
  /** cloudflared named tunnel. */
  tunnelName?: string;
}

/** `https://Algo.Ngrok-Free.App/` → `algo.ngrok-free.app`. Devuelve "" si no queda nada. */
export function normalizeDomain(input: string | undefined | null): string;

/** true cuando la configuración alcanza para una URL fija con ese proveedor. */
export function hasFixedUrl(provider: TunnelProvider, opts?: TunnelOptions): boolean;
// ngrok: alcanza con `domain`. cloudflared: hacen falta `domain` y `tunnelName`.

/** URL pública que va a tener el túnel cuando la config es fija, o null. */
export function fixedUrl(provider: TunnelProvider, opts?: TunnelOptions): string | null;
// `https://${normalizeDomain(domain)}`
```

`normalizeDomain` saca espacios, el esquema (`http://`, `https://`), barras finales y cualquier path,
y pasa a minúsculas.

`tunnelArgs(provider, port, opts?: TunnelOptions)`:

- ngrok con dominio: `["http", String(port), "--log=stdout", "--log-format=json", "--url", "https://<domain>"]`.
- ngrok sin dominio: como hoy.
- cloudflared con `domain` **y** `tunnelName`: `["tunnel", "--url", "http://127.0.0.1:<port>", "run", "<tunnelName>"]`
  (los flags globales van antes del subcomando `run`; así es como lo acepta cloudflared).
- cloudflared sin eso: como hoy (`["tunnel", "--url", "http://127.0.0.1:<port>"]`).

`extractTunnelUrl(provider, line, opts?: TunnelOptions)`:

- ngrok: igual que hoy (con `--url` el evento `started tunnel` ya trae el dominio estático).
- cloudflared quick: igual que hoy (regex de `trycloudflare.com`).
- cloudflared named: **no** imprime ninguna URL. Hay que detectar que quedó conectado y devolver
  `fixedUrl(...)`. La línea que marca el túnel arriba es la de conexión registrada; aceptá
  `/registered tunnel connection/i` y también `/connection [0-9a-f-]{8,} registered/i`. Cualquier
  otra línea devuelve null.

`tunnelDescription(provider)` pasa a contar el modo fijo:

- cloudflared: "Sin cuenta ni configuración, pero la URL cambia cada vez. Con un named tunnel y un
  dominio tuyo en Cloudflare, la URL queda fija."
- ngrok: "Requiere una cuenta y un authtoken (`ngrok config add-authtoken …`). El plan gratis incluye
  un dominio estático: con eso la URL queda fija."

### 3. `src/lib/transport.ts` + implementaciones

`tunnelStart(provider: string, port: number, opts?: TunnelOptions): Promise<{ url: string }>`.

- `transport-tauri.ts`: `invoke("tunnel_start", { provider, port, domain: opts?.domain ?? null, tunnelName: opts?.tunnelName ?? null })`.
- `transport-node.ts` / `tunnel-node.ts`: pasar las opciones a `tunnelArgs` y a `extractTunnelUrl`.
- `transport-null.ts` y `transport-remote.ts`: solo ajustar la firma, siguen tirando el mismo error.

### 4. `src-tauri/src/tunnel.rs`

- `tunnel_start(app, state, provider, port, domain: Option<String>, tunnel_name: Option<String>)`.
  Tauri manda los argumentos en camelCase desde el front (`tunnelName`), que en Rust es `tunnel_name`:
  el mapeo por defecto ya hace eso, no agregues `rename_all`.
- `start_process(program, provider, port, domain, tunnel_name)` arma los argumentos igual que
  `tunnelArgs` y usa el `extract_url` nuevo.
- `extract_url(provider: &str, line: &str, domain: Option<&str>, tunnel_name: Option<&str>) -> Option<String>`:
  espejo exacto de la versión TS, incluida la detección de "registered tunnel connection" para el
  named tunnel. Normalizá el dominio (sin esquema, sin barra final, minúsculas) también acá.
- `TunnelStatus` suma `fixed: bool` para que la UI pueda mostrarlo (opcional pero preferido); si lo
  agregás, sumalo también al tipo `TunnelStatus` de `src/lib/remote.ts` y al `tunnelStatus` del store.
- Mensajes de error más útiles en `exit_message`:
  - cloudflared, si el tail menciona `origincertificate`, `cert.pem`, `credentials file` o
    `tunnel credentials`: " Falta configurar el named tunnel: corré `cloudflared tunnel login` y
    `cloudflared tunnel create <nombre>`."
  - ngrok, si el tail menciona `domain` junto con `not found`/`not authorized`/`ERR_NGROK_3200`:
    " Ese dominio no está en tu cuenta de ngrok: reclamalo en dashboard.ngrok.com → Domains."
  - Se mantiene el consejo del authtoken que ya existe.
- El timeout de 30 s sube a 45 s **solo** cuando es un named tunnel de cloudflared (tarda más en
  registrar las conexiones). Dejá el resto en 30 s.
- Actualizá los tests `#[cfg(test)]` del archivo: los dos que ya están (pasando `None, None`) más uno
  nuevo que verifique que con `domain` + `tunnel_name` una línea de conexión registrada devuelve
  `https://<domain>` y que una línea cualquiera devuelve `None`.

### 5. `src/lib/remote.ts`

`startTunnel()` pasa las opciones: `getTransport().tunnelStart(remote.tunnel.provider, remote.port, { domain: remote.tunnel.domain, tunnelName: remote.tunnel.tunnelName })`.

### 6. `src/components/settings/RemoteSection.tsx`

Debajo del select de proveedor, un bloque "URL fija (opcional)":

- **ngrok**: un `Input` "Dominio estático" con placeholder `algo.ngrok-free.app` y texto de ayuda:
  "El plan gratis de ngrok incluye un dominio estático. Reclamalo en dashboard.ngrok.com → Domains y
  pegalo acá: la URL pública no cambia más."
- **cloudflared**: dos `Input`, "Nombre del túnel" (placeholder `ainess`) y "Hostname"
  (placeholder `ainess.midominio.com`), con la ayuda: "Necesitás una cuenta de Cloudflare con tu
  dominio. Corré una vez estos comandos y completá los campos:" y abajo un bloque `code` con
  `cloudflared tunnel login`, `cloudflared tunnel create ainess`,
  `cloudflared tunnel route dns ainess ainess.midominio.com`.
- Los valores se guardan con `updateConfig` en `onBlur` y con Enter, normalizando con
  `normalizeDomain` (el nombre del túnel solo `.trim()`).
- Cuando `hasFixedUrl(...)` es true, mostrá un `Badge` "URL fija" al lado del switch y, aunque el
  túnel esté apagado, la URL que va a quedar (`fixedUrl(...)`), para que el usuario pueda guardarla
  en el celular de una vez.
- Si el túnel está corriendo y el usuario cambia alguno de esos campos, reiniciá el túnel solo
  (stop + start) mostrando el indicador `tunnelBusy` que ya existe; si falla, `toast.error` y dejalo
  apagado, igual que hace hoy `toggleTunnel`.
- El estado vacío sigue funcionando igual que hoy (quick tunnel efímero).

### 7. `src/cli/main.ts`

- `ais serve --tunnel [prov]` toma `domain`/`tunnelName` de la config.
- Sumar overrides `--tunnel-domain <dominio>` y `--tunnel-name <nombre>`, que además se guardan en la
  config con `updateConfig` (mismo patrón que ya usa `--tunnel` con `provider`).
- Actualizar la línea de ayuda de `serve` en el `usage` (línea 63) para nombrarlos.

### 8. Tests `src/lib/__tests__/tunnel.test.ts`

Agregá casos para:

- `normalizeDomain`: `"https://Algo.Ngrok-Free.App/"` → `"algo.ngrok-free.app"`, `" "` → `""`,
  `"ainess.midominio.com"` → igual.
- `tunnelArgs("ngrok", 4710, { domain: "algo.ngrok-free.app" })` incluye `--url https://algo.ngrok-free.app`.
- `tunnelArgs("cloudflared", 4710, { domain: "x.midominio.com", tunnelName: "ainess" })` es
  `["tunnel", "--url", "http://127.0.0.1:4710", "run", "ainess"]`.
- `tunnelArgs("cloudflared", 4710, { domain: "x.midominio.com" })` (sin nombre) sigue siendo el quick tunnel.
- `extractTunnelUrl("cloudflared", "<línea de conexión registrada>", { domain, tunnelName })` devuelve
  `https://x.midominio.com`, y una línea cualquiera devuelve null.
- `hasFixedUrl` / `fixedUrl` para los dos proveedores, con y sin datos.

Los tests que ya existen tienen que seguir pasando sin tocarlos.

### 9. `PLAN.md`

Actualizá la sección del túnel (líneas ~625-670): el tipo `TunnelConfig` nuevo, los dos modos de URL
fija con los comandos exactos, la firma nueva de `tunnel_start` y de `tunnelStart`, y cómo se detecta
que el named tunnel quedó arriba (no imprime URL).

## Casos borde y decisiones ya tomadas

- Si el usuario carga `domain` para cloudflared pero no `tunnelName`, **no** es URL fija: se comporta
  como quick tunnel. La UI lo dice ("Falta el nombre del túnel") en vez de fallar al arrancar.
- El dominio se guarda siempre sin esquema; la UI muestra `https://…` cuando corresponde.
- Los campos nuevos son opcionales: una config existente arranca igual que hoy, con URL efímera.
- No hace falta pedirle al usuario el authtoken de ngrok ni credenciales de Cloudflare: eso se
  configura una sola vez con los CLI de cada proveedor, fuera de la app. Nunca guardes ni loguees
  tokens ni credenciales.
- No agregues dependencias nuevas.
- El código va en inglés y la UI en español, como el resto del repo.

## Fuera de alcance

- No toques el servidor remoto (`remote.rs`, `remote.ts`), ni la UI remota (`src/remote/**`), ni el
  logo/los iconos (`src-tauri/icons/**`, `app-icon.svg`): hay otro trabajo en curso sobre eso.
- No cambies el flujo del token ni el QR más allá de que ahora la URL pública puede ser fija.
- Nada de push: solo commits locales.

## Verificación

Desde `C:\Users\matia\Desktop\projects\ais-wt-tunnel`:

```
npx tsc --noEmit
npm test
npm run build:cli
cd src-tauri && cargo check && cargo test
```

Todo tiene que pasar sin warnings nuevos.
