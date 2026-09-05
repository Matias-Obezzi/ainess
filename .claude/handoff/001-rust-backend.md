# Backend Rust: config, detección de binarios y registro de comandos

Repo: C:\Users\matia\Desktop\projects\ais
Rama: la activa (main), sin cambiar de rama ni crear otras

## Objetivo
Que `cd src-tauri && cargo check` compile sin errores con los comandos Tauri `spawn_run`, `kill_run`, `running_runs`, `load_config`, `save_config` y `detect_binaries` registrados, más el plugin de diálogo habilitado.

## Contexto
- Leer `PLAN.md` completo (arquitectura y contratos). Sección "Comandos Rust pendientes" y la tabla de detección.
- `src-tauri/src/runner.rs` ya está hecho y compila conceptualmente: define `RunnerState`, `spawn_run`, `kill_run`, `running_runs`. No reescribirlo; solo arreglar errores de compilación si `cargo check` los marca.
- `src-tauri/src/lib.rs` es el scaffold de Tauri con un comando `greet` de ejemplo que hay que borrar.
- `src/types.ts` tiene los tipos TS (`AppConfig`, `BinaryInfo`, `Binaries`) que el front espera; el JSON debe ser camelCase.
- Esta máquina: Claude Code está en `%APPDATA%\Claude\claude-code\<versión>\claude.exe` (hay 2.1.258 y 2.1.260, elegir la más alta); Antigravity CLI está en `%USERPROFILE%\.gemini\bin\agy.exe`. Ninguno está en el PATH.

## Cambios
1. `src-tauri/src/config.rs` (nuevo):
   - `#[tauri::command] pub fn load_config(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String>`: lee `app.path().app_config_dir()?.join("config.json")`; `Ok(None)` si no existe.
   - `#[tauri::command] pub fn save_config(app: tauri::AppHandle, config: serde_json::Value) -> Result<(), String>`: crea la carpeta si falta y escribe `serde_json::to_string_pretty`.
   - Usar `serde_json::Value` a propósito (el tipo vive en TypeScript).
2. `src-tauri/src/detect.rs` (nuevo):
   - `#[derive(Serialize, Clone)] #[serde(rename_all = "camelCase")] pub struct BinaryInfo { pub path: String, pub version: Option<String> }`.
   - `#[tauri::command] pub fn detect_binaries() -> HashMap<String, Option<BinaryInfo>>` con SIEMPRE las 5 claves `claude`, `antigravity`, `copilot`, `gemini`, `codex`.
   - Búsqueda: primero `which::which(nombre)` (nombres: claude, agy, copilot, gemini, codex). Después rutas extra: `claude` → escanear `%APPDATA%\Claude\claude-code\*\claude.exe` y elegir la carpeta con versión semver más alta (comparar por partes numéricas), y `%USERPROFILE%\.local\bin\claude.exe`; `antigravity` → `%USERPROFILE%\.gemini\bin\agy.exe`. Usar el crate `dirs` (`dirs::home_dir()`, `dirs::config_dir()` = APPDATA en Windows) con fallback a `std::env::var`.
   - `version`: ejecutar `<path> --version`, con stdout/stderr en pipe, `creation_flags(0x0800_0000)` en Windows (como hace runner.rs), esperar hasta 5 s con polling `try_wait` + sleep 50 ms, `kill` si se pasa; tomar la primera línea de stdout trimmed; `None` si falla o está vacía. Correr las 5 detecciones en hilos (`std::thread::scope`) para que no tarde 25 s en serie.
3. `src-tauri/src/lib.rs`: borrar `greet`; `mod config; mod detect; mod runner;`; `.manage(runner::RunnerState::default())`; `.plugin(tauri_plugin_opener::init())`, `.plugin(tauri_plugin_dialog::init())`; `invoke_handler(tauri::generate_handler![runner::spawn_run, runner::kill_run, runner::running_runs, config::load_config, config::save_config, detect::detect_binaries])`.
4. `src-tauri/Cargo.toml`: `name = "ais"`, `description = "Orquestador local de agentes de IA"`, `[lib] name = "ais_lib"`; dependencias nuevas: `which = "7"`, `dirs = "6"`, `tauri-plugin-dialog = "2"`. Actualizar `src-tauri/src/main.rs` para llamar `ais_lib::run()`.
5. `src-tauri/tauri.conf.json`: `productName: "ais"`; ventana `title: "AIS - Orquestador de agentes"`, `width: 1400`, `height: 900`, `minWidth: 1000`, `minHeight: 650`. Mantener el resto.
6. `src-tauri/capabilities/default.json`: agregar `"dialog:default"` a `permissions`.

## Casos borde y decisiones ya tomadas
- `RunnerState` tiene un campo privado `children`; `RunnerState::default()` alcanza para `manage`.
- `which` en Windows resuelve `.cmd`/`.exe` vía PATHEXT; no hace falta lógica extra.
- Si `app_config_dir()` falla, devolver `Err(String)` con el mensaje.
- No tocar nada fuera de `src-tauri/` (excepto nada). No tocar `package.json`.
- No ejecutar `npm run tauri dev` ni `cargo run` (abren ventanas). Solo `cargo check` (y `cargo build` si querés).
- La primera compilación descarga y compila muchos crates: puede tardar 5 a 15 minutos. Esperar.

## Fuera de alcance
- Todo lo que esté en `src/` (frontend). Otro plan lo cubre.
- Tests.

## Verificación
Desde la raíz del repo:
```
cd src-tauri && cargo check
```
Debe terminar sin errores. Los warnings de código muerto en runner.rs (si los hay) no importan.
Commitear con mensajes en inglés. No hacer push.
